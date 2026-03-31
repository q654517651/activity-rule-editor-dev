const ExcelJS = require('exceljs');

async function test() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('/Users/mico/Downloads/盛典奖励配置.xlsx');
  const ws = wb.getWorksheet('Sheet5');
  
  console.log('=== 测试合并单元格解析 ===');
  const merges = ws.model?.merges || [];
  console.log('合并单元格数量:', merges.length);
  console.log('前 5 个:', merges.slice(0, 5));
  
  // 测试解析 'A1:G1'
  const testRange = 'A1:G1';
  const match = testRange.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
  console.log('\n解析 A1:G1:', match);
  
  if (match) {
    const [, startCol, startRow, endCol, endRow] = match;
    console.log('  startCol:', startCol, 'startRow:', startRow);
    console.log('  endCol:', endCol, 'endRow:', endRow);
    
    function colToIndex(col) {
      let num = 0;
      for (let i = 0; i < col.length; i++) {
        num = num * 26 + (col.charCodeAt(i) - 64);
      }
      return num;
    }
    
    console.log('  A -> colToIndex:', colToIndex('A'));
    console.log('  G -> colToIndex:', colToIndex('G'));
  }
  
  // 测试第一行内容
  console.log('\n=== 测试第一行内容 ===');
  for (let c = 1; c <= 7; c++) {
    const cell = ws.getCell(1, c);
    console.log(`Row 1, Col ${c}: '${cell.value}'`);
  }
}

test().catch(console.error);
