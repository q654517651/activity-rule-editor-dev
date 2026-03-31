from __future__ import annotations

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import tempfile
import uvicorn
import io
from openpyxl import load_workbook

from backend.services.excel_parser import parse_file
from backend.services.image_extractor import extract_images_for_result
from backend.services import blob_store as blob_service

# 获取项目根目录
PROJECT_ROOT = Path(__file__).parent.parent.parent
STATIC_DIR = PROJECT_ROOT / "web" / "dist"
WEB_BASE_PATH = "/activity-rule-editor"

app = FastAPI(title="ActivityRuleEditor", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/media/{blob_hash}")
def serve_blob(blob_hash: str):
    """供应 blob 存储中的图片"""
    blob_data = blob_service.get_blob(blob_hash)
    if blob_data is None:
        return JSONResponse({"error": "not found"}, status_code=404)

    data, mime, ext = blob_data
    return StreamingResponse(
        io.BytesIO(data),
        media_type=mime,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "ETag": f'"{blob_hash}"',
            # 允许跨域加载，用于 Canvas 绘图
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
    )


@app.post("/api/parse")
async def parse_excel(
    file: UploadFile = File(...),
    sheet: str | None = Form(None),
):
    """
    解析 Excel 并返回结构化 JSON 和图片引用

    统一返回 sheets 结构：
    {
        "ok": true,
        "sheets": {
            "Sheet1": { "result": {...}, "images": {...} }
        },
        "skipped_sheets": [...],
        "blob_store_size": 10
    }
    """
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            tmp_xlsx = tmpdir_path / "upload.xlsx"
            tmp_xlsx.write_bytes(await file.read())

            # 统一调用多 sheet 解析
            parse_result = parse_file(str(tmp_xlsx), sheet)
            sheets_data = parse_result["sheets"]

            # 为每个有效 sheet 提取图片
            sheets_output = {}
            for sheet_name, sheet_result in sheets_data.items():
                extracted_images = extract_images_for_result(
                    xlsx_path=str(tmp_xlsx),
                    result=sheet_result,
                    sheet_title=sheet_name,
                    put_blob=blob_service.store_blob,
                )

                sheets_output[sheet_name] = {
                    "result": sheet_result,
                    "images": extracted_images
                }

            sheet_count = len(sheets_data)
            skipped_count = len(parse_result["skipped_sheets"])
            print(f"[后端] 解析完成: {sheet_count} 个有效 sheet, {skipped_count} 个跳过")
            if parse_result["skipped_sheets"]:
                print(f"[后端] 跳过的 sheet: {', '.join(parse_result['skipped_sheets'])}")

            return JSONResponse({
                "ok": True,
                "sheets": sheets_output,
                "skipped_sheets": parse_result["skipped_sheets"],
                "blob_store_size": blob_service.get_store_size(),
            })
    except Exception as e:
        print(f"[后端] 解析错误: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# 向后兼容别名（保持旧 URL 可用）
app.add_api_route("/parse", parse_excel, methods=["POST"])


# 挂载静态文件（API 路由之后，避免冲突）
if STATIC_DIR.exists():
    @app.get("/")
    async def root():
        return RedirectResponse(url=f"{WEB_BASE_PATH}/", status_code=307)

    # 直接挂载整个前端构建目录，自动处理 SPA 路由与静态资源
    app.mount(WEB_BASE_PATH, StaticFiles(directory=str(STATIC_DIR), html=True), name="web-app")

    # 挂载静态资源目录（JS、CSS、图片等）
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # 挂载根目录的静态文件（favicon.ico, vite.svg 等）
    # 使用 StaticFiles 挂载整个 dist 目录，但排除 index.html（由 SPA 路由处理）
    @app.get("/favicon.ico")
    async def favicon():
        # 首先尝试根目录的 favicon.ico
        favicon_path = STATIC_DIR / "favicon.ico"
        if favicon_path.exists():
            return FileResponse(favicon_path)

        # 如果不存在，查找 assets 目录中带哈希的 favicon 文件
        assets_dir = STATIC_DIR / "assets"
        if assets_dir.exists():
            # 查找所有以 favicon 开头的 .ico 文件
            for favicon_file in assets_dir.glob("favicon*.ico"):
                return FileResponse(favicon_file)

        return JSONResponse({"error": "not found"}, status_code=404)

    @app.get(f"{WEB_BASE_PATH}/favicon.ico")
    async def favicon_prefixed():
        return await favicon()

    @app.get("/vite.svg")
    async def vite_svg():
        svg_path = STATIC_DIR / "vite.svg"
        if svg_path.exists():
            return FileResponse(svg_path)
        return JSONResponse({"error": "not found"}, status_code=404)

    @app.get(f"{WEB_BASE_PATH}/vite.svg")
    async def vite_svg_prefixed():
        return await vite_svg()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
