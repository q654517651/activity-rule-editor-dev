from __future__ import annotations

from fastapi import FastAPI, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from typing import Optional
import tempfile
import uvicorn
import io
from openpyxl import load_workbook

from backend.services.excel_parser import parse_file
from backend.services.image_extractor import extract_images_for_result
from backend.services import blob_store as blob_service
from backend.services import lark_sheet_fetcher as lark_fetcher
from backend.services.lark_sheet_fetcher import LarkApiError

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
# 生产构建别名：前端 build 时 VITE_API_BASE='/activity-rule-editor'，
# 所有请求会带 /activity-rule-editor 前缀
app.add_api_route(f"{WEB_BASE_PATH}/api/parse", parse_excel, methods=["POST"])
app.add_api_route(
    f"{WEB_BASE_PATH}/media/{{blob_hash}}",
    serve_blob,
    methods=["GET", "HEAD", "OPTIONS"],
)


@app.post("/api/parse_from_lark")
async def parse_from_lark(payload: dict = Body(...)):
    """从飞书表格链接解析，并用飞书 API 拉回的原图（PNG）替换 XLSX 内可能丢失透明度的图片。

    请求体：
      { "url": "https://xxx.feishu.cn/wiki/...", "sheet": "Rule page" (可选) }

    返回格式与 /api/parse 完全相同。

    鉴权：依赖宿主机的 lark-cli user OAuth token（先在服务器跑 `lark-cli auth login`）。
    """
    url: str = (payload.get("url") or "").strip()
    requested_sheet: Optional[str] = payload.get("sheet") or None

    if not url:
        return JSONResponse({"ok": False, "error": "url 不能为空"}, status_code=400)

    try:
        # 1) 解析 URL → spreadsheet_token
        parsed = lark_fetcher.parse_lark_url(url)
        spreadsheet_token = lark_fetcher.resolve_to_spreadsheet_token(parsed)
        print(f"[lark] 解析到 spreadsheet_token={spreadsheet_token} (来源: {parsed.kind})")

        # 2) 拿 sheet 列表（用于读单元格时计算范围）
        sheets_info = lark_fetcher.list_sheets(spreadsheet_token)
        if not sheets_info:
            return JSONResponse({"ok": False, "error": "该电子表格没有任何 sheet"}, status_code=400)
        sheets_meta_by_title = {s.title: s for s in sheets_info}

        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            tmp_xlsx = tmpdir_path / "lark_export.xlsx"

            # 3) 导出 XLSX 到本地
            lark_fetcher.export_xlsx(spreadsheet_token, tmp_xlsx)

            # 4) 跑现有 excel_parser 拿结构
            parse_result = parse_file(str(tmp_xlsx), requested_sheet)
            sheets_data = parse_result["sheets"]

            # 5) 对每个有效 sheet：先用 lark API 注入原图，再跑 extract（兜底）
            sheets_output = {}
            for sheet_name, sheet_result in sheets_data.items():
                meta = sheets_meta_by_title.get(sheet_name)
                injected = 0
                if meta:
                    try:
                        file_tokens = lark_fetcher.collect_image_file_tokens(
                            spreadsheet_token,
                            meta.sheet_id,
                            meta.row_count,
                            meta.column_count,
                        )
                        injected = lark_fetcher.inject_lark_originals_into_result(
                            result=sheet_result,
                            spreadsheet_token=spreadsheet_token,
                            file_tokens=file_tokens,
                            put_blob=blob_service.store_blob,
                        )
                        print(f"[lark] sheet '{sheet_name}': 注入 {injected} 张原图（共发现 {len(file_tokens)} 个图片单元格）")
                    except LarkApiError as exc:
                        print(f"[lark] sheet '{sheet_name}' 拉原图失败，降级为 XLSX 内图片: {exc}")

                # 兜底：对没注入到的 cell/reward 用 XLSX 内的图片
                extracted_images = extract_images_for_result(
                    xlsx_path=str(tmp_xlsx),
                    result=sheet_result,
                    sheet_title=sheet_name,
                    put_blob=blob_service.store_blob,
                )

                sheets_output[sheet_name] = {
                    "result": sheet_result,
                    "images": extracted_images,
                    "_lark_injected": injected,
                }

            sheet_count = len(sheets_data)
            skipped_count = len(parse_result["skipped_sheets"])
            print(f"[lark] 解析完成: {sheet_count} 个有效 sheet, {skipped_count} 个跳过")

            return JSONResponse({
                "ok": True,
                "sheets": sheets_output,
                "skipped_sheets": parse_result["skipped_sheets"],
                "blob_store_size": blob_service.get_store_size(),
                "source": {
                    "kind": parsed.kind,
                    "spreadsheet_token": spreadsheet_token,
                    "url": url,
                },
            })
    except LarkApiError as exc:
        print(f"[lark] 飞书 API 失败: {exc}")
        return JSONResponse({"ok": False, "error": f"飞书 API 调用失败: {exc}"}, status_code=400)
    except Exception as exc:
        print(f"[lark] 未预期错误: {exc}")
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)


# 生产构建别名：前端 build 后 fetch 会带 /activity-rule-editor 前缀
app.add_api_route(
    f"{WEB_BASE_PATH}/api/parse_from_lark",
    parse_from_lark,
    methods=["POST"],
)


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
