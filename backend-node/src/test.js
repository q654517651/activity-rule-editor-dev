/**
 * 测试脚本 - 验证 Node.js 后端功能
 */
import { parseFile } from './services/excelParser.js';
import { extractImages } from './services/imageExtractor.js';
import { storeBlob, getStoreSize } from './services/blobStore.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function test() {
  console.log('🧪 开始测试 Node.js 后端...\n');
  
  // 测试 Excel 文件路径
  const testFile = path.join(__dirname, '../../test2.xlsx');
  
  console.log(`📄 测试文件: ${testFile}\n`);
  
  try {
    // 1. 测试 Excel 解析
    console.log('1️⃣ 测试 Excel 解析...');
    const parseResult = await parseFile(testFile);
    console.log(`   ✅ 解析完成！`);
    console.log(`   - 有效 sheets: ${Object.keys(parseResult.sheets).length}`);
    console.log(`   - 跳过 sheets: ${parseResult.skipped_sheets.length}`);
    
    if (Object.keys(parseResult.sheets).length > 0) {
      const firstSheet = Object.values(parseResult.sheets)[0];
      console.log(`   - 第一个 sheet 包含 ${firstSheet.pages?.length || 0} 个页面\n`);
    }
    
    // 2. 测试图片提取
    console.log('2️⃣ 测试图片提取...');
    const firstSheetName = Object.keys(parseResult.sheets)[0];
    const firstSheetResult = parseResult.sheets[firstSheetName];
    
    const images = await extractImages(
      testFile,
      firstSheetResult,
      firstSheetName,
      storeBlob
    );
    
    console.log(`   ✅ 提取完成！`);
    console.log(`   - 提取图片数: ${Object.keys(images).length}`);
    console.log(`   - Blob 存储大小: ${getStoreSize()}\n`);
    
    // 3. 测试 Blob 存储
    console.log('3️⃣ 测试 Blob 存储...');
    const testData = Buffer.from('test image data');
    const hash = storeBlob(testData, '.png');
    console.log(`   ✅ 存储成功！`);
    console.log(`   - Hash: ${hash.slice(0, 12)}...`);
    console.log(`   - 总存储数: ${getStoreSize()}\n`);
    
    console.log('✅ 所有测试通过！\n');
    
  } catch (err) {
    console.error('❌ 测试失败:', err);
    process.exit(1);
  }
}

test();
