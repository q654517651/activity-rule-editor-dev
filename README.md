# ActivityRuleEditor

一个用于解析 Excel 活动规则文档并渲染为高质量 PNG 图片的工具链。

## 功能特点

- 📊 **Excel 解析**：从特定格式的 Excel 文件中提取结构化数据
- 📑 **多 Sheet 支持**：自动识别并处理多个工作表（基于 REGION- 标记）
- 🎨 **Canvas 渲染**：基于 Konva 的高质量 Canvas 渲染
- 🖼️ **图片管理**：内存 blob 存储，自动提取和缓存嵌入图片
- 📤 **批量导出**：支持多 sheet 分文件夹批量导出高分辨率 PNG 图片
- 🌐 **Web 应用**：纯 Web 应用，无需安装客户端
- 🔄 **智能切换**：左侧导航快速切换不同工作表
- 🌍 **RTL 语言支持**：自动检测并正确渲染阿拉伯语、希伯来语等从右到左的语言

## 项目结构

```
ActivityRuleEditor/
├── backend/              # Python 后端（FastAPI）
│   ├── api/             # API 路由
│   ├── services/        # 核心服务（解析器、图片提取器、blob 存储）
│   └── models.py        # 数据模型
└── web/                 # 前端应用（React + Vite + Konva）
    └── src/             # 源代码
        ├── pages/       # 页面组件
        └── renderer/    # Canvas 渲染器
```

## 快速开始

### 环境要求

- Python 3.8+
- [uv](https://github.com/astral-sh/uv) (Python 包管理器)
- Node.js 16+
- pnpm

### 安装 uv

**Windows (PowerShell):**
```powershell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**macOS/Linux:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 后端启动

```bash
# 安装依赖（uv 会自动创建虚拟环境）
uv sync

# 启动 API 服务器
uv run uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000
```

### 前端启动

```bash
cd web
pnpm install
pnpm dev  # 启动开发服务器
```

访问 `http://localhost:5173` 开始使用。

## Excel 格式说明

Excel 文件使用特定的标记系统进行结构化：

- `REGION-xxx`：定义页面区域（纵向分割）
  - **重要**：只有第一行包含 `REGION-` 标记的 sheet 会被解析
  - 未包含此标记的 sheet 会被自动跳过
- `TITLE-xxx`：定义段落标题（横向分割）
- `RULES-xxx`：标记规则内容
- `RINK-xxx`：标记奖励列表

### 多工作表支持

- ✅ 自动扫描 Excel 中所有 sheet
- ✅ 只处理包含 `REGION-` 标记的 sheet
- ✅ 导出时每个 sheet 生成独立文件夹
- ✅ 支持左侧导航快速切换

详细格式说明请查看 [README_EXCEL_PARSING.md](README_EXCEL_PARSING.md)。

## API 文档

### 主要端点

- `POST /api/parse`：上传并解析 Excel 文件
- `GET /media/{blob_hash}`：获取存储的图片
- `GET /health`：健康检查

详细 API 配置请查看 [API_SETUP.md](API_SETUP.md)。

## 技术栈

**后端：**
- Python 3.8+
- uv (Python 包管理器)
- FastAPI
- openpyxl

**前端：**
- React 18
- TypeScript
- Vite
- Konva / react-konva
- HeroUI + Tailwind CSS

## 开发指南

详细的开发指导和架构说明请查看：
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - 生产环境部署指南
- [CLAUDE.md](CLAUDE.md) - AI 助手开发指南
- [API_SETUP.md](docs/API_SETUP.md) - API 配置与调试
- [README_EXCEL_PARSING.md](docs/README_EXCEL_PARSING.md) - Excel 解析逻辑详解
- [MULTI_SHEET_GUIDE.md](docs/MULTI_SHEET_GUIDE.md) - 多 Sheet 功能指南
- [RTL_SUPPORT.md](docs/RTL_SUPPORT.md) - RTL 语言（阿拉伯语等）支持说明

## 构建与部署

### 前端构建（本地开发）

**重要：** 前端需要在本地构建，构建后的静态文件会提交到版本控制。

```bash
cd web
pnpm install
pnpm build  # 构建生产版本，生成 web/dist/ 目录
```

构建完成后，`web/dist/` 目录会被提交到版本控制，部署时直接使用这些静态文件。

### 生产部署

详细的部署指南请查看 [DEPLOYMENT.md](docs/DEPLOYMENT.md)。

**快速部署：**
```bash
# 使用部署脚本（会自动检查静态文件是否存在）
./deploy.sh
```

**部署流程：**
1. 本地构建前端：`cd web && pnpm build`
2. 提交构建后的 `web/dist/` 目录到版本控制
3. 在服务器上拉取代码或上传项目文件
4. 运行部署脚本：`./deploy.sh`（会自动跳过前端构建）

**手动部署：**
- **后端：** 使用 Gunicorn + Supervisor（详见部署文档）
- **前端：** 使用本地构建的 `web/dist/` 目录，FastAPI 会自动提供静态文件服务

## 许可证

本项目仅供内部使用。

