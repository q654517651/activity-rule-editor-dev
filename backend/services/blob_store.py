"""Blob 存储服务 - 集中管理内存中的二进制资源"""
from __future__ import annotations

import hashlib
import mimetypes
from typing import Dict, Tuple, Callable

# 键: SHA256 哈希, 值: (字节数据, MIME 类型, 扩展名)
blob_store: Dict[str, Tuple[bytes, str, str]] = {}


def compute_sha256(data: bytes) -> str:
    """计算字节数据的 SHA-256 哈希"""
    return hashlib.sha256(data).hexdigest()


def get_mime_type(ext: str) -> str:
    """根据扩展名返回 MIME 类型"""
    mime_map = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.tif': 'image/tiff',
        '.tiff': 'image/tiff',
        '.svg': 'image/svg+xml',
    }
    return mime_map.get(ext.lower(), 'application/octet-stream')


def store_blob(data: bytes, ext: str = '.png') -> str:
    """
    存储字节数据到内存 blob 存储，返回其 SHA256 哈希值

    重复的内容会自动去重（相同数据返回相同哈希）
    """
    content_hash = compute_sha256(data)
    if content_hash not in blob_store:
        mime = get_mime_type(ext)
        blob_store[content_hash] = (data, mime, ext)
        print(f"[blob_store] 存储 blob: {content_hash[:12]}... (大小: {len(data)} 字节, MIME: {mime})")
    else:
        print(f"[blob_store] blob 已存在（去重）: {content_hash[:12]}...")
    return content_hash


def get_blob(blob_hash: str) -> Tuple[bytes, str, str] | None:
    """从 blob 存储中获取数据"""
    return blob_store.get(blob_hash)


def clear_blob_store() -> None:
    """清空 blob 存储（仅用于测试）"""
    blob_store.clear()


def get_store_size() -> int:
    """返回存储中的 blob 数量"""
    return len(blob_store)
