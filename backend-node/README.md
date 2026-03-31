# Activity Rule Editor - Node.js Backend

Node.js 版本的后端服务，与 Python 后端功能完全相同。

## 特性

- ✅ Excel 解析（使用 exceljs）
- ✅ 图片提取（使用 jszip + sharp）
- ✅ 内存 blob 存储
- ✅ CORS 支持
- ✅ 与 Python 后端并行运行

## 安装

```bash
cd backend-node
npm install
```

## 运行

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

**端口：3000**（与 Python 后端 8000 区分）

## API 端点

- `GET /health` - 健康检查
- `POST /api/parse` - 解析 Excel 文件
- `GET /media/:hash` - 获取图片

## 前端配置

在前端使用 Node.js 后端：

```bash
# web/.env.local
VITE_API_BASE=http://localhost:3000
```

## 测试

```bash
npm test
```
