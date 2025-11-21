# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 提供在此代码仓库中工作的指导。

**重要提示：请使用中文进行所有后续的交流、代码注释和文档说明。**

## 项目概述

ActivityRuleEditor 是一个用于解析 Excel 活动规则文档并将其渲染为带样式的 PNG 图片的工具链。工作流程包括：

1. **Excel 解析（Python）**：从特定格式的 Excel 文件中提取结构化数据并转换为 JSON
2. **Web 渲染（React/TypeScript）**：基于 Canvas 的前端应用，用于可视化展示并导出规则为 PNG 图片
3. **API 服务器（FastAPI）**：连接前端和 Excel 解析器的桥梁

## 仓库结构

```
ActivityRuleEditor/
├── backend/                         # Python 后端
│   ├── api/
│   │   └── main.py                  # FastAPI 主入口
│   ├── services/
│   │   ├── excel_parser.py          # 核心 Excel 解析器（基于 openpyxl）
│   │   ├── image_extractor.py       # 图片提取器
│   │   └── blob_store.py            # 内存 blob 存储
│   └── models.py                    # 数据模型定义
├── web/                             # 前端应用（React + Vite + Konva）
│   └── src/
│       ├── pages/preview.tsx        # 主预览页面
│       └── renderer/canvas/
│           ├── index.tsx            # Canvas 导出工具
│           ├── PageCanvas.tsx       # 基于 Konva 的页面渲染器
│           ├── useImageCache.ts     # 图片缓存管理
│           └── types.ts             # 共享类型定义
└── test2.xlsx                       # 示例输入 Excel 文件
```

## 构建与开发命令

### Python 后端

**环境设置：**
```bash
# 使用 uv 管理 Python 依赖（推荐）
uv sync

# 或手动安装 uv（如果未安装）
# Windows: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
# macOS/Linux: curl -LsSf https://astral.sh/uv/install.sh | sh
```

**运行 API 服务器：**
```bash
cd /path/to/ActivityRuleEditor
uv run uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000
# 监听地址：http://127.0.0.1:8000
```

### 前端 (web/)

使用 Vite + React + HeroUI + Tailwind CSS + Konva。

```bash
cd web
pnpm install
pnpm dev              # 开发服务器，监听 :5173
pnpm build            # 生产环境构建
pnpm preview          # 预览生产构建
```

## Excel 数据格式

Excel 解析器（`backend/services/excel_parser.py`）期望特定的单元格结构：

### 区域标记
- 以 `REGION-xxx` 开头的单元格定义一个页面区域
- 合并单元格决定区域的列跨度

### 标题标记
- `TITLE-xxx` 标记区域内的小节边界
- 两个 TITLE 标记之间的所有内容属于一个小节

### 内容块
- **规则内容**：第 1 列为 `RULES-xxx`，后续列/行包含文本内容
- **奖励内容**：第 1 列为 `RINK-xxx`，后续行格式为：
  - 第 2 列：奖励名称
  - 第 3 列：图片路径/URL
  - 第 4 列：描述文字

### 输出 JSON 结构
```json
{
  "pages": [
    {
      "region": "A",
      "sections": [
        {
          "title": "活动规则",
          "content": "规则文本内容",
          "rewards": [
            {
              "name": "奖励名称",
              "image": "/assets/reward.png",
              "desc": "描述文字"
            }
          ]
        }
      ]
    }
  ]
}
```

## 架构说明

### Canvas 渲染

**web/（Canvas 渲染）**
- 使用 react-konva 渲染到 HTML5 Canvas
- NineSlice 组件用于边框渲染
- 直接使用 `toDataURL()` 导出高分辨率 PNG
- 性能更好，适合批量导出和像素级精确输出

### 图片处理

图片处理流程：
- 从 Excel 中提取嵌入图片（通过 ZIP 解压 `xl/media/*`）
- 将图片存储在内存 blob 存储中（使用 SHA256 哈希）
- 通过 `/media/{blob_hash}` API 端点提供图片
- 前端使用 `useImageCache.ts` 管理图片加载和缓存

### 样式配置

前端支持：
- **边框/框架**：9-slice 图片，可配置切片宽度（上/右/下/左）
- **内边距**：内容区域与框架边缘的距离
- **颜色**：标题和正文文字颜色
- **字体大小**：标题和正文字号（Konva 使用固定字体系列）

## 关键文件说明

### backend/services/excel_parser.py（Excel 解析器）
- `parse_sheet(ws)`：主入口，协调区域/小节提取
- `parse_section_block()`：解析 TITLE 标记之间的 RULES 和 RINK 块
- `scan_titles()`：扫描区域内的所有 TITLE 标记
- `build_merge_index()`：创建合并单元格的 O(1) 查找索引
- `merge_reward_sections()`：合并相同标题的奖励分段

### backend/services/image_extractor.py
- `extract_images_for_result()`：从 Excel 提取嵌入图片
- 通过解析 drawings XML 获取图片锚点坐标
- 将图片存储到 blob 存储并返回哈希路径

### backend/services/blob_store.py
- 内存 blob 存储，使用 SHA256 哈希去重
- `store_blob()`：存储图片并返回哈希
- `get_blob()`：根据哈希获取图片数据

### web/src/pages/preview.tsx
- 基于 Konva 的布局，使用 `<Text>`、`<Image>` 和 `<NineSlice>` 组件
- `measurePlainTextHeight()` 预先计算文本块尺寸
- 父组件使用 `onMeasured` 回调来正确设置 Stage 高度

### web/src/renderer/canvas/index.tsx
- `renderPageToDataURL()`：离屏渲染用于导出
- `exportPagesToPng()`：按指定 pixelRatio 批量导出所有页面

### web/src/renderer/canvas/PageCanvas.tsx
- Konva 渲染组件，处理页面布局
- 支持 `forExport` 模式用于高分辨率导出
- 使用 `onMeasured` 回调通知父组件实际渲染高度

### web/src/renderer/canvas/useImageCache.ts
- 管理图片加载和缓存
- `normalizeImageUrl()`：将相对 URL 补全为完整 API URL
- `loadBitmap()`：加载图片并缓存

## 开发注意事项

- `web/` 前端从以下来源获取数据：
  1. 通过 API 上传 XLSX 文件（`/api/parse`）
  2. 本地上传 JSON 文件
- API 服务器（`backend/api/main.py`）充当桥梁：接受 XLSX 上传，调用解析器，返回 JSON 和图片哈希
- 图片通过 `/media/{blob_hash}` API 端点提供，存储在内存中
- CORS 为本地开发完全开放（`allow_origins=["*"]`）

## 常见工作流程

**启动完整开发环境：**
```bash
# 终端 1：启动后端
python -m uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000

# 终端 2：启动前端
cd web
pnpm dev
# 在浏览器中访问 http://localhost:5173，上传 Excel 文件
```

**修改解析器逻辑：**
- 编辑 `backend/services/excel_parser.py` 中的函数，如 `parse_section_block()` 或 `scan_titles()`
- 后端使用 `--reload` 模式会自动重启
- 在前端重新上传 XLSX 文件进行验证

**添加新的 Excel 标记：**
- 更新 `parse_section_block()` 以识别新模式（如 `CUSTOM-xxx`）
- 在输出 JSON 结构中添加相应字段
- 更新前端渲染器以显示新数据

**调整渲染样式：**
- 编辑 `web/src/pages/preview.tsx` 中的样式配置
- 修改 `types.ts` 中的 `StyleCfg` 类型
- 更新 `PageCanvas.tsx` 中的布局逻辑

## 技术栈

- **后端**：Python 3.x, openpyxl, FastAPI, uvicorn
- **前端**：React 18, TypeScript, Vite, HeroUI, Tailwind CSS 4.x
- **Canvas 渲染**：Konva, react-konva
- **包管理**：pnpm

## 项目历史注记

本项目经过多次重构：
- 最初版本使用根目录的 Python 脚本（`test.py`、`api_server.py`）和独立的 React 组件
- 后期重构为模块化的 `backend/` 目录结构，使用 FastAPI
- 前端从 DOM 渲染重构为 Canvas 渲染（使用 Konva）
- 图片处理从文件系统存储改为内存 blob 存储
- 移除 Electron 桌面应用支持，简化为纯 Web 应用

当前版本是最新的稳定版本，结构清晰，性能优异，部署简单。
