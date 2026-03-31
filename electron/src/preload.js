/**
 * Electron Preload Script
 * 在渲染进程和主进程之间建立安全的通信桥梁
 *
 * 注意：preload 脚本必须使用 CommonJS 语法（require），不能使用 ES Module（import）
 */
const { contextBridge, ipcRenderer } = require('electron');

/**
 * 同步缓存后端 URL
 * 在 contextBridge 执行时就立即获取，确保前端第一次调用时就有值
 */
let cachedBackendUrl = null;

// 立即获取后端 URL（异步，但会缓存）
(async () => {
  try {
    cachedBackendUrl = await ipcRenderer.invoke('get-backend-url');
    console.log('[Preload] 后端 URL 已缓存:', cachedBackendUrl);
  } catch (err) {
    console.error('[Preload] 获取后端 URL 失败:', err);
  }
})();

// 暴露 API 到渲染进程
contextBridge.exposeInMainWorld('electron', {
  /**
   * 获取后端 URL
   * - 优先返回同步缓存值（快速）
   * - 如果缓存未初始化，走异步获取（兜底）
   */
  getBackendUrl: () => cachedBackendUrl || ipcRenderer.invoke('get-backend-url'),

  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 是否在 Electron 环境中
  isElectron: true,
});

console.log('[Preload] Electron API 已注入');

/**
 * 初始化 Electron 环境
 * 在页面加载后自动设置 API_BASE 到 localStorage
 */
window.addEventListener('DOMContentLoaded', async () => {
  try {
    // 等待缓存初始化完成
    let attempts = 0;
    while (!cachedBackendUrl && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }

    if (cachedBackendUrl) {
      localStorage.setItem('API_BASE', cachedBackendUrl);
      console.log('[Preload] API_BASE 已自动设置为:', cachedBackendUrl);
    } else {
      console.warn('[Preload] 后端 URL 未初始化，跳过 localStorage 设置');
    }

    const version = await ipcRenderer.invoke('get-app-version');
    console.log('[Preload] 应用版本:', version);
  } catch (err) {
    console.error('[Preload] 初始化失败:', err);
  }
});

