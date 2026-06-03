/**
 * Excel 解析服务 - 使用 exceljs
 * 100% 对应 Python 版本的功能
 */
import ExcelJS from 'exceljs';

// RTL 地区列表
const RTL_REGIONS = new Set(['MECA', 'ARAB', 'ARABIC', 'SA', 'UAE', 'EG', 'IL', 'ISRAEL', 'JO', 'LB', 'IQ', 'SY', 'XM']);

/**
 * 检测字符串中是否包含 RTL（阿拉伯语 / 希伯来语）字符。
 * 覆盖区间：
 *  - 希伯来语 U+0590-U+05FF
 *  - 阿拉伯语 U+0600-U+06FF
 *  - 阿拉伯语补充 U+0750-U+077F
 *  - 阿拉伯语扩展-A U+08A0-U+08FF
 *  - 阿拉伯语表现形式-A U+FB50-U+FDFF
 *  - 阿拉伯语表现形式-B U+FE70-U+FEFF
 */
function containsRTLChars(text) {
  if (!text) return false;
  return /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * 判断是否为 RTL 语言地区。
 *
 * 两种判定方式（满足任意一种即视为 RTL）：
 *  1. region code 字符串中包含预定义的 RTL 地区标识（如 MECA、SA、IL 等）。
 *  2. region code 字符串本身包含阿拉伯语 / 希伯来语字符
 *     （兼容把阿拉伯文标题直接当作 region 名的情况）。
 */
function isRTLRegion(regionCode) {
  if (!regionCode) return false;
  // 方式 2：直接检测内容中的 RTL 字符
  if (containsRTLChars(regionCode)) return true;
  // 方式 1：匹配预定义地区代码
  const upperCode = regionCode.toUpperCase();
  return Array.from(RTL_REGIONS).some(rtl => upperCode.includes(rtl));
}

/**
 * 清理文本内容
 */
function cleanText(value) {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  
  // 去除 Excel 公式包装 =""
  if (str.startsWith('="') && str.endsWith('"')) {
    str = str.slice(2, -1);
  }
  
  // 去除前导 =
  if (str.startsWith('=')) {
    str = str.slice(1);
  }
  
  return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

/**
 * 构建合并单元格索引
 * 返回 Map: "r,c" -> { minRow, minCol, maxRow, maxCol }
 */
function buildMergeIndex(worksheet) {
  const mergeIndex = new Map();
  
  // exceljs 的 merges 格式：{ model: { merges: ['A1:B2', 'C3:D4'] } }
  const merges = worksheet.model?.merges || [];
  
  merges.forEach(range => {
    // 解析范围如 'A1:B2'
    const cells = worksheet._worksheetReader?._parseMergeCells?.(range) || parseMergeRange(range);
    if (!cells) return;
    
    const { top, left, bottom, right } = cells;
    
    // 记录所有被合并的单元格
    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        mergeIndex.set(`${r},${c}`, {
          minRow: top,
          minCol: left,
          maxRow: bottom,
          maxCol: right,
        });
      }
    }
  });
  
  return mergeIndex;
}

/**
 * 解析合并单元格范围字符串（如 'A1:B2'）
 */
function parseMergeRange(range) {
  const match = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
  if (!match) return null;
  
  const [, startCol, startRow, endCol, endRow] = match;
  
  return {
    top: parseInt(startRow),
    left: colToIndex(startCol),
    bottom: parseInt(endRow),
    right: colToIndex(endCol),
  };
}

/**
 * 列字母转索引 (A=1, B=2, ...)
 */
function colToIndex(col) {
  let num = 0;
  for (let i = 0; i < col.length; i++) {
    num = num * 26 + (col.charCodeAt(i) - 64);
  }
  return num;
}

/**
 * 获取单元格信息（值、格式、样式）
 */
function getCellInfo(worksheet, row, col, mergeIndex) {
  const key = `${row},${col}`;
  let cell;
  
  // 如果在合并区域，获取主单元格
  if (mergeIndex.has(key)) {
    const merge = mergeIndex.get(key);
    cell = worksheet.getRow(merge.minRow).getCell(merge.minCol);
  } else {
    cell = worksheet.getRow(row).getCell(col);
  }
  
  let value = cell.value;
  
  // 处理富文本
  if (value?.richText) {
    value = value.richText.map(t => t.text).join('');
  }
  
  // 处理公式
  if (value?.formula) {
    value = value.result || '';
  }
  
  // 处理错误
  if (value?.error) {
    value = '';
  }
  
  // 处理百分比（检查 numFmt）
  if (typeof value === 'number' && cell.numFmt && cell.numFmt.includes('%')) {
    value = `${(value * 100).toString().replace(/\.?0+$/, '')}%`;
  }
  
  // 读取对齐
  const alignment = cell.alignment?.horizontal || null;
  
  // 读取字体
  const bold = cell.font?.bold || false;
  const italic = cell.font?.italic || false;
  
  // 读取颜色
  let color = null;
  if (cell.font?.color?.argb) {
    const argb = cell.font.color.argb;
    if (argb.length === 8) {
      color = `#${argb.slice(2)}`; // 去掉 alpha 通道
    } else if (argb.length === 6) {
      color = `#${argb}`;
    }
  }
  
  return {
    value,
    alignment,
    bold,
    italic,
    color,
    center: alignment === 'center',
  };
}

/**
 * 获取单元格值（仅文本）
 */
function getValue(worksheet, row, col, mergeIndex) {
  const info = getCellInfo(worksheet, row, col, mergeIndex);
  return info.value;
}

/**
 * 获取一行的值（指定列范围）
 */
function rowRegionValues(worksheet, row, colStart, colEnd, mergeIndex) {
  const values = [];
  for (let c = colStart; c <= colEnd; c++) {
    const val = getValue(worksheet, row, c, mergeIndex);
    values.push(cleanText(val));
  }
  return values;
}

/**
 * 获取一行的值和格式
 */
function rowRegionValuesWithFormat(worksheet, row, colStart, colEnd, mergeIndex) {
  const result = [];
  for (let c = colStart; c <= colEnd; c++) {
    const info = getCellInfo(worksheet, row, c, mergeIndex);
    result.push({
      value: cleanText(info.value),
      bold: info.bold,
      center: info.center,
    });
  }
  return result;
}

/**
 * 检查行是否为空
 */
function isRowBlank(values) {
  return values.every(v => v === '');
}

/**
 * 查找所有 REGION 标记
 */
function findRegions(worksheet, mergeIndex) {
  const regions = [];
  const maxRow = worksheet.rowCount;
  const maxCol = worksheet.columnCount;
  
  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const v = cleanText(getValue(worksheet, r, c, mergeIndex));
      if (v.startsWith('REGION-')) {
        let r0 = r, c0 = c, c1 = c;
        
        // 检查是否在合并区域
        const key = `${r},${c}`;
        if (mergeIndex.has(key)) {
          const merge = mergeIndex.get(key);
          r0 = merge.minRow;
          c0 = merge.minCol;
          c1 = merge.maxCol;
        }
        
        regions.push({
          code: v.split('REGION-')[1].trim(),
          row: r0,
          col_start: c0,
          col_end: c1,
        });
      }
    }
  }
  
  // 去重 + 排序
  const seen = new Set();
  const unique = [];
  
  for (const rg of regions) {
    const key = `${rg.code},${rg.row},${rg.col_start},${rg.col_end}`;
    if (!seen.has(key)) {
      unique.push(rg);
      seen.add(key);
    }
  }
  
  unique.sort((a, b) => {
    if (a.col_start !== b.col_start) return a.col_start - b.col_start;
    return a.row - b.row;
  });
  
  return unique;
}

/**
 * 扫描区域内的所有 TITLE 标记
 */
function scanTitles(worksheet, region, mergeIndex) {
  const c1 = region.col_start;
  const c2 = region.col_end;
  const startRow = region.row + 1;
  const maxRow = worksheet.rowCount;
  const titles = [];
  
  for (let r = startRow; r <= maxRow; r++) {
    const rowVals = rowRegionValues(worksheet, r, c1, c2, mergeIndex);
    for (let i = 0; i < rowVals.length; i++) {
      const v = rowVals[i];
      if (v.startsWith('TITLE-')) {
        const titleType = v.split('TITLE-')[1].trim();
        const titleText = rowVals[i + 1] || '';
        titles.push([titleType, titleText, r]);
        break;
      }
    }
  }
  
  return titles;
}

/**
 * 解析 section 块
 */
function parseSectionBlock(worksheet, c1, c2, rStart, rEnd, mergeIndex) {
  const sections = [];
  let r = rStart;
  const blockFreeParagraphs = [];
  
  // 收集奖励
  const collectRewards = (r0, sectionTitle) => {
    const items = [];
    let rr = r0;
    
    while (rr <= rEnd) {
      const rv = rowRegionValues(worksheet, rr, c1, c2, mergeIndex);
      const first = rv[0] || '';
      
      // 停止条件
      if (rr !== r0) {
        if (first.startsWith('TITLE-') || first.startsWith('RINK-') || 
            first.startsWith('RANK-') || first.startsWith('RULES-') || 
            first.startsWith('TABLE-')) {
          break;
        }
        if (isRowBlank(rv)) break;
      }
      
      const name = rv[1] || '';
      const imgText = rv[2] || '';
      const desc = rv[3] || '';
      
      let finalName = name;
      let finalDesc = desc;
      
      if (!finalName) {
        for (const vv of rv.slice(1)) {
          if (vv) {
            if (!finalName) finalName = vv;
            else if (!finalDesc) finalDesc = vv;
          }
        }
      }
      
      if (finalName || finalDesc || imgText) {
        items.push({
          name: finalName,
          image: imgText,
          desc: finalDesc,
          _row: rr,
          _img_col: c1 + 2,
          _expected: imgText || finalName,
        });
      }
      
      rr++;
    }
    
    sections.push({ title: sectionTitle, content: '', rewards: items });
    return rr;
  };
  
  // 收集表格
  const collectTable = (r0) => {
    const tableData = {
      type: 'table',
      rows: [],
    };
    
    let tableC1 = c1;
    let tableC2 = c2;
    
    // 查找 TABLE- 标记的列范围
    const rvTableMarker = rowRegionValues(worksheet, r0, c1, c2, mergeIndex);
    for (let colIdx = 0; colIdx < rvTableMarker.length; colIdx++) {
      const val = rvTableMarker[colIdx];
      if (val.startsWith('TABLE-')) {
        const actualCol = c1 + colIdx;
        const key = `${r0},${actualCol}`;
        
        if (mergeIndex.has(key)) {
          const merge = mergeIndex.get(key);
          tableC1 = merge.minCol === c1 ? merge.minCol + 1 : merge.minCol;
          tableC2 = merge.maxCol;
        } else {
          tableC1 = c1 + 1;
          tableC2 = c2;
        }
        break;
      }
    }
    
    let rr = r0 + 1; // 跳过 TABLE- 标记行
    
    while (rr <= rEnd) {
      // 检查标记列
      const markerColVal = cleanText(getValue(worksheet, rr, c1, mergeIndex));
      if (markerColVal && (markerColVal.startsWith('TITLE-') || 
          markerColVal.startsWith('RINK-') || markerColVal.startsWith('RANK-'))) {
        break;
      }
      
      const rv = rowRegionValues(worksheet, rr, tableC1, tableC2, mergeIndex);
      
      // 检查内容列是否有 TABLE- 结束标记
      const hasTableInContent = rv.some(val => val.startsWith('TABLE-'));
      if (hasTableInContent) break;
      
      // 收集行数据
      const rowData = [];
      
      for (let colIdx = 0; colIdx < rv.length; colIdx++) {
        const val = rv[colIdx];
        const actualRow = rr;
        const actualCol = tableC1 + colIdx;
        const key = `${actualRow},${actualCol}`;
        
        let rowspan = 1;
        let colspan = 1;
        let isMergedChild = false;
        
        if (mergeIndex.has(key)) {
          const merge = mergeIndex.get(key);
          rowspan = merge.maxRow - merge.minRow + 1;
          colspan = merge.maxCol - merge.minCol + 1;
          
          // 非左上角的合并单元格跳过
          if (actualRow !== merge.minRow || actualCol !== merge.minCol) {
            isMergedChild = true;
          }
        }
        
        if (isMergedChild) continue;
        
        // 获取格式信息
        const cellInfo = getCellInfo(worksheet, actualRow, actualCol, mergeIndex);
        const isBold = cellInfo.bold;
        const isCenter = cellInfo.center;
        
        // 检测是否是图片
        let isImage = false;
        let imageId = null;
        
        if (val) {
          const valLower = val.toLowerCase();
          const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
          if (imageExts.some(ext => valLower.includes(ext)) || valLower.startsWith('image:')) {
            isImage = true;
            imageId = valLower.startsWith('image:') ? val.slice(6).trim() : val;
          }
        }
        
        const cellData = {
          value: val,
          is_image: isImage,
          rowspan,
          colspan,
          bold: isBold,
          center: isCenter,
          _row: actualRow,
          _col: actualCol,
          _expected: isImage ? imageId : null,
        };
        
        rowData.push(cellData);
      }
      
      tableData.rows.push(rowData);
      rr++;
    }
    
    sections.push({
      title: '',
      content: '',
      rewards: [],
      table: tableData,
    });
    
    // 跳过 TABLE- 结束标记
    if (rr <= rEnd) {
      const rvCheck = rowRegionValues(worksheet, rr, tableC1, tableC2, mergeIndex);
      if (rvCheck.some(val => val.startsWith('TABLE-'))) {
        rr++;
      }
    }
    
    return rr;
  };
  
  // 收集规则内容
  const collectRulesContent = (r0, sectionTitle) => {
    const paragraphs = [];
    const seenLines = new Set();
    let rr = r0;
    
    while (rr <= rEnd) {
      // 读取单元格信息（带格式）
      const cellsInfo = [];
      for (let c = c1; c <= c2; c++) {
        const info = getCellInfo(worksheet, rr, c, mergeIndex);
        cellsInfo.push(info);
      }
      
      const rv = cellsInfo.map(cell => cleanText(cell.value));
      
      // 停止条件
      if (rr > r0) {
        const first = rv[0] || '';
        if (first && (first.startsWith('TITLE-') || first.startsWith('RINK-') || first.startsWith('RANK-'))) {
          break;
        }
        
        const hasTableInContent = rv.slice(1).some(val => val.startsWith('TABLE-'));
        if (hasTableInContent) break;
        
        // 连续空行检查
        if (isRowBlank(rv)) {
          if (rr + 1 <= rEnd) {
            const nextRv = rowRegionValues(worksheet, rr + 1, c1, c2, mergeIndex);
            const nextFirst = nextRv[0] || '';
            if (isRowBlank(nextRv) || nextFirst.startsWith('TITLE-') || 
                nextFirst.startsWith('RINK-') || nextFirst.startsWith('RANK-')) {
              break;
            }
          } else {
            break;
          }
        }
      }
      
      // 构建段落
      let paragraphAlign = 'left';
      const runs = [];
      const seenRow = new Set();
      
      // 跳过第一列（标记列）
      for (const cellInfo of cellsInfo.slice(1)) {
        const val = cleanText(cellInfo.value);
        if (!val || seenRow.has(val)) continue;
        
        seenRow.add(val);
        
        const run = { text: val };
        
        if (cellInfo.bold) run.bold = true;
        if (cellInfo.italic) run.italic = true;
        if (cellInfo.color) run.color = cellInfo.color;
        
        const alignment = cellInfo.alignment;
        if (alignment === 'center') paragraphAlign = 'center';
        else if (alignment === 'right') paragraphAlign = 'right';
        else if (alignment === 'left') paragraphAlign = 'left';
        
        runs.push(run);
      }
      
      // 行去重
      if (runs.length > 0) {
        const lineKey = runs.map(run => run.text).join('|');
        if (!seenLines.has(lineKey)) {
          paragraphs.push({
            align: paragraphAlign,
            runs,
          });
          seenLines.add(lineKey);
        }
      } else {
        // 空行
        paragraphs.push({
          align: 'left',
          runs: [{ text: '' }],
        });
      }
      
      rr++;
    }
    
    sections.push({
      title: sectionTitle,
      paragraphs,
      rewards: [],
    });
    
    return rr;
  };
  
  // 主解析循环
  while (r <= rEnd) {
    const rv = rowRegionValues(worksheet, r, c1, c2, mergeIndex);
    
    if (isRowBlank(rv)) {
      r++;
      continue;
    }
    
    const first = rv[0] || '';
    
    // 检查内容列是否有 TABLE-
    const hasTableInContent = rv.slice(1).some(val => val.startsWith('TABLE-'));
    if (hasTableInContent) {
      r = collectTable(r);
      continue;
    }
    
    if (first.startsWith('RULES-')) {
      const title = first.split('RULES-')[1].trim();
      
      // 查找相同标题的结束位置
      let rulesEnd = r;
      while (rulesEnd + 1 <= rEnd) {
        const nextRv = rowRegionValues(worksheet, rulesEnd + 1, c1, c2, mergeIndex);
        const nextFirst = nextRv[0] || '';
        
        if (isRowBlank(nextRv)) break;
        if (nextFirst.startsWith('TITLE-') || nextFirst.startsWith('RINK-') || 
            nextFirst.startsWith('RANK-') || nextFirst.startsWith('TABLE-')) break;
        
        if (nextFirst.startsWith('RULES-')) {
          const nextTitle = nextFirst.split('RULES-')[1].trim();
          if (nextTitle === title) {
            rulesEnd++;
          } else {
            break;
          }
        } else {
          rulesEnd++;
        }
      }
      
      const tempREnd = rEnd;
      r = collectRulesContent(r, title);
      continue;
    }
    
    if (first.startsWith('RANK-') || first.startsWith('RINK-')) {
      const sub = first.startsWith('RANK-') 
        ? first.split('RANK-')[1].trim() 
        : first.split('RINK-')[1].trim();
      r = collectRewards(r, sub);
      continue;
    }
    
    // Fallback：构建段落
    const cellsInfo = [];
    for (let c = c1; c <= c2; c++) {
      const info = getCellInfo(worksheet, r, c, mergeIndex);
      cellsInfo.push(info);
    }
    
    let paragraphAlign = 'left';
    const runs = [];
    const seenRow = new Set();
    
    for (const cellInfo of cellsInfo.slice(1)) {
      const val = cleanText(cellInfo.value);
      if (!val || seenRow.has(val)) continue;
      
      seenRow.add(val);
      
      const run = { text: val };
      if (cellInfo.bold) run.bold = true;
      if (cellInfo.italic) run.italic = true;
      if (cellInfo.color) run.color = cellInfo.color;
      
      const alignment = cellInfo.alignment;
      if (alignment === 'center') paragraphAlign = 'center';
      else if (alignment === 'right') paragraphAlign = 'right';
      
      runs.push(run);
    }
    
    if (runs.length > 0) {
      blockFreeParagraphs.push({
        align: paragraphAlign,
        runs,
      });
    } else {
      blockFreeParagraphs.push({
        align: 'left',
        runs: [{ text: '' }],
      });
    }
    
    r++;
  }
  
  return { sections, fallback: blockFreeParagraphs };
}

/**
 * 合并相同标题的 reward sections
 */
function mergeRewardSections(sections) {
  const merged = [];
  const titleToIndex = {};
  
  for (const s of sections) {
    if (s.rewards && s.rewards.length > 0) {
      const title = s.title || '';
      if (title in titleToIndex) {
        const idx = titleToIndex[title];
        merged[idx].rewards.push(...s.rewards);
      } else {
        titleToIndex[title] = merged.length;
        merged.push({
          title,
          paragraphs: [],
          rewards: [...s.rewards],
        });
      }
    } else {
      merged.push(s);
    }
  }
  
  return merged;
}

/**
 * 解析工作表
 */
export async function parseSheet(worksheet) {
  const mergeIndex = buildMergeIndex(worksheet);
  const regions = findRegions(worksheet, mergeIndex);
  const pages = [];
  
  for (const region of regions) {
    const c1 = region.col_start;
    const c2 = region.col_end;
    const titles = scanTitles(worksheet, region, mergeIndex);
    const blocks = [];
    
    for (let i = 0; i < titles.length; i++) {
      const [titleType, titleText, trow] = titles[i];
      const rStart = trow + 1;
      const rEnd = i + 1 < titles.length ? titles[i + 1][2] - 1 : worksheet.rowCount;
      
      const { sections: secs, fallback } = parseSectionBlock(worksheet, c1, c2, rStart, rEnd, mergeIndex);
      
      let mergedSecs;
      if (secs.length > 0) {
        mergedSecs = mergeRewardSections(secs);
      } else {
        mergedSecs = [{
          title: titleText || titleType,
          paragraphs: fallback,
          rewards: [],
        }];
      }
      
      // 判断 block 类型
      const totalRewards = mergedSecs.reduce((sum, sec) => sum + (sec.rewards?.length || 0), 0);
      const titleLower = titleType.toLowerCase();
      const rewardKeywords = ['奖励', 'reward', '榜', '排行', '排名', 'leaderboard', 'prize', '奖品'];
      const hasRewardKeyword = rewardKeywords.some(kw => titleLower.includes(kw));
      const blockType = (totalRewards > 0 || hasRewardKeyword) ? 'rewards' : 'rules';
      
      let finalTitle = titleText || titleType;
      if (finalTitle.startsWith('TITLE-')) {
        finalTitle = finalTitle.split('TITLE-')[1].trim();
      }
      
      blocks.push({
        block_title: finalTitle,
        block_type: blockType,
        sections: mergedSecs,
      });
    }
    
    const direction = isRTLRegion(region.code) ? 'rtl' : 'ltr';
    
    pages.push({
      region: region.code,
      direction,
      blocks,
    });
  }
  
  return { pages };
}

/**
 * 检查工作表是否包含 REGION- 标记
 */
function hasRegionMarker(worksheet) {
  if (worksheet.rowCount < 1) return false;
  
  const row = worksheet.getRow(1);
  for (let c = 1; c <= worksheet.columnCount; c++) {
    const cell = row.getCell(c);
    const value = cell.value;
    if (value && String(value).trim().startsWith('REGION-')) {
      return true;
    }
  }
  
  return false;
}

/**
 * 解析 Excel 文件
 */
export async function parseFile(filePath, sheetName = null) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const sheets = {};
  const skippedSheets = [];
  
  // 收集需要解析的 sheets
  const sheetsToProcess = [];
  workbook.eachSheet((worksheet) => {
    const name = worksheet.name;
    
    // 如果指定了 sheet，只解析指定的
    if (sheetName && name !== sheetName) {
      return;
    }
    
    // 跳过隐藏的 sheet
    if (worksheet.state === 'hidden' || worksheet.state === 'veryHidden') {
      skippedSheets.push(name);
      return;
    }
    
    // 跳过没有 REGION- 标记的 sheet
    if (!hasRegionMarker(worksheet)) {
      console.log(`[excel_parser] 跳过 sheet ${name}（无 REGION- 标记）`);
      skippedSheets.push(name);
      return;
    }
    
    sheetsToProcess.push({ name, worksheet });
  });
  
  // 异步解析所有 sheets
  for (const { name, worksheet } of sheetsToProcess) {
    try {
      const result = await parseSheet(worksheet);
      sheets[name] = result;
      console.log(`[excel_parser] 成功解析 sheet: ${name}`);
    } catch (err) {
      console.error(`[excel_parser] 解析 sheet ${name} 失败:`, err);
      skippedSheets.push(name);
    }
  }
  
  return {
    sheets,
    skipped_sheets: skippedSheets,
  };
}
