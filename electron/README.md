# Activity Rule Editor - Electron App

Electron 桌面应用版本，内置 Node.js 后端和前端页面。

## 特性

- ✅ 独立桌面应用
- ✅ 内置 Node.js 后端（自动启动）
- ✅ 无需部署，本地运行
- ✅ 跨平台（macOS, Windows, Linux）
- ✅ 与 Web 版本完全独立

## 开发

```bash
# 1. 安装依赖
cd electron
npm install

# 2. 确保 Node.js 后端依赖已安装
cd ../backend-node
npm install

# 3. 确保前端在开发模式运行
cd ../web
npm run dev

# 4. 启动 Electron（开发模式）
cd ../electron
npm run dev
```

## 构建

### macOS

```bash
npm run build:mac
```

输出：`electron/dist/Activity Rule Editor.app`

### Windows

```bash
npm run build:win
```

输出：`electron/dist/Activity Rule Editor Setup.exe`

### Linux

```bash
npm run build:linux
```

输出：`electron/dist/Activity Rule Editor.AppImage`

## 生产环境构建

**完整步骤：**

```bash
# 1. 构建前端
cd web
npm run build

# 2. 确保 Node.js 后端可运行
cd ../backend-node
npm install

# 3. 构建 Electron 应用
cd ../electron
npm run build:mac  # 或 build:win / build:linux
```

## 配置

### 后端端口

默认：`3000`

修改：编辑 `src/main.js` 中的 `PORT` 环境变量

### 前端 URL

- 开发模式：`http://localhost:5173`
- 生产模式：加载本地构建的 `web/dist/index.html`

## 架构

```
┌─────────────────────────────────────┐
│      Electron 主进程                │
│  ┌───────────┐    ┌──────────────┐ │
│  │ main.js   │───>│ Node Backend │ │
│  │           │    │ (port 3000)  │ │
│  └───────────┘    └──────────────┘ │
│        │                            │
│        v                            │
│  ┌───────────────────────────────┐ │
│  │   渲染进程（BrowserWindow）   │ │
│  │   - 加载前端页面              │ │
│  │   - 自动连接 Node 后端        │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

## 与 Web 版本的区别

| 特性 | Web 版本 | Electron 版本 |
|------|---------|--------------|
| **部署** | 需要服务器 | 独立应用 |
| **后端** | Python/Node 二选一 | 内置 Node.js |
| **启动** | 浏览器访问 | 双击打开 |
| **网络** | 需要网络（部署时） | 完全离线 |
| **更新** | 刷新页面 | 需要重新安装 |

## 注意事项

1. **首次启动延迟**：Electron 启动后等待 2 秒让后端完全就绪
2. **端口冲突**：确保端口 3000 未被占用
3. **文件路径**：使用绝对路径引用 backend-node 和 web
4. **生产构建**：必须先构建前端（`cd web && npm run build`）
