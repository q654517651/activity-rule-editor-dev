/**
 * Blob 存储服务 - 内存存储图片数据
 */
import crypto from 'crypto';
import mime from 'mime-types';

// 内存存储：Map<hash, { data: Buffer, mime: string, ext: string }>
const blobStore = new Map();

/**
 * 计算数据的 SHA256 哈希
 */
export function computeSHA256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * 根据扩展名获取 MIME 类型
 */
export function getMimeType(ext) {
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.svg': 'image/svg+xml',
  };
  return mimeMap[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * 存储 blob 数据，返回哈希值
 */
export function storeBlob(data, ext = '.png') {
  const hash = computeSHA256(data);
  
  if (!blobStore.has(hash)) {
    const mimeType = getMimeType(ext);
    blobStore.set(hash, {
      data,
      mime: mimeType,
      ext,
    });
    console.log(`[blob_store] 存储 blob: ${hash.slice(0, 12)}... (大小: ${data.length} 字节, MIME: ${mimeType})`);
  } else {
    console.log(`[blob_store] blob 已存在（去重）: ${hash.slice(0, 12)}...`);
  }
  
  return hash;
}

/**
 * 获取 blob 数据
 */
export function getBlob(hash) {
  return blobStore.get(hash);
}

/**
 * 清空存储
 */
export function clearBlobStore() {
  blobStore.clear();
}

/**
 * 获取存储大小
 */
export function getStoreSize() {
  return blobStore.size;
}
