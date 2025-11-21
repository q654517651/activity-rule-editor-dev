from __future__ import annotations

from pathlib import Path
import os
import re
import unicodedata
from urllib.parse import unquote
import zipfile
import base64
import mimetypes
import xml.etree.ElementTree as ET
from typing import Dict, Tuple, List, Optional, Callable, Any
import posixpath as pp

# 仅使用 blob 存储方案，不再使用文件导出或 data:URI 内联方案


INVALID = r'<>:"/\\|?*\x00-\x1F'
INVALID_RE = re.compile(f"[{re.escape(INVALID)}]")
RESERVED_WIN = {*(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10)), "con", "prn", "aux", "nul"}
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}


def safe_filename(cell_value: str, mime_hint: Optional[str] = None) -> str:
    raw = unquote(Path(str(cell_value)).name.strip())
    name = unicodedata.normalize("NFC", raw)
    name = INVALID_RE.sub("_", name)
    name = name.strip(" .")
    stem, ext = os.path.splitext(name)
    ext = ext.lower()
    if stem.lower() in RESERVED_WIN:
        stem = f"_{stem}_"
    if not ext or ext not in ALLOWED_EXT:
        if mime_hint:
            if "jpeg" in mime_hint:
                ext = ".jpg"
            elif "png" in mime_hint:
                ext = ".png"
            elif "webp" in mime_hint:
                ext = ".webp"
            elif "gif" in mime_hint:
                ext = ".gif"
            elif "bmp" in mime_hint:
                ext = ".bmp"
            elif "tiff" in mime_hint:
                ext = ".tif"
            else:
                ext = ".png"
        else:
            ext = ".png"
    MAX = 240
    base = (stem[: MAX - len(ext)]) if len(stem) + len(ext) > MAX else stem
    if not base:
        base = "image"
    return base + ext


def _parse_workbook_sheet_target(zf: zipfile.ZipFile, sheet_title: str) -> Optional[str]:
    wb_xml = ET.fromstring(zf.read('xl/workbook.xml'))
    rels = ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
    rid_map = {rel.get('Id'): rel.get('Target') for rel in rels.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship')}
    ns_main = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    ns_rel = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
    for sh in wb_xml.findall(f'.//{ns_main}sheet'):
        name = sh.get('name')
        rid = sh.get(f'{ns_rel}id')
        if name == sheet_title and rid in rid_map:
            target = rid_map[rid]
            return ('xl/' + target.lstrip('/')).replace('xl//','xl/')
    return None


def _parse_sheet_drawing_target(zf: zipfile.ZipFile, sheet_part: str) -> Optional[str]:
    rels_path = f"xl/worksheets/_rels/{Path(sheet_part).name}.rels"
    if rels_path not in zf.namelist():
        return None
    rels = ET.fromstring(zf.read(rels_path))
    for rel in rels.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
        target = rel.get('Target') or ''
        if 'drawings/' in target and target.endswith('.xml'):
            base_dir = pp.dirname(sheet_part)  # e.g., xl/worksheets
            full = pp.normpath(pp.join(base_dir, target))
            return full
    return None


def _anchors_media_map(zf: zipfile.ZipFile, drawing_part: str) -> Dict[Tuple[int,int], str]:
    """Return mapping (row,col)->media_path (e.g., xl/media/image1.png)"""
    out = {}
    dxml = ET.fromstring(zf.read(drawing_part))
    drels_path = drawing_part.replace('drawings/', 'drawings/_rels/') + '.rels'
    if drels_path not in zf.namelist():
        return out
    drels = ET.fromstring(zf.read(drels_path))
    base_dir = pp.dirname(drawing_part)  # e.g., xl/drawings
    rid_to_media: Dict[str, str] = {}
    for rel in drels.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
        rid = rel.get('Id')
        target = rel.get('Target') or ''
        full = pp.normpath(pp.join(base_dir, target))
        if rid:
            rid_to_media[rid] = full
    xdr = '{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}'
    a = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
    anchors = dxml.findall(f'.//{xdr}twoCellAnchor') + dxml.findall(f'.//{xdr}oneCellAnchor')
    for anc in anchors:
        from_tag = anc.find(f'{xdr}from')
        pic = anc.find(f'{xdr}pic')
        if from_tag is None or pic is None:
            continue
        col_el = from_tag.find(f'{xdr}col')
        row_el = from_tag.find(f'{xdr}row')
        if col_el is None or row_el is None:
            continue
        try:
            c0 = int((col_el.text or '0'))
            r0 = int((row_el.text or '0'))
        except ValueError:
            continue
        blip = pic.find(f'{xdr}blipFill')
        bl = None
        if blip is not None:
            bl = blip.find(f'{a}blip')
        if bl is None:
            bl = pic.find(f'.//{a}blip')
        if bl is None:
            continue
        rid = bl.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed') or bl.get('r:embed')
        media = rid_to_media.get(rid)
        if not media:
            continue
        out[(r0+1, c0+1)] = media
    return out


def extract_images_for_result(
    xlsx_path: str,
    result: dict,
    sheet_title: str,
    put_blob: Callable[[bytes, str], str],
) -> Dict[str, str]:
    """
    提取 Excel 中的嵌入图片，使用 blob 存储模式（返回 /media/{hash} URL）

    参数：
      xlsx_path: Excel 文件路径
      result: 解析结果字典（会被原地修改）
      sheet_title: 工作表标题
      put_blob: 回调函数，签名为 (data: bytes, ext: str) -> str，返回 blob 哈希

    返回：
      Dict[str, str]: 文件名 -> /media/{hash} URL 的映射（用于前端参考）

    流程：
      1. 根据 anchors 定位每个奖励项对应的嵌入图片
      2. 通过 put_blob 回调存储图片，获得哈希值
      3. 构造 ImageMeta 对象 {id, url, mime}
      4. 原地修改 result 的 rewards[].image 为 ImageMeta
      5. 清理内部元字段 (_row, _img_col 等)
    """
    images_map: Dict[str, str] = {}

    with zipfile.ZipFile(xlsx_path, 'r') as zf:
        sheet_part = _parse_workbook_sheet_target(zf, sheet_title)
        if not sheet_part:
            print(f"[image_extractor] 未找到工作表: {sheet_title}")
            return images_map

        drawing_part = _parse_sheet_drawing_target(zf, sheet_part)
        if not drawing_part:
            print(f"[image_extractor] 工作表 {sheet_title} 无图片")
            return images_map

        a_map = _anchors_media_map(zf, drawing_part)
        print(f"[image_extractor] 检测到 {len(a_map)} 个锚点")

        for page in (result.get('pages') or []):
            # 支持新结构（blocks）和旧结构（sections）
            sections_to_process = []
            if page.get('blocks'):
                # 新结构：从所有 blocks 中提取 sections
                for block in page.get('blocks', []):
                    sections_to_process.extend(block.get('sections', []))
            else:
                # 旧结构：直接使用 sections
                sections_to_process = page.get('sections', [])

            for sec in sections_to_process:
                # 处理表格中的图片
                table = sec.get('table')
                if table and isinstance(table, dict):
                    rows = table.get('rows') or []
                    for row_list in rows:
                        if not isinstance(row_list, list):
                            continue
                        for cell in row_list:
                            if not isinstance(cell, dict):
                                continue
                            
                            # 检查是否有内部定位字段
                            row = cell.get('_row')
                            col = cell.get('_col')
                            
                            if not row or not col:
                                continue
                            
                            # 按锚点查找嵌入图片（即使单元格没有标记为 is_image，也要检查该位置是否有图片）
                            media = a_map.get((int(row), int(col)))
                            if not media or media not in zf.namelist():
                                # 如果该位置没有图片且单元格标记为 is_image，记录警告
                                if cell.get('is_image'):
                                    print(f"[image_extractor] 警告：表格单元格 ({row}, {col}) 标记为图片但未找到嵌入图片")
                                continue
                            
                            try:
                                data = zf.read(media)
                                ext = os.path.splitext(media)[1].lower() or '.png'
                                
                                # 通过回调存入 blob，获得哈希
                                blob_hash = put_blob(data, ext)
                                
                                # 获取 MIME 类型
                                mime, _ = mimetypes.guess_type(media)
                                if not mime:
                                    mime = 'application/octet-stream'
                                
                                # 构造 ImageMeta
                                image_meta: Dict[str, Any] = {
                                    'id': f'sha256:{blob_hash}',
                                    'url': f'/media/{blob_hash}',
                                    'mime': mime,
                                }
                                
                                # 获取图片尺寸（如果可能）
                                try:
                                    from PIL import Image as PILImage
                                    import io as io_module
                                    img = PILImage.open(io_module.BytesIO(data))
                                    image_meta['w'] = img.width
                                    image_meta['h'] = img.height
                                except:
                                    pass
                                
                                # 清理化文件名用于映射
                                exp = cell.get('_expected') or 'table_image'
                                clean = safe_filename(str(exp), mime)
                                images_map[clean] = image_meta['url']
                                
                                # 回填 result，并标记为图片
                                cell['image'] = image_meta
                                cell['is_image'] = True  # 确保标记为图片
                                
                                print(f"[image_extractor] 已提取表格图片: {clean} -> {blob_hash[:12]}...")
                                
                            except Exception as e:
                                print(f"[image_extractor] 提取表格图片失败: {e}")
                                continue
                        
                        # 清理该行所有单元格的元字段
                        for cell in row_list:
                            if isinstance(cell, dict):
                                for k in list(cell.keys()):
                                    if k.startswith('_'):
                                        cell.pop(k, None)
                
                # 处理奖励中的图片
                rewards = sec.get('rewards') or []
                for r in rewards:
                    # 检查是否有内部定位字段
                    row = r.get('_row')
                    img_col = r.get('_img_col')

                    if not row or not img_col:
                        # 如果当前 image 已是字符串，尝试作为 data: URL 或文件路径处理
                        existing_image = r.get('image')
                        if isinstance(existing_image, str):
                            _process_existing_image_string(existing_image, put_blob, r)
                        continue

                    # 按锚点查找嵌入图片
                    media = a_map.get((int(row), int(img_col)))
                    if not media or media not in zf.namelist():
                        continue

                    try:
                        data = zf.read(media)
                        ext = os.path.splitext(media)[1].lower() or '.png'

                        # 通过回调存入 blob，获得哈希
                        blob_hash = put_blob(data, ext)

                        # 获取 MIME 类型
                        mime, _ = mimetypes.guess_type(media)
                        if not mime:
                            mime = 'application/octet-stream'

                        # 构造 ImageMeta
                        image_meta: Dict[str, Any] = {
                            'id': f'sha256:{blob_hash}',
                            'url': f'/media/{blob_hash}',
                            'mime': mime,
                        }
                        
                        # 获取图片尺寸（如果可能）
                        try:
                            from PIL import Image as PILImage
                            import io as io_module
                            img = PILImage.open(io_module.BytesIO(data))
                            image_meta['w'] = img.width
                            image_meta['h'] = img.height
                        except:
                            pass

                        # 清理化文件名用于映射
                        exp = r.get('_expected') or r.get('name') or 'image'
                        clean = safe_filename(str(exp), mime)
                        images_map[clean] = image_meta['url']

                        # 回填 result
                        r['image'] = image_meta

                        print(f"[image_extractor] 已提取: {clean} -> {blob_hash[:12]}...")

                    except Exception as e:
                        print(f"[image_extractor] 提取图片失败: {e}")
                        continue

                    # 清理元字段
                    for k in list(r.keys()):
                        if k.startswith('_'):
                            r.pop(k, None)

    return images_map


def _process_existing_image_string(
    image_str: str,
    put_blob: Callable[[bytes, str], str],
    reward_obj: dict,
) -> None:
    """
    处理已存在于 reward 中的图片字符串：
    - 如果是 data:image/..., 解码后存入 blob
    - 如果是文件路径，尝试读取后存入 blob

    修改 reward_obj 的 'image' 字段为 ImageMeta 对象（若成功）
    """
    try:
        if image_str.startswith('data:'):
            # 处理 data:image/png;base64,... 格式
            _process_data_url(image_str, put_blob, reward_obj)
        elif os.path.isfile(image_str):
            # 本地文件路径
            _process_file_path(image_str, put_blob, reward_obj)
    except Exception as e:
        print(f"[image_extractor] 处理已存图片字符串失败: {e}")


def _process_data_url(
    data_url: str,
    put_blob: Callable[[bytes, str], str],
    reward_obj: dict,
) -> None:
    """从 data:image/... URL 中提取并存储图片"""
    try:
        parts = data_url.split(',', 1)
        if len(parts) != 2:
            return

        meta_part = parts[0]  # e.g., "data:image/png;base64"
        data_part = parts[1]  # base64 编码的图片数据

        # 解析完整 MIME 类型（e.g., "image/png"）
        mime = 'image/png'  # 默认值
        if 'image/' in meta_part:
            # 从 "data:image/png;base64" 提取 "image/png"
            mime_start = meta_part.find('image/')
            mime_end = meta_part.find(';', mime_start)
            if mime_end == -1:
                mime_end = len(meta_part)
            mime = meta_part[mime_start:mime_end]

        # 推导文件扩展名（从 MIME 的子类型）
        subtype = mime.split('/')[-1].split(';')[0]  # e.g., "png"
        ext = f'.{subtype}'

        # 解码 base64
        data = base64.b64decode(data_part)

        # 存入 blob
        blob_hash = put_blob(data, ext)

        # 构造 ImageMeta
        image_meta: Dict[str, Any] = {
            'id': f'sha256:{blob_hash}',
            'url': f'/media/{blob_hash}',
            'mime': mime,
        }
        reward_obj['image'] = image_meta
        print(f"[image_extractor] 已转换 data:URL ({mime}) -> {blob_hash[:12]}...")

    except Exception as e:
        print(f"[image_extractor] data:URL 解码失败: {e}")


def _process_file_path(
    file_path: str,
    put_blob: Callable[[bytes, str], str],
    reward_obj: dict,
) -> None:
    """从本地文件路径读取并存储图片"""
    try:
        with open(file_path, 'rb') as f:
            data = f.read()

        ext = os.path.splitext(file_path)[1].lower() or '.png'
        mime, _ = mimetypes.guess_type(file_path)
        if not mime:
            mime = 'application/octet-stream'

        blob_hash = put_blob(data, ext)

        image_meta: Dict[str, Any] = {
            'id': f'sha256:{blob_hash}',
            'url': f'/media/{blob_hash}',
            'mime': mime,
        }
        reward_obj['image'] = image_meta
        print(f"[image_extractor] 已加载文件 {file_path} ({mime}) -> {blob_hash[:12]}...")

    except Exception as e:
        print(f"[image_extractor] 文件加载失败 {file_path}: {e}")
