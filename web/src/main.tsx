import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";

import App from "./App.tsx";
import { Provider } from "./provider.tsx";
import "@/styles/globals.css";
import { initApiBase } from "@/utils/fetch";

/**
 * 根据环境选择路由器
 * - Electron 环境：使用 HashRouter（不依赖 pathname）
 * - H5 环境（Web 部署）：使用 BrowserRouter（支持 basename）
 */
// 编译时判断（优先）- 检查 BASE_URL 是否为相对路径或根路径
const isElectronBuild =
  import.meta.env.BASE_URL === "./" || import.meta.env.BASE_URL === "/";

// 运行时判断（兜底）
const isElectronRuntime =
  typeof window !== "undefined" && !!(window as any).electron;

const isElectron = isElectronBuild || isElectronRuntime;

// 调试日志
console.log("[main.tsx] BASE_URL:", import.meta.env.BASE_URL);
console.log("[main.tsx] isElectronBuild:", isElectronBuild);
console.log("[main.tsx] isElectronRuntime:", isElectronRuntime);
console.log("[main.tsx] isElectron:", isElectron);
console.log("[main.tsx] window.location.pathname:", window.location.pathname);
console.log("[main.tsx] 使用路由器:", isElectron ? "HashRouter" : "BrowserRouter");

// 初始化 API Base（异步，Electron 环境会等待后端 URL）
if (isElectron) {
  initApiBase().then(apiBase => {
    console.log("[main.tsx] API Base 初始化完成:", apiBase);
  });
}

// 选择路由器
const Router = isElectron ? HashRouter : BrowserRouter;
const routerProps = isElectron ? {} : { basename: "/activity-rule-editor" };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router {...routerProps}>
      <Provider>
        <App />
      </Provider>
    </Router>
  </React.StrictMode>,
);
