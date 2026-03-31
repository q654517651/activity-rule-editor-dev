# Node.js 后端 + Electron 实现指南

## 📋 新增内容总览

本次更新新增了完整的 Node.js 后端和 Electron 桌面应用，与现有 Python 后端**完全并行**，互不影响。

### 新增目录结构

```
activity-rule-editor-dev/
├── backend/          # ✅ 原有 Python 后端（保持不变）
├── backend-node/     # 🆕 Node.js 后端
│   ├── src/
│   │   ├── services/
│   │   │   ├── blobStore.js      # Blob 存储（对应 blob_store.py）
│   │   │   ├── excelParser.js    # Excel 解析（对应 excel_parser.py）
│   │   │   └── imageExtractor.js # 图片提取（对应 image_extractor.py）
│   │   ├── server.js             # 主服务器（对应 main.py）
│   │   └── test.js               # 测试脚本
│   ├── package.json
│   ├── README.md
│   └── start.sh
│
├── electron/         # 🆕 Electron 应用
│   ├── src/
│   │   ├── main.js               # 主进程
│   │   └── preload.js            # 预加载脚本
│   ├── package.json
│   ├── README.md
│   └── start.sh
│
├── web/              # ✅ 原有前端（保持不变）
├── START.md          # 🆕 快速启动指南
└── NODE_BACKEND_GUIDE.md  # 🆕 本文档
```

---

## 🎯 功能对比

| 功能 | Python 后端 | Node.js 后端 | 状态 |
|------|------------|-------------|------|
| **Excel 解析** | ✅ openpyxl | ✅ exceljs | 基础实现 |
| **图片提取** | ✅ zipfile + PIL | ✅ jszip + sharp | 基础实现 |
| **Blob 存储** | ✅ 内存 Map | ✅ 内存 Map | 完成 |
| **API 服务** | ✅ FastAPI | ✅ Express | 完成 |
| **CORS** | ✅ 支持 | ✅ 支持 | 完成 |
| **端口** | 8000 | 3000 | 区分 |

---

## 🚀 快速开始

### 方式1：测试 Node.js 后端

```bash
# 1. 安装依赖
cd backend-node
npm install

# 2. 运行测试（可选）
npm test

# 3. 启动服务器
npm run dev
```

服务器启动在：**http://localhost:3000**

### 方式2：测试 Electron 应用

```bash
# 1. 安装依赖
cd electron
npm install

cd ../backend-node
npm install

# 2. 启动前端（新终端）
cd ../web
pnpm dev

# 3. 启动 Electron
cd ../electron
npm run dev
```

Electron 窗口会自动打开 🎉

---

## 📝 实现说明

### 1. Node.js 后端实现

#### **blobStore.js**
- ✅ 完全实现（与 Python 版本功能一致）
- 使用 Map 存储图片数据
- SHA256 哈希
- MIME 类型映射

#### **excelParser.js**
- ⚠️ 基础实现（需要完善）
- 使用 exceljs 解析 Excel
- 支持合并单元格
- RTL 地区判断
- **TODO**: 完整的 REGION/TITLE/RULES/RINK 解析逻辑

#### **imageExtractor.js**
- ⚠️ 基础实现（需要完善）
- 使用 jszip 解压 Excel
- 使用 fast-xml-parser 解析 drawings XML
- 使用 sharp 获取图片尺寸
- **TODO**: 完整的锚点定位和回填逻辑

#### **server.js**
- ✅ 完全实现
- Express 服务器
- 文件上传（multer）
- `/api/parse` 和 `/media/:hash` 端点
- CORS 配置

### 2. Electron 应用实现

#### **main.js**
- ✅ 完全实现
- 自动启动 Node.js 后端
- 创建 BrowserWindow
- 开发/生产模式切换
- 生命周期管理

#### **preload.js**
- ✅ 完全实现
- 安全的 IPC 通信
- 暴露 Electron API 到渲染进程

---

## ⚠️ 当前限制和 TODO

### Node.js 后端

**完成度：60%**

- ✅ 基础框架
- ✅ Blob 存储
- ✅ API 服务
- ⚠️ Excel 解析（简化版）
- ⚠️ 图片提取（简化版）

**TODO**:
1. 完整实现 REGION-xxx 解析
2. 完整实现 TITLE-xxx 解析
3. 完整实现 RULES-xxx 和 RINK-xxx 解析
4. 图片锚点精确定位
5. 图片数据回填到 result
6. 单元格合并处理完善
7. 表格数据结构支持

**预估工作量**: 2-3 天

### Electron 应用

**完成度：90%**

- ✅ 主进程
- ✅ 预加载脚本
- ✅ 窗口管理
- ✅ 后端启动
- ⚠️ 生产打包（未测试）

**TODO**:
1. 测试生产打包
2. 添加应用图标
3. 添加菜单栏
4. 添加自动更新（可选）

**预估工作量**: 0.5 天

---

## 🔧 开发建议

### 优先级

**P0（高优先级）**:
1. 完善 Node.js 后端的 Excel 解析逻辑
2. 对比 Python 和 Node.js 版本输出，确保一致性

**P1（中优先级）**:
3. 完善图片提取和回填逻辑
4. 测试 Electron 生产打包

**P2（低优先级）**:
5. 添加单元测试
6. 性能优化
7. Electron UI 优化

### 测试步骤

1. **对比测试**:
   ```bash
   # 同一个 Excel 文件
   # Python 后端：http://localhost:8000/api/parse
   # Node.js 后端：http://localhost:3000/api/parse
   # 对比返回的 JSON 是否一致
   ```

2. **图片测试**:
   ```bash
   # 检查图片哈希是否一致
   # 检查图片尺寸是否正确
   # 检查 MIME 类型是否正确
   ```

3. **Electron 测试**:
   ```bash
   # 开发模式运行
   # 生产打包测试
   # 跨平台测试（macOS, Windows, Linux）
   ```

---

## 📚 技术栈参考

### Node.js 依赖

| 库 | 版本 | 用途 | 文档 |
|---|------|------|------|
| express | ^4.18.2 | Web 框架 | https://expressjs.com/ |
| exceljs | ^4.4.0 | Excel 解析 | https://github.com/exceljs/exceljs |
| jszip | ^3.10.1 | ZIP 处理 | https://stuk.github.io/jszip/ |
| fast-xml-parser | ^4.3.5 | XML 解析 | https://github.com/NaturalIntelligence/fast-xml-parser |
| sharp | ^0.33.2 | 图片处理 | https://sharp.pixelplumbering.com/ |
| multer | ^1.4.5-lts.1 | 文件上传 | https://github.com/expressjs/multer |

### Electron 依赖

| 库 | 版本 | 用途 | 文档 |
|---|------|------|------|
| electron | ^28.1.0 | 桌面应用框架 | https://www.electronjs.org/ |
| electron-builder | ^24.9.1 | 打包工具 | https://www.electron.build/ |

---

## 🤝 与现有系统的关系

### 独立性保证

1. **不同端口**: Python (8000) vs Node.js (3000)
2. **不同目录**: `backend/` vs `backend-node/`
3. **不同依赖**: requirements.txt vs package.json
4. **不同启动**: uvicorn vs node

### 前端切换

前端可以通过环境变量选择使用哪个后端：

```bash
# 使用 Python 后端
VITE_API_BASE=http://localhost:8000

# 使用 Node.js 后端
VITE_API_BASE=http://localhost:3000
```

或使用 localStorage：

```javascript
// Python 后端
localStorage.setItem('API_BASE', 'http://localhost:8000');

// Node.js 后端
localStorage.setItem('API_BASE', 'http://localhost:3000');
```

---

## 🎯 下一步计划

1. **完善 Node.js 后端** (2-3天)
   - 参考 Python 版本完整实现解析逻辑
   - 确保输出格式完全一致

2. **测试验证** (1天)
   - 对比测试
   - 集成测试
   - 性能测试

3. **Electron 打包** (0.5天)
   - macOS 打包
   - Windows 打包（如需要）
   - 图标和菜单

4. **文档完善** (0.5天)
   - API 文档
   - 部署文档
   - 用户手册

**总预估**: 4-5 天完成全部工作

---

## 📞 获取帮助

- 查看 `START.md` 了解如何启动
- 查看各子目录的 README 了解详细信息
- 查看 `CLAUDE.md` 了解整体架构

Good luck! 🚀
