import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

/**
 * Electron 专用 Vite 配置
 *
 * 与标准 Web 部署的区别：
 * - base: "./" 而不是 "/activity-rule-editor/"（适配 file:// 和 app:// 协议）
 * - 输出到 dist-electron/ 而不是 dist/
 * - 不需要 proxy 配置（后端由 Electron 启动）
 */
export default defineConfig({
  base: "./",  // 使用相对路径，适配本地文件系统
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
    sourcemap: true,  // 启用 source map，方便调试
  },
});
