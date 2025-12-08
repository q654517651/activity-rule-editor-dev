import type { TableData } from "./types";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Group, Image as KImage, Rect } from "react-konva";
import { loadBitmap } from "./useImageCache";

// 计算文字换行（带缓存）
const wrapTextCache = new Map<string, string[]>();

function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
): string[] {
  if (!text) return [""];
  
  const cacheKey = `${text}-${maxWidth}-${fontSize}-${fontFamily}`;
  if (wrapTextCache.has(cacheKey)) {
    return wrapTextCache.get(cacheKey)!;
  }
  
  // 创建临时canvas测量文字
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [text];
  
  ctx.font = `${fontSize}px ${fontFamily}`;
  
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    
    // 通用的按单词换行（支持所有语言）
    // CJK字符每个都可以断行，其他字符按空格分割
    const words: string[] = [];
    let currentWord = "";
    
    for (let i = 0; i < paragraph.length; i++) {
      const char = paragraph[i];
      const isSpace = /\s/.test(char);
      // CJK字符：中日韩统一表意文字、假名、韩文等
      const isCJK = /[\u4e00-\u9fff\u3040-\u30ff\u3130-\u318f\uac00-\ud7af]/.test(char);
      
      if (isSpace) {
        if (currentWord) {
          words.push(currentWord);
          currentWord = "";
        }
        words.push(" "); // 保留空格
      } else if (isCJK) {
        // CJK字符可以独立断行
        if (currentWord) {
          words.push(currentWord);
          currentWord = "";
        }
        words.push(char);
      } else {
        // 其他语言按连续字符累积成单词
        currentWord += char;
      }
    }
    if (currentWord) {
      words.push(currentWord);
    }
    
    // 按单词换行
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine + word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine.trim()) {
        lines.push(currentLine.trim());
        currentLine = word.trim();
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
  }
  
  const result = lines.length > 0 ? lines : [""];
  wrapTextCache.set(cacheKey, result);
  return result;
}

// 单元格布局信息
interface CellLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  cell: any;
  rowIdx: number;
  cellIdx: number;
  lines: string[];
}

export function TableComponentShape({
  table,
  x,
  y,
  width,
  fontSize,
  fontFamily,
  titleColor,
  contentColor,
  direction = "ltr",
  maxImageHeight = 120,
  onHeightMeasured,
  onTableClick,
  forExport = false,
}: {
  table: TableData;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  titleColor: string;
  contentColor: string;
  direction?: "rtl" | "ltr";
  maxImageHeight?: number;
  onHeightMeasured?: (height: number) => void;
  onTableClick?: (table: TableData) => void;
  forExport?: boolean;
}) {
  const [loadedImages, setLoadedImages] = useState<Map<string, CanvasImageSource>>(new Map());
  const [normalImage, setNormalImage] = useState<HTMLCanvasElement | null>(null);
  const [hoveredImage, setHoveredImage] = useState<HTMLCanvasElement | null>(null);
  
  // 使用ref直接操作Konva节点，避免React重渲染
  const imageRef = useRef<any>(null);
  
  const cellPadding = 10; // 单元格内边距
  const minRowHeight = fontSize * 2;
  const cornerRadius = 8;
  
  // 计算列数和列宽
  const colCount = useMemo(() => {
    let maxCols = 0;
    for (const row of table.rows) {
      let rowCols = 0;
      for (const cell of row) {
        rowCols += cell.colspan || 1;
      }
      maxCols = Math.max(maxCols, rowCols);
    }
    return Math.max(maxCols, 1);
  }, [table.rows]);
  
  const colWidth = width / colCount;
  
  // 批量加载所有图片（只setState一次）
  useEffect(() => {
    const loadImages = async () => {
      const imagesToLoad: Array<{ key: string; url: string }> = [];
      
      for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
        const row = table.rows[rowIdx];
        for (let cellIdx = 0; cellIdx < row.length; cellIdx++) {
          const cell = row[cellIdx];
          if (cell.is_image && cell.image) {
            const key = `${rowIdx}-${cellIdx}`;
            const imageUrl = typeof cell.image === "string" ? cell.image : cell.image?.url;
            if (imageUrl) {
              imagesToLoad.push({ key, url: imageUrl });
            }
          }
        }
      }
      
      // 并行加载所有图片
      const results = await Promise.allSettled(
        imagesToLoad.map(async ({ key, url }) => {
          try {
            const bmp = await loadBitmap(url);
            return { key, bmp };
          } catch (e) {
            console.error(`图片加载失败 ${url}:`, e);
            return { key, bmp: null };
          }
        })
      );
      
      const newImages = new Map<string, CanvasImageSource>();
      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value.bmp) {
          newImages.set(result.value.key, result.value.bmp as any);
        }
      });
      
      // 只setState一次
      setLoadedImages(newImages);
    };
    
    loadImages();
  }, [table]);
  
  // 计算单元格布局（优化：只在必要时重算）
  const { cellLayouts, totalHeight, rowPositions } = useMemo(() => {
    const layouts: CellLayout[] = [];
    const rowHeights: number[] = [];
    
    // 构建单元格占用矩阵
    const matrix: boolean[][] = [];
    for (let i = 0; i < table.rows.length; i++) {
      matrix[i] = new Array(colCount).fill(false);
    }
    
    // 第一遍：计算每行高度
    for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
      const row = table.rows[rowIdx];
      let colIdx = 0;
      let maxHeightInRow = minRowHeight;
      
      for (let cellIdx = 0; cellIdx < row.length; cellIdx++) {
        const cell = row[cellIdx];
        const rowspan = cell.rowspan || 1;
        const colspan = cell.colspan || 1;
        
        // 找到第一个未被占用的列
        while (colIdx < colCount && matrix[rowIdx][colIdx]) {
          colIdx++;
        }
        
        if (colIdx >= colCount) continue;
        
        // 标记占用
        for (let r = rowIdx; r < rowIdx + rowspan && r < table.rows.length; r++) {
          for (let c = colIdx; c < colIdx + colspan && c < colCount; c++) {
            matrix[r][c] = true;
          }
        }
        
        // 计算单元格内容高度
        const cellWidth = colWidth * colspan - cellPadding * 2;
        let contentHeight = minRowHeight;
        
        if (cell.is_image) {
          contentHeight = maxImageHeight;
        } else if (cell.value) {
          // 使用缓存的文字换行
          const lines = wrapText(cell.value, cellWidth, fontSize, fontFamily);
          contentHeight = lines.length * fontSize * 1.6;
        }
        
        contentHeight += cellPadding * 2;
        maxHeightInRow = Math.max(maxHeightInRow, contentHeight);
        
        colIdx += colspan;
      }
      
      rowHeights.push(maxHeightInRow);
    }
    
    // 第二遍：生成布局信息
    matrix.length = 0;
    for (let i = 0; i < table.rows.length; i++) {
      matrix[i] = new Array(colCount).fill(false);
    }
    
    const positions: Array<{ y: number; height: number }> = [];
    let currentY = 0;
    
    for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
      positions.push({ y: currentY, height: rowHeights[rowIdx] });
      currentY += rowHeights[rowIdx];
    }
    
    for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
      const row = table.rows[rowIdx];
      let colIdx = 0;
      const rowY = positions[rowIdx].y;
      
      for (let cellIdx = 0; cellIdx < row.length; cellIdx++) {
        const cell = row[cellIdx];
        const rowspan = cell.rowspan || 1;
        const colspan = cell.colspan || 1;
        
        // 找到第一个未被占用的列
        while (colIdx < colCount && matrix[rowIdx][colIdx]) {
          colIdx++;
        }
        
        if (colIdx >= colCount) continue;
        
        // 标记占用
        for (let r = rowIdx; r < rowIdx + rowspan && r < table.rows.length; r++) {
          for (let c = colIdx; c < colIdx + colspan && c < colCount; c++) {
            matrix[r][c] = true;
          }
        }
        
        // 计算单元格高度（跨行单元格高度是多行高度之和）
        let cellHeight = 0;
        for (let r = rowIdx; r < rowIdx + rowspan && r < table.rows.length; r++) {
          cellHeight += rowHeights[r];
        }
        
        // 计算文字换行（使用缓存）
        const cellWidth = colWidth * colspan - cellPadding * 2;
        const lines = cell.value ? wrapText(cell.value, cellWidth, fontSize, fontFamily) : [];
        
        layouts.push({
          x: colIdx * colWidth,
          y: rowY,
          width: colWidth * colspan,
          height: cellHeight,
          cell,
          rowIdx,
          cellIdx,
          lines,
        });
        
        colIdx += colspan;
      }
    }
    
    const totalHeight = currentY;
    
    return { cellLayouts: layouts, totalHeight, rowPositions: positions };
  }, [table, colCount, colWidth, fontSize, fontFamily, maxImageHeight, cellPadding, minRowHeight]);
  
  // 绘制表格到离屏canvas（关键优化：预绘制2个版本）
  useEffect(() => {
    if (totalHeight <= 0 || width <= 0) return;
    
    // 通用绘制函数
    const drawTable = (withBorder: boolean) => {
      const canvas = document.createElement("canvas");
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = totalHeight * dpr;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      
      ctx.scale(dpr, dpr);
      
      // 1. 绘制背景（半透明白色圆角矩形）
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.beginPath();
      ctx.roundRect(0, 0, width, totalHeight, cornerRadius);
      ctx.fill();
      
      // 2. 绘制分割线（考虑合并单元格，不绘制被合并区域内的线）
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 1;
      
      // 为每个单元格绘制右边和下边的线（避免合并单元格内部的线）
      for (const layout of cellLayouts) {
        const { x: cellX, y: cellY, width: cellW, height: cellH, cell } = layout;
        
        ctx.beginPath();
        
        // 只绘制非最右侧单元格的右边线
        const isRightMost = (cellX + cellW) >= width - 1;
        if (!isRightMost) {
          ctx.moveTo(cellX + cellW, cellY);
          ctx.lineTo(cellX + cellW, cellY + cellH);
        }
        
        // 绘制单元格的下边线
        ctx.moveTo(cellX, cellY + cellH);
        ctx.lineTo(cellX + cellW, cellY + cellH);
        
        ctx.stroke();
      }
      
      // 3. 绘制单元格内容
      for (const layout of cellLayouts) {
        const { x: cellX, y: cellY, width: cellW, height: cellH, cell, lines } = layout;
        
        if (cell.is_image) {
          const key = `${layout.rowIdx}-${layout.cellIdx}`;
          const img = loadedImages.get(key);
          if (img) {
            const maxImgW = cellW - cellPadding * 2;
            const maxImgH = Math.min(cellH - cellPadding * 2, maxImageHeight);
            
            const imgAspect = (img as any).width / (img as any).height;
            let imgW = maxImgW;
            let imgH = imgW / imgAspect;
            
            if (imgH > maxImgH) {
              imgH = maxImgH;
              imgW = imgH * imgAspect;
            }
            
            const imgX = cellX + (cellW - imgW) / 2;
            const imgY = cellY + (cellH - imgH) / 2;
            
            ctx.drawImage(img as any, imgX, imgY, imgW, imgH);
          }
        } else if (lines && lines.length > 0) {
          // 绘制文字
          const textColor = cell.bold ? titleColor : contentColor;
          ctx.fillStyle = textColor;
          ctx.font = `${cell.bold ? "bold " : ""}${fontSize}px ${fontFamily}`;
          
          // 文字对齐（带水平内边距）
          const textX = cell.center
            ? cellX + cellW / 2
            : direction === "rtl"
              ? cellX + cellW - cellPadding
              : cellX + cellPadding;
          
          ctx.textAlign = cell.center ? "center" : direction === "rtl" ? "right" : "left";
          
          // 垂直居中（带垂直内边距）
          const lineHeight = fontSize * 1.6;
          const totalTextHeight = lines.length * lineHeight;
          const availableHeight = cellH - cellPadding * 2; // 减去上下内边距
          const startY = cellY + cellPadding + (availableHeight - totalTextHeight) / 2;
          
          ctx.textBaseline = "middle"; // 使用middle基线
          
          lines.forEach((line, lineIdx) => {
            const textY = startY + lineIdx * lineHeight + lineHeight / 2; // 每行的中心点
            ctx.fillText(line, textX, textY);
          });
        }
      }
      
      // 4. 如果需要，绘制红色虚线边框
      if (withBorder) {
        ctx.strokeStyle = "#ff3333";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(0, 0, width, totalHeight);
      }
      
      return canvas;
    };
    
    // 绘制两个版本
    const normal = drawTable(false);
    const hovered = drawTable(true);
    
    setNormalImage(normal);
    setHoveredImage(hovered);
  }, [cellLayouts, totalHeight, loadedImages, width, rowPositions, colCount, colWidth, cellPadding, fontSize, fontFamily, titleColor, contentColor, direction, maxImageHeight, cornerRadius]);
  
  // 上报高度
  const lastReportedHeight = useRef<number | null>(null);
  useEffect(() => {
    if (onHeightMeasured && totalHeight > 0 && totalHeight !== lastReportedHeight.current) {
      lastReportedHeight.current = totalHeight;
      onHeightMeasured(totalHeight);
    }
  }, [totalHeight, onHeightMeasured]);
  
  // 点击处理
  const handleClick = useCallback(() => {
    if (onTableClick) {
      onTableClick(table);
    }
  }, [onTableClick, table]);
  
  // 悬浮处理（直接操作Konva节点，零React开销）
  const handleMouseEnter = useCallback(() => {
    if (imageRef.current && hoveredImage) {
      imageRef.current.image(hoveredImage);
      // ✅ 不调用 batchDraw()！Konva会在下一帧自动重绘脏节点
    }
  }, [hoveredImage]);
  
  const handleMouseLeave = useCallback(() => {
    if (imageRef.current && normalImage) {
      imageRef.current.image(normalImage);
      // ✅ 不调用 batchDraw()！
    }
  }, [normalImage]);
  
  return (
    <Group x={x} y={y}>
      {/* 始终使用normalImage，hover时通过ref切换 */}
      {normalImage && (
        <KImage
          ref={imageRef}
          height={totalHeight}
          image={normalImage}
          listening={true}
          width={width}
          x={0}
          y={0}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      )}
    </Group>
  );
}
