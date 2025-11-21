# API 配置与调试指南

## 概述

ActivityRuleEditor 前后端通信已整合到统一的后端入口。前端会自动请求图片资源 `/media/{blob_hash}` 从后端 API 服务器加载。

## 启动后端服务

```bash
cd E:\Program\programlearn\ActivityRuleEditor
python -m uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000
```

后端将在 `http://127.0.0.1:8000` 启动。

## 启动前端开发服务

```bash
cd E:\Program\programlearn\ActivityRuleEditor\web
pnpm dev
```

前端将在 `http://localhost:5173` 启动。

## 配置 API 地址

前端默认指向 `http://127.0.0.1:8000`，但如果需要修改，有两种方式：

### 方式 1：修改代码（开发时）

编辑 `web/src/renderer/canvas/useImageCache.ts` 中的 `getApiBase()` 函数默认值：

```typescript
function getApiBase(): string {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('API_BASE');
    if (stored) return stored;
  }
  // 修改这里的默认值
  return 'http://your-api-server:8000';
}
```

### 方式 2：运行时设置（推荐调试）

在浏览器控制台执行：

```javascript
localStorage.setItem('API_BASE', 'http://127.0.0.1:8000');
location.reload();  // 刷新页面
```

或者设置为生产环境地址：

```javascript
localStorage.setItem('API_BASE', 'https://api.example.com');
location.reload();
```

## 图片加载流程

1. **前端上传 XLSX**
   - 用户在前端上传 Excel 文件
   - 前端发送 POST 请求到 `http://127.0.0.1:8000/api/parse`

2. **后端解析并存储**
   - 后端解析 Excel 结构
   - 提取嵌入图片到内存 blob 存储
   - 返回 JSON，其中图片引用为 `/media/{sha256_hash}` 格式

3. **前端规范化 URL**
   - 前端收到相对 URL `/media/{hash}`
   - `normalizeImageUrl()` 函数将其补全为 `http://127.0.0.1:8000/media/{hash}`

4. **前端加载图片**
   - `loadBitmap()` 通过 fetch 请求完整 URL
   - 后端返回图片数据和跨域头
   - Canvas 正常渲染图片

## 调试常见问题

### 问题：图片显示为空

**原因**：相对 URL `/media/{hash}` 指向了错误的源

**解决**：
1. 打开浏览器开发者工具 → 网络标签页
2. 找到以 `/media/` 开头的请求
3. 检查请求 URL 是否正确指向 `http://127.0.0.1:8000/media/...`
4. 如果不正确，使用上述方式 2 重新设置 API 地址

### 问题：CORS 错误

**原因**：后端未添加 CORS 响应头

**解决**：已在后端 `/media/{blob_hash}` 端点添加：
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, OPTIONS`

### 问题：Canvas 被污染（Tainted Canvas）

**原因**：跨域加载的图片未设置 `crossOrigin='anonymous'`

**解决**：已在 `useImageCache.ts` 中所有 Image 元素都设置了 `crossOrigin='anonymous'`

## 测试 API

使用提供的测试脚本：

```bash
python test_backend.py
```

输出示例：
```
[测试] /health
状态码: 200
响应: {'status': 'ok'}

[测试] /api/parse (使用 test2.xlsx)
状态码: 200
ok: True
页数: 3
第一页区域: A
第一页小节数: 2
  标题: 活动规则
  奖励数: 3
    第一个奖励:
      名称: 金牌
      图片 URL: /media/517b3b151e535dbe3200902eaf46c261590992e6ce176368d67795e711ffb100
      图片 MIME: image/jpeg
blob 存储大小: 3

[测试] /media/{blob_hash}
测试 blob_hash: 517b3b151e53...
状态码: 200
Content-Type: image/jpeg
数据大小: 45678 字节
```

## API 端点详解

### POST /api/parse

**功能**：解析 Excel 文件并提取图片

**请求**：
```
Content-Type: multipart/form-data

Parameters:
  - file: 上传的 .xlsx 文件
  - sheet (可选): 工作表名称，默认使用活跃工作表
```

**响应**：
```json
{
  "ok": true,
  "result": {
    "pages": [
      {
        "region": "A",
        "sections": [
          {
            "title": "活动规则",
            "content": "规则详情...",
            "rewards": [
              {
                "name": "金牌",
                "image": {
                  "id": "sha256:517b3b15...",
                  "url": "/media/517b3b15...",
                  "mime": "image/jpeg"
                },
                "desc": "获得 100 积分"
              }
            ]
          }
        ]
      }
    ]
  },
  "images": {
    "金牌.jpg": "/media/517b3b15..."
  },
  "blob_store_size": 3
}
```

### GET /media/{blob_hash}

**功能**：返回存储的图片数据

**响应头**：
```
Content-Type: image/png (or image/jpeg, etc.)
Cache-Control: public, max-age=31536000, immutable
ETag: "{blob_hash}"
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
```

**响应体**：二进制图片数据

## 生产部署建议

### 1. 后端部署

部署到生产服务器：
```bash
uv run uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

或使用生产级 WSGI 服务器（如 Gunicorn）：
```bash
uv add gunicorn
uv run gunicorn -w 4 -k uvicorn.workers.UvicornWorker backend.api.main:app --bind 0.0.0.0:8000
```

### 2. 前端部署

构建并部署静态文件：
```bash
cd web
pnpm build
# dist/ 文件夹即为可部署的前端
```

部署选项：
- **静态网站托管**：Vercel、Netlify、阿里云 OSS、腾讯云 COS 等
- **Nginx**：配置为静态文件服务器
- **CDN**：加速全球访问

### 3. 配置 API 地址

在前端初始化时设置环境变量：
```javascript
// 在 main.tsx 或其他初始化文件中
localStorage.setItem('API_BASE', 'https://api.example.com');
```

或在构建时设置环境变量（推荐）：
```bash
# .env.production
VITE_API_BASE=https://api.example.com
```

### 4. 图片存储优化

目前 blob 存储在内存中，重启会丢失。生产环境建议：
- **文件系统存储**：将图片保存到磁盘
- **对象存储**：集成 S3/阿里 OSS/腾讯 COS 等服务
- **Redis**：使用 Redis 作为持久化缓存层
