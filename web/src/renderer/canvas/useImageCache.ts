/* Image cache that decodes to ImageBitmap (if available) */
const cache = new Map<string, ImageBitmap | HTMLImageElement>();

/* 正在加载的 Promise 缓存 - 防止同一图片重复加载 */
const loadingPromises = new Map<string, Promise<ImageBitmap | HTMLImageElement | null>>();

// 并发控制队列
class RequestQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = 0;
  private maxConcurrent = 6; // 浏览器并发限制

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        try {
          this.running++;
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this.processNext();
        }
      };

      this.queue.push(task);
      this.processNext();
    });
  }

  private processNext() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (task) {
      task();
    }
  }
}

const requestQueue = new RequestQueue();

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
export function normalizeImageUrl(url: string): string {
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

// 带超时和重试的 fetch
async function fetchAsBlob(
  url: string,
  retries = 3,
  timeout = 10000,
): Promise<Blob> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      if (url.startsWith("data:")) {
        // data URL → Blob
        const res = await fetch(url);
        clearTimeout(timeoutId);
        return await res.blob();
      }

      const res = await fetch(url, {
        signal: controller.signal,
        cache: "force-cache", // 使用浏览器缓存
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`fetch failed: ${res.status}`);
      }

      return await res.blob();
    } catch (error: any) {
      const isLastAttempt = attempt === retries;

      // 如果是最后一次尝试，抛出错误
      if (isLastAttempt) {
        throw error;
      }

      // 如果是 abort 错误（超时），等待后重试
      if (error.name === "AbortError") {
        console.warn(
          `[fetchAsBlob] 超时，重试 ${attempt + 1}/${retries}: ${url}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1))); // 指数退避
      } else if (error.message?.includes("fetch failed")) {
        console.warn(
          `[fetchAsBlob] 请求失败，重试 ${attempt + 1}/${retries}: ${url}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      } else {
        // 其他错误直接抛出
        throw error;
      }
    }
  }

  throw new Error(`fetchAsBlob failed after ${retries} retries`);
}

export async function loadBitmap(
  url?: string,
): Promise<ImageBitmap | HTMLImageElement | null> {
  if (!url) return null;

  // 规范化 URL（转换相对地址为完整地址）
  const normalizedUrl = normalizeImageUrl(url);

  // 1. 检查已完成的缓存
  if (cache.has(normalizedUrl)) {
    return cache.get(normalizedUrl)!;
  }

  // 2. 检查正在加载的 Promise - 复用，避免重复请求
  if (loadingPromises.has(normalizedUrl)) {
    return loadingPromises.get(normalizedUrl)!;
  }

  // 3. 创建加载 Promise 并缓存
  const loadPromise = (async () => {
    try {
      // 使用队列控制并发
      const bmp = await requestQueue.add(async () => {
        let result: ImageBitmap | HTMLImageElement;

        // 对于跨源请求（http/https）或需要通过 fetch 的 URL
        if (
          normalizedUrl.startsWith("blob:") ||
          normalizedUrl.startsWith("http") ||
          normalizedUrl.startsWith("data:") ||
          normalizedUrl.startsWith("file:")
        ) {
          const blob = await fetchAsBlob(normalizedUrl);

          if ("createImageBitmap" in window) {
            result = await createImageBitmap(blob);
          } else {
            const img = new Image();

            img.crossOrigin = "anonymous";
            img.src = URL.createObjectURL(blob);
            await new Promise<void>((res, rej) => {
              img.onload = () => res();
              img.onerror = () => rej(new Error("image load error"));
            });
            result = img;
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
          result = img;
        }

        return result;
      });

      // 加载成功，缓存结果
      cache.set(normalizedUrl, bmp);
      return bmp;
    } catch (err) {
      console.error(`[loadBitmap] 加载失败 ${normalizedUrl}:`, err);
      return null;
    } finally {
      // 加载完成（成功或失败），移除 loading Promise
      loadingPromises.delete(normalizedUrl);
    }
  })();

  // 缓存正在加载的 Promise
  loadingPromises.set(normalizedUrl, loadPromise);
  
  return loadPromise;
}

export function clearImageCache() {
  cache.clear();
  loadingPromises.clear();
}

/**
 * 检查图片是否已缓存（同步）
 * 组件可以用这个检查是否显示占位符
 */
export function isImageCached(url?: string): boolean {
  if (!url) return false;
  const normalizedUrl = normalizeImageUrl(url);
  return cache.has(normalizedUrl);
}

/**
 * 从缓存获取图片（同步）
 * 组件只读缓存，不主动加载
 */
export function getCachedImage(url?: string): ImageBitmap | HTMLImageElement | null {
  if (!url) return null;
  const normalizedUrl = normalizeImageUrl(url);
  return cache.get(normalizedUrl) || null;
}
