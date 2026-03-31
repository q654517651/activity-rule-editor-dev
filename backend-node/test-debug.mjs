import ExcelJS from 'exceljs';
import { parseFile } from './src/services/excelParser.js';

async function debug() {
  const filePath = '/Users/mico/Downloads/盛典奖励配置.xlsx';
  
  console.log('=== 1. 加载 Excel ===');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet('Sheet5');
  console.log('Sheet5 行数:', ws.rowCount);
  console.log('Sheet5 列数:', ws.columnCount);
  
  console.log('\n=== 2. 检查第一行 ===');
  for (let c = 1; c <= 7; c++) {
    const cell = ws.getCell(1, c);
    console.log(`Row 1, Col ${c}: value = '${cell.value}'`);
  }
  
  console.log('\n=== 3. 调用 parseFile ===');
  const result = await parseFile(filePath, 'Sheet5');
  console.log('sheets keys:', Object.keys(result.sheets));
  console.log('skipped_sheets:', result.skipped_sheets);
  
  const sheet5Result = result.sheets['Sheet5'];
  if (sheet5Result) {
    console.log('Sheet5 pages:', sheet5Result.pages?.length || 0);
    if (sheet5Result.pages && sheet5Result.pages.length > 0) {
      console.log('First page:', JSON.stringify(sheet5Result.pages[0], null, 2));
    }
  } else {
    console.log('Sheet5 结果为空或不存在');
  }
}

debug().catch(console.error);
