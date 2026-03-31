# 🚀 快速启动指南

## 📦 项目结构

```
activity-rule-editor-dev/
├── backend/          # Python 后端（原有，端口 8000）
├── backend-node/     # Node.js 后端（新建，端口 3000）
├── web/             # React 前端（Vite）
└── electron/        # Electron 桌面应用
```

---

## 🎯 启动方式（3选1）

### 方式1：Web 版本 + Python 后端（原有方案）

**终端1：启动 Python 后端**
```bash
cd backend
uv run uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000
```

**终端2：启动前端**
```bash
cd web
pnpm dev
```

**访问**：http://localhost:5173/activity-rule-editor/

---

### 方式2：Web 版本 + Node.js 后端（新方案）

**终端1：启动 Node.js 后端**
```bash
cd backend-node
npm install  # 首次运行
npm run dev
```

**终端2：启动前端**
```bash
cd web
pnpm dev
```

**前端配置**：
创建 `web/.env.local` 文件：
```bash
VITE_API_BASE=http://localhost:3000
```

**访问**：http://localhost:5173/activity-rule-editor/

---

### 方式3：Electron 桌面应用（推荐本地使用）

**一次性设置：**
```bash
# 1. 安装 Node.js 后端依赖
cd backend-node
npm install

# 2. 安装 Electron 依赖
cd ../electron
npm install
```

**启动（开发模式）：**
```bash
# 终端1：启动前端开发服务器
cd web
pnpm dev

# 终端2：启动 Electron
cd electron
npm run dev
```

Electron 会自动打开桌面应用窗口 🎉

---

## 🔧 各方案对比

| 特性 | Python 后端 | Node.js 后端 | Electron 应用 |
|------|------------|-------------|--------------|
| **端口** | 8000 | 3000 | 3000（内置）|
| **语言** | Python | JavaScript | JavaScript |
| **部署** | 需要 Python 环境 | 需要 Node.js | 独立打包 |
| **优势** | 成熟稳定 | 单一技术栈 | 本地离线 |
| **适用场景** | 服务器部署 | 服务器部署 | 桌面应用 |

---

## 📝 常见问题

### Q: 如何切换后端？

**方法1：环境变量**
```bash
# web/.env.local
VITE_API_BASE=http://localhost:3000  # Node.js 后端
# VITE_API_BASE=http://localhost:8000  # Python 后端（注释掉）
```

**方法2：localStorage**
```javascript
// 在浏览器控制台运行
localStorage.setItem('API_BASE', 'http://localhost:3000');
```

### Q: 端口冲突怎么办？

**修改 Node.js 后端端口：**
```bash
# backend-node/src/server.js
const PORT = process.env.PORT || 3001;  # 改为 3001
```

**修改 Electron 后端端口：**
```javascript
// electron/src/main.js
env: {
  PORT: '3001',  // 改为 3001
}
```

### Q: Electron 如何打包？

**开发阶段**：使用 `npm run dev`

**生产打包**：
```bash
# 1. 构建前端
cd web
npm run build

# 2. 打包 Electron
cd ../electron
npm run build:mac     # macOS
npm run build:win     # Windows
npm run build:linux   # Linux
```

输出在 `electron/dist/` 目录。

---

## 🐛 调试技巧

### 查看后端日志

**Python 后端：**
```bash
# 终端直接显示
```

**Node.js 后端：**
```bash
# 终端直接显示
# 或查看：backend-node/logs/
```

### 查看网络请求

1. 打开浏览器 DevTools (F12)
2. Network 面板
3. 筛选 `/api/parse` 和 `/media/`

### 清空缓存

**浏览器：**
```bash
Ctrl+Shift+Delete → 清空缓存
```

**localStorage：**
```javascript
localStorage.clear();
```

**后端重启：**
```bash
# 停止后端（Ctrl+C）
# 重新启动
```

---

## 📚 更多文档

- **Python 后端**：`backend/README.md`（如果有）
- **Node.js 后端**：`backend-node/README.md`
- **Electron 应用**：`electron/README.md`
- **前端**：`web/README.md`（如果有）
- **架构说明**：`CLAUDE.md`

---

## 🆘 获取帮助

1. 查看 `CLAUDE.md` 了解项目架构
2. 检查各子目录的 README
3. 查看 Git 提交历史
4. 提交 Issue

Happy Coding! 🎉
