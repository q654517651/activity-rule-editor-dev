/**
 * 图片提取服务 - 从 Excel 提取嵌入图片
 * 100% 对应 Python 版本功能
 */
import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import sharp from 'sharp';

/**
 * 解析 workbook.xml，获取 sheet 对应的文件路径
 */
async function parseWorkbookSheetTarget(zip, sheetTitle) {
  try {
    const wbXml = await zip.file('xl/workbook.xml').async('string');
    const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    
    const wb = parser.parse(wbXml);
    const rels = parser.parse(relsXml);
    
    // 构建 rId -> Target 映射
    const ridMap = {};
    const relationships = rels.Relationships?.Relationship || [];
    const relsArray = Array.isArray(relationships) ? relationships : [relationships];
    
    relsArray.forEach(rel => {
      ridMap[rel['@_Id']] = rel['@_Target'];
    });
    
    // 查找指定 sheet 的 rId
    const sheets = wb.workbook?.sheets?.sheet || [];
    const sheetsArray = Array.isArray(sheets) ? sheets : [sheets];
    
    for (const sh of sheetsArray) {
      const name = sh['@_name'];
      const rid = sh['@_r:id'];
      
      if (name === sheetTitle && ridMap[rid]) {
        const target = ridMap[rid];
        return `xl/${target.replace(/^\//, '')}`.replace('xl//', 'xl/');
      }
    }
    
    return null;
  } catch (err) {
    console.error('[image_extractor] 解析 workbook.xml 失败:', err);
    return null;
  }
}

/**
 * 解析 sheet 的 drawings 路径
 */
async function parseSheetDrawingTarget(zip, sheetPart) {
  const sheetName = path.basename(sheetPart);
  const relsPath = `xl/worksheets/_rels/${sheetName}.rels`;
  
  try {
    const relsFile = zip.file(relsPath);
    if (!relsFile) return null;
    
    const relsXml = await relsFile.async('string');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    
    const rels = parser.parse(relsXml);
    const relationships = rels.Relationships?.Relationship || [];
    const relsArray = Array.isArray(relationships) ? relationships : [relationships];
    
    for (const rel of relsArray) {
      const target = rel['@_Target'] || '';
      if (target.includes('drawings/') && target.endsWith('.xml')) {
        const baseDir = path.posix.dirname(sheetPart);
        const fullPath = path.posix.normalize(path.posix.join(baseDir, target));
        return fullPath;
      }
    }
    
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * 解析 drawings XML，获取锚点 -> 媒体文件映射
 */
async function anchorsMediaMap(zip, drawingPart) {
  const out = {};
  
  try {
    const dxmlFile = zip.file(drawingPart);
    if (!dxmlFile) return out;
    
    const dxml = await dxmlFile.async('string');
    const drelsPath = drawingPart.replace('xl/drawings/', 'xl/drawings/_rels/') + '.rels';
    const drelsFile = zip.file(drelsPath);
    
    if (!drelsFile) return out;
    
    const drels = await drelsFile.async('string');
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: false,
    });
    
    const drawingData = parser.parse(dxml);
    const relsData = parser.parse(drels);
    
    // 构建 rId -> media 映射
    const ridToMedia = {};
    const baseDir = path.posix.dirname(drawingPart);
    const relationships = relsData.Relationships?.Relationship || [];
    const relsArray = Array.isArray(relationships) ? relationships : [relationships];
    
    relsArray.forEach(rel => {
      const rid = rel['@_Id'];
      const target = rel['@_Target'] || '';
      const fullPath = path.posix.normalize(path.posix.join(baseDir, target));
      ridToMedia[rid] = fullPath;
    });
    
    // 解析锚点
    const wsDr = drawingData['xdr:wsDr'];
    if (!wsDr) return out;
    
    const anchors = [
      ...(wsDr['xdr:twoCellAnchor'] || []),
      ...(wsDr['xdr:oneCellAnchor'] || []),
    ].flat();
    
    const anchorsArray = Array.isArray(anchors) ? anchors : [anchors];
    
    for (const anc of anchorsArray) {
      if (!anc) continue;
      
      const fromTag = anc['xdr:from'];
      const pic = anc['xdr:pic'];
      
      if (!fromTag || !pic) continue;
      
      const colEl = fromTag['xdr:col'];
      const rowEl = fromTag['xdr:row'];
      
      if (colEl === undefined || rowEl === undefined) continue;
      
      let c0, r0;
      try {
        c0 = parseInt(colEl);
        r0 = parseInt(rowEl);
      } catch (err) {
        continue;
      }
      
      const blipFill = pic['xdr:blipFill'];
      const blip = blipFill ? blipFill['a:blip'] : null;
      const rid = blip ? blip['@_r:embed'] : null;
      
      if (rid && ridToMedia[rid]) {
        out[`${r0 + 1},${c0 + 1}`] = ridToMedia[rid]; // Excel 从 1 开始
      }
    }
    
    return out;
  } catch (err) {
    console.error('[image_extractor] 解析 drawings 失败:', err);
    return out;
  }
}

/**
 * 从 Excel 提取图片并回填到 result
 */
export async function extractImages(xlsxPath, result, sheetTitle, putBlob) {
  const imagesMap = {};
  
  try {
    const data = await fs.readFile(xlsxPath);
    const zip = await JSZip.loadAsync(data);
    
    // 1. 查找 sheet 对应的文件
    const sheetPart = await parseWorkbookSheetTarget(zip, sheetTitle);
    if (!sheetPart) {
      console.log(`[image_extractor] 未找到工作表: ${sheetTitle}`);
      return imagesMap;
    }
    
    // 2. 查找 drawings
    const drawingPart = await parseSheetDrawingTarget(zip, sheetPart);
    if (!drawingPart) {
      console.log(`[image_extractor] 工作表 ${sheetTitle} 无图片`);
      return imagesMap;
    }
    
    // 3. 解析锚点
    const aMap = await anchorsMediaMap(zip, drawingPart);
    console.log(`[image_extractor] 检测到 ${Object.keys(aMap).length} 个锚点`);
    
    // 4. 提取图片并回填
    for (const page of result.pages || []) {
      // 支持新结构（blocks）和旧结构（sections）
      let sectionsToProcess = [];
      if (page.blocks) {
        for (const block of page.blocks) {
          sectionsToProcess.push(...(block.sections || []));
        }
      } else {
        sectionsToProcess = page.sections || [];
      }
      
      for (const sec of sectionsToProcess) {
        // 处理表格中的图片
        const table = sec.table;
        if (table?.rows) {
          for (const row of table.rows) {
            for (const cell of row) {
              const cellRow = cell._row;
              const cellCol = cell._col;
              
              if (!cellRow || !cellCol) continue;
              
              const media = aMap[`${cellRow},${cellCol}`];
              if (!media) {
                if (cell.is_image) {
                  console.log(`[image_extractor] 警告：表格单元格 (${cellRow}, ${cellCol}) 标记为图片但未找到嵌入图片`);
                }
                continue;
              }
              
              const mediaFile = zip.file(media);
              if (!mediaFile) continue;
              
              try {
                const imageData = await mediaFile.async('nodebuffer');
                const ext = path.extname(media).toLowerCase() || '.png';
                
                // 存储到 blob
                const hash = putBlob(imageData, ext);
                
                // 获取 MIME 类型
                const mimeMap = {
                  '.png': 'image/png',
                  '.jpg': 'image/jpeg',
                  '.jpeg': 'image/jpeg',
                  '.gif': 'image/gif',
                  '.webp': 'image/webp',
                  '.bmp': 'image/bmp',
                  '.tif': 'image/tiff',
                  '.tiff': 'image/tiff',
                };
                const mime = mimeMap[ext] || 'application/octet-stream';
                
                // 获取图片尺寸
                let width, height;
                try {
                  const metadata = await sharp(imageData).metadata();
                  width = metadata.width;
                  height = metadata.height;
                } catch (e) {
                  // 忽略
                }
                
                // 构造 ImageMeta
                const imageMeta = {
                  id: `sha256:${hash}`,
                  url: `/media/${hash}`,
                  mime,
                  ...(width && { w: width }),
                  ...(height && { h: height }),
                };
                
                const expected = cell._expected || 'table_image';
                const filename = `${expected}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
                imagesMap[filename] = imageMeta.url;
                
                // 回填 result
                cell.image = imageMeta;
                cell.is_image = true;
                
                console.log(`[image_extractor] 已提取表格图片: ${filename} -> ${hash.slice(0, 12)}...`);
              } catch (err) {
                console.error(`[image_extractor] 提取表格图片失败 (${cellRow},${cellCol}):`, err);
              }
            }
            
            // 清理元字段
            for (const cell of row) {
              Object.keys(cell).forEach(k => {
                if (k.startsWith('_')) {
                  delete cell[k];
                }
              });
            }
          }
        }
        
        // 处理奖励中的图片
        const rewards = sec.rewards || [];
        for (const r of rewards) {
          const row = r._row;
          const imgCol = r._img_col;
          
          if (!row || !imgCol) {
            // 处理已存在的图片字符串
            const existingImage = r.image;
            if (typeof existingImage === 'string') {
              await processExistingImageString(existingImage, putBlob, r, zip);
            }
            continue;
          }
          
          const media = aMap[`${row},${imgCol}`];
          if (!media) continue;
          
          const mediaFile = zip.file(media);
          if (!mediaFile) continue;
          
          try {
            const imageData = await mediaFile.async('nodebuffer');
            const ext = path.extname(media).toLowerCase() || '.png';
            
            const hash = putBlob(imageData, ext);
            
            const mimeMap = {
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.webp': 'image/webp',
              '.bmp': 'image/bmp',
              '.tif': 'image/tiff',
              '.tiff': 'image/tiff',
            };
            const mime = mimeMap[ext] || 'application/octet-stream';
            
            let width, height;
            try {
              const metadata = await sharp(imageData).metadata();
              width = metadata.width;
              height = metadata.height;
            } catch (e) {
              // 忽略
            }
            
            const imageMeta = {
              id: `sha256:${hash}`,
              url: `/media/${hash}`,
              mime,
              ...(width && { w: width }),
              ...(height && { h: height }),
            };
            
            const expected = r._expected || r.name || 'image';
            const filename = `${expected}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
            imagesMap[filename] = imageMeta.url;
            
            r.image = imageMeta;
            
            console.log(`[image_extractor] 已提取: ${filename} -> ${hash.slice(0, 12)}...`);
          } catch (err) {
            console.error(`[image_extractor] 提取图片失败 (${row},${imgCol}):`, err);
          }
          
          // 清理元字段
          Object.keys(r).forEach(k => {
            if (k.startsWith('_')) {
              delete r[k];
            }
          });
        }
      }
    }
    
    return imagesMap;
  } catch (err) {
    console.error('[image_extractor] 提取图片总体失败:', err);
    return imagesMap;
  }
}

/**
 * 处理已存在的图片字符串（data URL 或文件路径）
 */
async function processExistingImageString(imageStr, putBlob, rewardObj, zip) {
  try {
    if (imageStr.startsWith('data:')) {
      await processDataUrl(imageStr, putBlob, rewardObj);
    } else {
      // 尝试作为文件路径处理
      try {
        const data = await fs.readFile(imageStr);
        const ext = path.extname(imageStr).toLowerCase() || '.png';
        const hash = putBlob(data, ext);
        
        const mime = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
        }[ext] || 'application/octet-stream';
        
        rewardObj.image = {
          id: `sha256:${hash}`,
          url: `/media/${hash}`,
          mime,
        };
      } catch (e) {
        // 忽略
      }
    }
  } catch (err) {
    console.error('[image_extractor] 处理已存图片字符串失败:', err);
  }
}

/**
 * 处理 data URL
 */
async function processDataUrl(dataUrl, putBlob, rewardObj) {
  try {
    const parts = dataUrl.split(',');
    if (parts.length !== 2) return;
    
    const metaPart = parts[0];
    const dataPart = parts[1];
    
    // 解析 MIME
    let mime = 'image/png';
    if (metaPart.includes('image/')) {
      const mimeStart = metaPart.indexOf('image/');
      let mimeEnd = metaPart.indexOf(';', mimeStart);
      if (mimeEnd === -1) mimeEnd = metaPart.length;
      mime = metaPart.slice(mimeStart, mimeEnd);
    }
    
    // 推导扩展名
    const subtype = mime.split('/')[1];
    const ext = `.${subtype}`;
    
    // 解码 base64
    const buffer = Buffer.from(dataPart, 'base64');
    
    // 存储
    const hash = putBlob(buffer, ext);
    
    rewardObj.image = {
      id: `sha256:${hash}`,
      url: `/media/${hash}`,
      mime,
    };
    
    console.log(`[image_extractor] 已转换 data:URL (${mime}) -> ${hash.slice(0, 12)}...`);
  } catch (err) {
    console.error('[image_extractor] data:URL 解码失败:', err);
  }
}
