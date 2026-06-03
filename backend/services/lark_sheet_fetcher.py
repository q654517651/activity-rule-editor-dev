"""飞书表格抓取器。

通过本机已登录的 `lark-cli` 调用飞书开放 API，从一个飞书 sheet/wiki 链接：
  1. 解析 URL → (spreadsheet_token, sheet_id?)
  2. 把 wiki 节点 resolve 成实际的 spreadsheet_token
  3. 导出 XLSX 到本地（供 excel_parser 解析结构）
  4. 读取每个图片单元格的 fileToken + (row, col)
  5. 用 drive medias download 拉回原始 PNG（保留透明度）

鉴权：依赖本机 lark-cli 的 user OAuth token（`lark-cli auth login` 后存在 ~/.lark-cli/）。
不在后端持久化任何 token；只是通过 subprocess 复用 lark-cli 的现有凭证。
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse, parse_qs


LARK_CLI = "lark-cli"
DEFAULT_TIMEOUT_SECONDS = 60


class LarkApiError(Exception):
    """所有 lark-cli 调用相关的失败都包成这个异常"""

    def __init__(self, message: str, *, stdout: str = "", stderr: str = ""):
        super().__init__(message)
        self.stdout = stdout
        self.stderr = stderr


@dataclass
class ParsedLarkUrl:
    """解析后的飞书 URL"""

    # docs/wiki/sheets 等 token；wiki 类型时是 wiki 节点 token，否则是 spreadsheet token
    token: str
    # URL 类型: "sheets" | "wiki" | "shared"（其他类型一律拒绝）
    kind: str
    # 可选的 sheet_id（query 或 hash 里带的）
    sheet_id: Optional[str] = None


# ---------- 0. URL 解析 ----------

_URL_RE = re.compile(
    r"https?://[\w.-]+\.feishu\.\w+/(?P<kind>sheets|wiki|docs)/(?P<token>[A-Za-z0-9]+)",
    re.IGNORECASE,
)


def parse_lark_url(url: str) -> ParsedLarkUrl:
    """从飞书表格/wiki 链接里抽出 token 和可选 sheet_id。

    支持格式:
      - https://xxx.feishu.cn/sheets/<token>?sheet=<sheet_id>
      - https://xxx.feishu.cn/sheets/<token>
      - https://xxx.feishu.cn/wiki/<wiki_token>?sheet=<sheet_id>
      - https://xxx.feishu.cn/wiki/<wiki_token>?from=from_copylink
    """
    url = (url or "").strip()
    if not url:
        raise LarkApiError("URL 为空")

    m = _URL_RE.search(url)
    if not m:
        raise LarkApiError(
            f"无法识别飞书表格链接，仅支持 /sheets/、/wiki/、/docs/ 路径: {url}"
        )

    kind = m.group("kind").lower()
    token = m.group("token")

    # 解析 sheet_id（query 或 hash）
    parsed = urlparse(url)
    sheet_id: Optional[str] = None
    qs = parse_qs(parsed.query)
    if "sheet" in qs and qs["sheet"]:
        sheet_id = qs["sheet"][0]
    elif parsed.fragment:
        # 一些场景下 sheet_id 放在 hash 后面，如 #sheet_id
        sheet_id = parsed.fragment

    return ParsedLarkUrl(token=token, kind=kind, sheet_id=sheet_id)


# ---------- 1. 通用 lark-cli 调用封装 ----------


def _run_lark(
    args: List[str],
    *,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    cwd: Optional[Path] = None,
) -> Dict[str, Any]:
    """运行一条 lark-cli 命令，返回解析后的 JSON 结果。

    cwd: 工作目录。lark-cli 的 `--output`/`--output-path` 必须是相对路径，
         需要切换到目标目录后再传文件名。
    """
    cmd = [LARK_CLI, *args]
    print(f"[lark] (cwd={cwd or '.'}) $ {' '.join(cmd)}")
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            cwd=str(cwd) if cwd else None,
        )
    except FileNotFoundError as exc:
        raise LarkApiError(
            "未安装 lark-cli，请先 `npm i -g @larksuiteoapi/lark-cli` 并执行 `lark-cli auth login`"
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise LarkApiError(f"lark-cli 调用超时（>{timeout}s）: {' '.join(args)}") from exc

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""

    # lark-cli 通常把 JSON 输出到 stdout；下载/导出类失败时也可能写到 stderr
    payload_source = stdout if stdout.strip() else stderr
    try:
        result = json.loads(payload_source) if payload_source.strip() else {}
    except json.JSONDecodeError:
        # JSON 解析失败但有 stdout：原样报；否则按 returncode 报错
        msg = f"lark-cli 返回非 JSON: {payload_source[:300]}" if payload_source else f"lark-cli 非 0 返回 (rc={proc.returncode})"
        raise LarkApiError(msg, stdout=stdout, stderr=stderr)

    # 飞书原生 API 用 code 标识成功/失败；lark-cli 包装后还有 ok / error
    if isinstance(result, dict):
        if result.get("ok") is False:
            err = result.get("error") or {}
            err_type = err.get("type") if isinstance(err, dict) else ""
            err_msg = err.get("message") if isinstance(err, dict) else str(err)
            # 把 error type 透出来，让上层能识别 rate_limit 等重试场景
            exc = LarkApiError(
                f"lark-cli 失败: {err_msg or payload_source[:200]}",
                stdout=stdout, stderr=stderr,
            )
            setattr(exc, "error_type", err_type or "")
            raise exc
        # 部分命令返回 {"code": ..., "data": ...} 不带 ok
        if "code" in result and result.get("code") not in (0, None):
            raise LarkApiError(
                f"飞书 API 失败 code={result.get('code')} msg={result.get('msg')}",
                stdout=stdout, stderr=stderr,
            )

    # 兜底：returncode 非 0 但 stdout/stderr 没给 JSON 错误
    if proc.returncode != 0:
        raise LarkApiError(
            f"lark-cli 退出码 {proc.returncode}; stderr={stderr[:300]}",
            stdout=stdout, stderr=stderr,
        )

    return result


# ---------- 2. wiki 节点解析 ----------


def resolve_wiki_node(wiki_token: str) -> Tuple[str, str]:
    """把 wiki 节点 token 解析成 (obj_token, obj_type)。

    obj_type 应该是 'sheet' 才能继续走表格流程，否则报错。
    """
    params = json.dumps({"token": wiki_token})
    result = _run_lark([
        "wiki", "spaces", "get_node",
        "--params", params,
        "--as", "user",
    ])

    node = (result.get("data") or {}).get("node") or {}
    obj_token = node.get("obj_token")
    obj_type = node.get("obj_type")

    if not obj_token:
        raise LarkApiError(f"wiki 节点未返回 obj_token: {result}")
    if obj_type != "sheet":
        raise LarkApiError(f"wiki 节点不是电子表格（obj_type={obj_type}），暂不支持")

    return obj_token, obj_type


# ---------- 3. 获取 sheet 列表 ----------


@dataclass
class SheetInfo:
    sheet_id: str
    title: str
    row_count: int
    column_count: int
    index: int


def list_sheets(spreadsheet_token: str) -> List[SheetInfo]:
    result = _run_lark([
        "sheets", "+info",
        "--spreadsheet-token", spreadsheet_token,
        "--as", "user",
    ])
    sheets = (((result.get("data") or {}).get("sheets") or {}).get("sheets")) or []
    out: List[SheetInfo] = []
    for s in sheets:
        grid = s.get("grid_properties") or {}
        out.append(SheetInfo(
            sheet_id=s.get("sheet_id") or "",
            title=s.get("title") or "",
            row_count=int(grid.get("row_count") or 0),
            column_count=int(grid.get("column_count") or 0),
            index=int(s.get("index") or 0),
        ))
    out.sort(key=lambda x: x.index)
    return out


# ---------- 4. 导出 XLSX ----------


def export_xlsx(spreadsheet_token: str, output_path: Path) -> Path:
    """把整个 spreadsheet 导出成 xlsx 到本地（包含所有 sheet）。

    注意：lark-cli 强制要求 `--output-path` 是相对路径，所以这里要切换 cwd。
    """
    output_path = Path(output_path).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    # 删除可能已存在的旧文件（lark-cli 没有 --overwrite for sheets +export）
    if output_path.exists():
        output_path.unlink()

    _run_lark(
        [
            "sheets", "+export",
            "--spreadsheet-token", spreadsheet_token,
            "--file-extension", "xlsx",
            "--output-path", f"./{output_path.name}",
            "--as", "user",
        ],
        timeout=180,
        cwd=output_path.parent,
    )

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise LarkApiError(f"xlsx 导出失败，文件不存在或为空: {output_path}")
    return output_path


# ---------- 5. 读取单元格里的图片 fileToken ----------


def _col_index_to_letter(n: int) -> str:
    """1->A, 26->Z, 27->AA"""
    if n < 1:
        raise ValueError(f"col index must be >= 1, got {n}")
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(r + ord("A")) + s
    return s


def collect_image_file_tokens(
    spreadsheet_token: str,
    sheet_id: str,
    row_count: int,
    column_count: int,
) -> Dict[Tuple[int, int], str]:
    """读取整张 sheet（Formula 模式），返回 (row, col) -> fileToken 映射。

    row 和 col 是 1 起始（与 openpyxl 一致）。
    """
    if row_count <= 0 or column_count <= 0:
        return {}

    last_col_letter = _col_index_to_letter(column_count)
    rng = f"{sheet_id}!A1:{last_col_letter}{row_count}"

    result = _run_lark(
        [
            "sheets", "+read",
            "--spreadsheet-token", spreadsheet_token,
            "--range", rng,
            "--value-render-option", "Formula",
            "--as", "user",
        ],
        timeout=120,
    )

    values = (((result.get("data") or {}).get("valueRange") or {}).get("values")) or []
    out: Dict[Tuple[int, int], str] = {}
    for r_idx, row in enumerate(values):
        if not isinstance(row, list):
            continue
        for c_idx, cell in enumerate(row):
            file_token = _extract_file_token(cell)
            if file_token:
                # +1 把 0 起始改成 1 起始（与 image_extractor.py 内 anchor 一致）
                out[(r_idx + 1, c_idx + 1)] = file_token
    return out


def _extract_file_token(cell: Any) -> Optional[str]:
    """从单元格值里抽取 fileToken。Formula 模式下嵌入图片是一个 dict。"""
    if isinstance(cell, dict):
        ft = cell.get("fileToken")
        if isinstance(ft, str) and ft:
            return ft
    if isinstance(cell, list):
        for elem in cell:
            ft = _extract_file_token(elem)
            if ft:
                return ft
    return None


# ---------- 6. 下载原图（PNG）----------


def download_sheet_image(
    spreadsheet_token: str,
    file_token: str,
    output_path: Path,
) -> Tuple[Path, str]:
    """通过 drive medias download 下载 sheet 内嵌图片原图。

    返回 (output_path, content_type)。content_type 一般是 'image/png'。
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    extra = json.dumps({
        "bizType": "sheet_image",
        "tokenInfo": {
            "objectType": "sheet",
            "objectToken": spreadsheet_token,
        },
    })
    params = json.dumps({"extra": extra})

    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    # lark-cli api 没有 --overwrite，存在就先删；且 --output 必须是相对路径
    if output_path.exists():
        output_path.unlink()

    result = _run_lark(
        [
            "api", "GET",
            f"/open-apis/drive/v1/medias/{file_token}/download",
            "--params", params,
            "--as", "user",
            "--output", f"./{output_path.name}",
        ],
        timeout=60,
        cwd=output_path.parent,
    )

    content_type = "application/octet-stream"
    if isinstance(result, dict):
        ct = result.get("content_type")
        if isinstance(ct, str) and ct:
            content_type = ct

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise LarkApiError(f"图片下载失败，文件不存在或为空: file_token={file_token}")

    return output_path, content_type


# ---------- 7. 高层便捷封装 ----------


def resolve_to_spreadsheet_token(parsed: ParsedLarkUrl) -> str:
    """把任意 ParsedLarkUrl 解析成 spreadsheet_token。"""
    if parsed.kind == "sheets":
        return parsed.token
    if parsed.kind == "wiki":
        obj_token, _ = resolve_wiki_node(parsed.token)
        return obj_token
    raise LarkApiError(f"暂不支持的链接类型: {parsed.kind}")


# ---------- 8. 把原图注入 result（替换 XLSX 内可能丢失透明的 JPEG） ----------


import concurrent.futures  # noqa: E402
import mimetypes  # noqa: E402  放在末尾避免影响上方导入顺序
import os  # noqa: E402
import tempfile  # noqa: E402
import time  # noqa: E402
from typing import Callable  # noqa: E402


# 默认并发数。实测 4 是最佳：
#   - 串行 ~0.6s/张 → 8张 4.9s
#   - 并发 4 ~1.2s（4倍提速）
#   - 并发 8 触发飞书 API 限频（code 99991400），多数请求失败
# 可通过环境变量 LARK_DOWNLOAD_CONCURRENCY 调整（建议 2-4）。
_DEFAULT_DL_CONCURRENCY = int(os.environ.get("LARK_DOWNLOAD_CONCURRENCY", "4"))
# 单张图片限频时的最大重试次数（每次重试延长等待）
_RATE_LIMIT_MAX_RETRIES = 3


def inject_lark_originals_into_result(
    *,
    result: dict,
    spreadsheet_token: str,
    file_tokens: Dict[Tuple[int, int], str],
    put_blob: Callable[[bytes, str], str],
    max_workers: Optional[int] = None,
) -> int:
    """对 result 里所有表格/奖励单元格，按 (row, col) 查 fileToken：
    - 若有 → 下载飞书原图（PNG）→ put_blob → 写到 cell/reward 的 image 字段
    - 同时清掉 _row/_col/_img_col 等内部字段，让后续 extract_images_for_result 跳过

    优化:
      - 先收集所有目标，按 fileToken 去重，确定真正要下载的唯一图片集合
      - 用 ThreadPoolExecutor 并发下载（默认 8 个）
      - 下载完成后一次性注入

    返回成功注入的单元格数。
    """
    if not file_tokens:
        return 0

    workers = max_workers or _DEFAULT_DL_CONCURRENCY

    # 1) 扫描 result，收集所有需要注入的目标，记录 (kind, obj_ref, file_token)
    targets: List[Tuple[str, dict, str]] = []
    for page in (result.get("pages") or []):
        sections_to_process: List[dict] = []
        if page.get("blocks"):
            for block in page.get("blocks", []):
                sections_to_process.extend(block.get("sections", []))
        else:
            sections_to_process = page.get("sections", []) or []

        for sec in sections_to_process:
            # 表格单元格
            table = sec.get("table")
            if isinstance(table, dict):
                for row_list in (table.get("rows") or []):
                    if not isinstance(row_list, list):
                        continue
                    for cell in row_list:
                        if not isinstance(cell, dict):
                            continue
                        row = cell.get("_row")
                        col = cell.get("_col")
                        if not row or not col:
                            continue
                        ft = file_tokens.get((int(row), int(col)))
                        if ft:
                            targets.append(("cell", cell, ft))

            # 奖励
            for r in (sec.get("rewards") or []):
                row = r.get("_row")
                img_col = r.get("_img_col")
                if not row or not img_col:
                    continue
                ft = file_tokens.get((int(row), int(img_col)))
                if ft:
                    targets.append(("reward", r, ft))

    if not targets:
        return 0

    # 2) fileToken 去重 → 真正要下载的唯一集合
    unique_tokens = sorted({ft for _, _, ft in targets})
    print(
        f"[lark-inject] 待注入 {len(targets)} 个单元格，去重后 {len(unique_tokens)} 张唯一图片"
        f"，并发 {workers} 路下载"
    )

    # 3) 并发下载并存 blob，得 token → meta 映射
    token_to_meta: Dict[str, Dict[str, Any]] = {}
    t0 = time.monotonic()

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        future_to_token = {
            ex.submit(_download_one_to_meta, spreadsheet_token, ft, put_blob): ft
            for ft in unique_tokens
        }
        completed = 0
        for fut in concurrent.futures.as_completed(future_to_token):
            ft = future_to_token[fut]
            completed += 1
            try:
                meta = fut.result(timeout=120)
            except Exception as exc:
                print(f"[lark-inject] 下载异常 file_token={ft}: {exc}")
                continue
            if meta is None:
                continue
            token_to_meta[ft] = meta
            if completed % 5 == 0 or completed == len(unique_tokens):
                print(
                    f"[lark-inject] 进度 {completed}/{len(unique_tokens)} "
                    f"已用 {time.monotonic() - t0:.1f}s"
                )

    dt = time.monotonic() - t0
    print(
        f"[lark-inject] 下载完成：{len(token_to_meta)}/{len(unique_tokens)} 张成功，"
        f"耗时 {dt:.1f}s（平均 {dt / max(1, len(unique_tokens)):.2f}s/张）"
    )

    # 4) 把 meta 写回所有目标
    injected = 0
    for kind, obj_ref, ft in targets:
        meta = token_to_meta.get(ft)
        if not meta:
            continue
        obj_ref["image"] = meta
        if kind == "cell":
            obj_ref["is_image"] = True
        for k in list(obj_ref.keys()):
            if k.startswith("_"):
                obj_ref.pop(k, None)
        injected += 1

    return injected


def _download_one_to_meta(
    spreadsheet_token: str,
    file_token: str,
    put_blob: Callable[[bytes, str], str],
) -> Optional[Dict[str, Any]]:
    """下载单张图片 → put_blob → 返回 ImageMeta 字典。失败时返回 None。

    这个函数是线程安全的：临时文件名唯一、put_blob 通过 SHA256 哈希存储天然幂等。
    遇到飞书 rate_limit 错误时会自动指数退避重试。
    """
    tmp_path: Optional[Path] = None
    data: Optional[bytes] = None
    content_type = "image/png"

    try:
        # 重试循环：限频时退避，其他错误立即放弃
        for attempt in range(_RATE_LIMIT_MAX_RETRIES + 1):
            try:
                with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
                    tmp_path = Path(tmp.name)
                path, content_type = download_sheet_image(spreadsheet_token, file_token, tmp_path)
                data = path.read_bytes()
                break
            except LarkApiError as exc:
                error_type = getattr(exc, "error_type", "")
                if error_type == "rate_limit" and attempt < _RATE_LIMIT_MAX_RETRIES:
                    backoff = (attempt + 1) * 1.0  # 1s, 2s, 3s
                    print(
                        f"[lark-inject] file_token={file_token[:12]}... 限频，"
                        f"第 {attempt + 1} 次重试前等待 {backoff:.1f}s"
                    )
                    time.sleep(backoff)
                    continue
                print(f"[lark-inject] 下载失败 file_token={file_token}: {exc}")
                return None
    finally:
        if tmp_path is not None and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass

    if data is None:
        return None

    ext, mime = _sniff_image_format(data, content_type)
    blob_hash = put_blob(data, ext)
    meta: Dict[str, Any] = {
        "id": f"sha256:{blob_hash}",
        "url": f"/media/{blob_hash}",
        "mime": mime,
    }
    # 尽量拿宽高
    try:
        from PIL import Image as PILImage
        import io as _io
        img = PILImage.open(_io.BytesIO(data))
        meta["w"] = img.width
        meta["h"] = img.height
    except Exception:
        pass
    return meta


def _sniff_image_format(data: bytes, content_type_hint: str = "") -> Tuple[str, str]:
    """按字节头识别图片真实格式，返回 (ext, mime)。"""
    if data[:4] == b"\x89PNG":
        return ".png", "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg", "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif", "image/gif"
    if data[:4] == b"RIFF" and len(data) >= 12 and data[8:12] == b"WEBP":
        return ".webp", "image/webp"
    if data[:2] == b"BM":
        return ".bmp", "image/bmp"
    # 兜底：用 content_type_hint
    if content_type_hint:
        ext = mimetypes.guess_extension(content_type_hint) or ".bin"
        return ext, content_type_hint
    return ".bin", "application/octet-stream"
