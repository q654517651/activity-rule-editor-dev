/**
 * 统一的 fetch 工具
 * 自动兼容 H5 和 Electron 环境
 */

/**
 * 判断是否在 Electron 环境
 * 更可靠的判断方式：只要有 window.electron 对象就认为是 Electron
 */
function isElectron(): boolean {
  return typeof window !== "undefined" && !!(window as any).electron;
}

/**
 * 本地缓存后端 URL（避免每次都异步获取）
 */
let cachedBackendUrl: string | null = null;

/**
 * 获取 API 基础 URL（同步版本，带缓存）
 */
export function getApiBase(): string {
  // 1. 返回缓存（如果已初始化）
  if (cachedBackendUrl) return cachedBackendUrl;

  // 2. Electron 环境：从 electron.getBackendUrl() 获取（同步获取缓存值）
  if (isElectron()) {
    const electronBackendUrl = (window as any).electron?.getBackendUrl?.();

    // getBackendUrl 返回的可能是 Promise 或字符串，处理两种情况
    if (typeof electronBackendUrl === "string") {
      cachedBackendUrl = electronBackendUrl;
      return cachedBackendUrl;
    }

    // 如果返回 Promise，使用默认值（preload 中会异步更新缓存）
    console.warn("[fetch] Electron 后端 URL 尚未初始化，使用默认值");
    return "http://127.0.0.1:18000";
  }

  // 3. H5 环境：从 localStorage 读取
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("API_BASE");
    if (stored) {
      cachedBackendUrl = stored;
      return cachedBackendUrl;
    }
  }

  // 4. 兜底：使用 Vite 环境变量
  const viteBase = import.meta.env.VITE_API_BASE || "";
  cachedBackendUrl = viteBase;
  return viteBase;  // 直接返回 viteBase，不返回 cachedBackendUrl
}

/**
 * 初始化 API Base（异步版本，用于应用启动时）
 * Electron 环境下会等待 electron.getBackendUrl() 返回
 */
export async function initApiBase(): Promise<string> {
  if (isElectron() && (window as any).electron?.getBackendUrl) {
    try {
      const backendUrl = await (window as any).electron.getBackendUrl();
      if (backendUrl) {
        cachedBackendUrl = backendUrl;
        console.log("[fetch] Electron 后端 URL 已初始化:", cachedBackendUrl);
        return backendUrl;  // 直接返回 backendUrl，不返回 cachedBackendUrl
      }
    } catch (err) {
      console.error("[fetch] 获取 Electron 后端 URL 失败:", err);
    }
  }

  return getApiBase();
}

/**
 * 规范化 URL
 * - 相对路径自动补全为完整 URL
 * - 绝对路径保持不变
 * - 避免双斜杠问题
 */
export function normalizeUrl(url: string): string {
  if (!url) return url;

  // 已经是完整 URL，直接返回
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  // 相对路径，补全为完整 URL
  if (url.startsWith("/")) {
    const apiBase = getApiBase();
    // 移除 apiBase 的尾斜杠，避免双斜杠
    return apiBase.replace(/\/$/, "") + url;
  }

  return url;
}

/**
 * 统一的 fetch 函数
 * 自动处理相对路径，兼容 H5 和 Electron
 *
 * @example
 * ```ts
 * // 自动补全为 http://127.0.0.1:18000/api/parse (Electron)
 * // 或 /activity-rule-editor/api/parse (H5)
 * const res = await fetchCompat('/api/parse', { method: 'POST' });
 * ```
 */
export async function fetchCompat(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // 规范化 URL
  let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const normalizedUrl = normalizeUrl(url);

  // 重新构造 input，保持原有的 headers/body 等配置
  let finalInput: RequestInfo | URL;
  if (typeof input === "string") {
    finalInput = normalizedUrl;
  } else if (input instanceof URL) {
    finalInput = new URL(normalizedUrl);
  } else {
    // Request 对象：保留原有配置，只替换 URL
    finalInput = new Request(normalizedUrl, input);
  }

  // 调用原生 fetch
  return fetch(finalInput, init);
}
