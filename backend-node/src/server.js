/**
 * Node.js Backend Server
 * 端口：3000（与 Python 后端 8000 区分）
 */
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

import { parseFile } from './services/excelParser.js';
import { extractImages } from './services/imageExtractor.js';
import { storeBlob, getBlob, getStoreSize } from './services/blobStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 配置文件上传
const upload = multer({
  dest: path.join(__dirname, '../uploads/'),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// CORS 配置
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    backend: 'node',
    version: '1.0.0',
    blobCount: getStoreSize(),
  });
});

// 解析 Excel 文件
app.post('/api/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const sheetName = req.body.sheet || null;

    console.log(`[后端-Node] 收到文件: ${req.file.originalname}, size: ${req.file.size} bytes`);

    // 解析 Excel
    const parseResult = await parseFile(filePath, sheetName);
    const sheetsData = parseResult.sheets;

    // 为每个有效 sheet 提取图片
    const sheetsOutput = {};
    for (const [name, sheetResult] of Object.entries(sheetsData)) {
      console.log(`[后端-Node] 提取 sheet ${name} 的图片...`);
      
      const extractedImages = await extractImages(
        filePath,
        sheetResult,
        name,
        storeBlob
      );

      sheetsOutput[name] = {
        result: sheetResult,
        images: extractedImages,
      };
    }

    const sheetCount = Object.keys(sheetsData).length;
    const skippedCount = parseResult.skipped_sheets.length;
    console.log(`[后端-Node] ✅ 解析完成: ${sheetCount} 个有效 sheet, ${skippedCount} 个跳过`);
    if (parseResult.skipped_sheets.length > 0) {
      console.log(`[后端-Node] 跳过的 sheet: ${parseResult.skipped_sheets.join(', ')}`);
    }
    console.log(`[后端-Node] Blob 存储大小: ${getStoreSize()}`);

    // 清理临时文件
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.warn('[后端-Node] 清理临时文件失败:', err);
    }

    // 重要：确保所有图片都存储完成后再返回响应
    res.json({
      ok: true,
      sheets: sheetsOutput,
      skipped_sheets: parseResult.skipped_sheets,
      blob_store_size: getStoreSize(),
    });

  } catch (err) {
    console.error('[后端-Node] ❌ 解析错误:', err);
    console.error(err.stack);
    res.status(500).json({
      ok: false,
      error: err.message || String(err),
    });
  }
});

// 提供图片数据
app.get('/media/:hash', (req, res) => {
  const { hash } = req.params;
  const blobData = getBlob(hash);

  if (!blobData) {
    return res.status(404).json({ error: 'not found' });
  }

  const { data, mime } = blobData;

  res.set({
    'Content-Type': mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'ETag': `"${hash}"`,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  });

  res.send(data);
});

// 向后兼容别名
app.post('/parse', upload.single('file'), async (req, res) => {
  req.url = '/api/parse';
  app.handle(req, res);
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('[服务器错误]:', err);
  res.status(500).json({
    ok: false,
    error: err.message || 'Internal server error',
  });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════╗
║  Activity Rule Editor - Node.js Backend  ║
╠═══════════════════════════════════════════╣
║  ✅ Server running on port ${PORT}          ║
║  🔗 http://localhost:${PORT}              ║
║  📊 Health: http://localhost:${PORT}/health║
╚═══════════════════════════════════════════╝
  `);
});

export default app;
