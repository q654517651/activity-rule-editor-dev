/* Image cache that decodes to ImageBitmap (if available) */
const cache = new Map<string, ImageBitmap | HTMLImageElement>();

// 从 localStorage 读取 API 基址，方便调试和部署切换
function getApiBase(): string {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("API_BASE");

    if (stored) return stored;
  }

  // 使用相对路径，开发时通过 Vite proxy 转发，生产环境根据需要配置
  return import.meta.env.VITE_API_BASE || "";
}

/**
 * 规范化 URL：
 * - 如果是相对路径（/media/xxx），转换为完整 API 地址
 * - 保留 data: URL 和 blob: URL
 * - 保留已完整的 http(s): URL
 */
function normalizeImageUrl(url: string): string {
  if (!url) return url;

  // 保留 data: 和 blob: URL
  if (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("file:")
  ) {
    return url;
  }

  // 如果已是完整的 http(s) URL，保留
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // 相对路径（如 /media/xxx）→ 补全为完整 API 地址
  if (url.startsWith("/")) {
    const apiBase = getApiBase();

    return `${apiBase}${url}`;
  }

  // 其他情况保留原样
  return url;
}

async function fetchAsBlob(url: string): Promise<Blob> {
  if (url.startsWith("data:")) {
    // data URL → Blob
    const res = await fetch(url);

    return await res.blob();
  }
  const res = await fetch(url);

  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);

  return await res.blob();
}

export async function loadBitmap(
  url?: string,
): Promise<ImageBitmap | HTMLImageElement | null> {
  if (!url) return null;

  // 规范化 URL（转换相对地址为完整地址）
  const normalizedUrl = normalizeImageUrl(url);

  if (cache.has(normalizedUrl)) return cache.get(normalizedUrl)!;

  try {
    let bmp: ImageBitmap | HTMLImageElement;

    // 对于跨源请求（http/https）或需要通过 fetch 的 URL
    if (
      normalizedUrl.startsWith("blob:") ||
      normalizedUrl.startsWith("http") ||
      normalizedUrl.startsWith("data:") ||
      normalizedUrl.startsWith("file:")
    ) {
      const blob = await fetchAsBlob(normalizedUrl);

      if ("createImageBitmap" in window) {
        bmp = await createImageBitmap(blob);
      } else {
        const img = new Image();

        img.crossOrigin = "anonymous";
        img.src = URL.createObjectURL(blob);
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error("image load error"));
        });
        bmp = img;
      }
    } else {
      // 本地资源（应该不会走到这里，但保留作备份）
      const img = new Image();

      img.crossOrigin = "anonymous";
      img.src = normalizedUrl;
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("image load error"));
      });
      bmp = img;
    }

    cache.set(normalizedUrl, bmp);

    return bmp;
  } catch (err) {
    console.error(`[loadBitmap] 加载失败 ${normalizedUrl}:`, err);

    return null;
  }
}

export function clearImageCache() {
  cache.clear();
}
