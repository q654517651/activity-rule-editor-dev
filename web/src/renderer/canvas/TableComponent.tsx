import type { TableData } from "./types";
import type Konva from "konva";

import { useRef, useLayoutEffect, useState, useEffect, useMemo } from "react";
import { Group, Rect, Text, Line, Image as KImage } from "react-konva";

import { loadBitmap } from "./useImageCache";

export function TableComponent({
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
  onTextClick,
  onImageClick,
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
  onTextClick?: (rowIdx: number, colIdx: number, value: string) => void;
  onImageClick?: (
    rowIdx: number,
    colIdx: number,
    currentImage?: string,
  ) => void;
  forExport?: boolean;
}) {
  // 存储每个单元格文本节点的高度
  const [cellHeights, setCellHeights] = useState<Map<string, number>>(
    new Map(),
  );
  const textRefs = useRef<Map<string, Konva.Text>>(new Map());
  const imageRefs = useRef<Map<string, Konva.Image>>(new Map());

  // 悬浮状态管理 - 存储当前悬浮的单元格 {rowIdx, colIdx}
  const [hoveredCell, setHoveredCell] = useState<{
    row: number;
    col: number;
  } | null>(null);

  // 存储已加载的图片
  const [loadedImages, setLoadedImages] = useState<
    Map<string, CanvasImageSource>
  >(new Map());

  // 存储图片加载状态
  const [imageLoadingStatus, setImageLoadingStatus] = useState<
    Map<string, "loading" | "loaded" | "error" | "none">
  >(new Map());

  // 重试计数器，避免无限重试
  const retryCountRef = useRef(0);
  const maxRetries = 5;

  // 追踪图片加载完成数量，用于强制触发高度更新
  const [loadedImageCount, setLoadedImageCount] = useState(0);

  // 标记是否正在重新测量（避免在清空缓存后立即报告不准确的高度）
  const [isMeasuring, setIsMeasuring] = useState(false);

  // 当影响高度的属性变化时，清空测量缓存并重置重试计数
  useEffect(() => {
    setIsMeasuring(true); // 标记为正在测量
    setCellHeights(new Map());
    retryCountRef.current = 0;
  }, [fontSize, table, width, fontFamily, maxImageHeight]);

  // 加载所有表格中的图片（渐进式加载，带状态追踪）
  useEffect(() => {
    const loadImages = async () => {
      const newImages = new Map<string, CanvasImageSource>();
      const statusMap = new Map<
        string,
        "loading" | "loaded" | "error" | "none"
      >();

      // 收集所有需要加载的图片
      const imagesToLoad: Array<{
        key: string;
        url: string;
        rowIdx: number;
        colIdx: number;
      }> = [];

      for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
        const row = table.rows[rowIdx];

        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          const cell = row[colIdx];
          const key = `${rowIdx}-${colIdx}`;

          if (cell.is_image) {
            // 处理新旧两种格式：字符串 URL 或 ImageMeta 对象（与奖励图片一致）
            const imageUrl =
              typeof cell.image === "string" ? cell.image : cell.image?.url;

            if (imageUrl) {
              imagesToLoad.push({ key, url: imageUrl, rowIdx, colIdx });
              statusMap.set(key, "loading");
            } else {
              // 标记为图片但没有URL，设置为none状态
              statusMap.set(key, "none");
            }
          }
        }
      }

      // 先设置所有图片为加载中
      setImageLoadingStatus(new Map(statusMap));

      // 按顺序加载图片（利用并发控制）
      let completedCount = 0;
      for (const { key, url } of imagesToLoad) {
        try {
          const bmp = await loadBitmap(url);

          if (bmp) {
            newImages.set(key, bmp as any);
            statusMap.set(key, "loaded");
          } else {
            statusMap.set(key, "error");
          }
        } catch (error) {
          console.error(`[TableComponent] 图片加载失败 ${url}:`, error);
          statusMap.set(key, "error");
        }

        completedCount++;

        // 每加载一张图片就更新状态，实现渐进式加载
        setImageLoadingStatus(new Map(statusMap));
        setLoadedImages(new Map(newImages));
        setLoadedImageCount(completedCount); // 更新加载完成计数
      }
    };

    loadImages();
  }, [table]);

  // 计算列数：遍历所有行，找出最大列数（支持不同行有不同列数）
  let colCount = 0;

  for (const row of table.rows) {
    let rowColCount = 0;
    for (const cell of row) {
      rowColCount += cell.colspan || 1;
    }
    colCount = Math.max(colCount, rowColCount);
  }

  const colWidth = width / Math.max(colCount, 1); // 防止除以0
  const cellPadding = 8;
  const minRowHeight = fontSize * 2;
  const textAlign = direction === "rtl" ? "right" : "left";
  const cornerRadius = 8; // 圆角半径

  // 预先计算单元格布局（使用 useMemo 避免每次渲染都重新计算）
  const cellLayout = useMemo(() => {
    const layout: Array<{
      rowIdx: number;
      cellIdx: number;
      colIdx: number;
      rowspan: number;
      colspan: number;
    }> = [];

    // 构建单元格占用矩阵
    const matrix: boolean[][] = [];

    for (let i = 0; i < table.rows.length; i++) {
      matrix[i] = new Array(colCount).fill(false);
    }

    // 遍历所有行和单元格，计算每个单元格的实际列位置
    for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
      const row = table.rows[rowIdx];
      let colIdx = 0;

      for (let cellIdx = 0; cellIdx < row.length; cellIdx++) {
        const cell = row[cellIdx];
        const rowspan = cell.rowspan || 1;
        const colspan = cell.colspan || 1;

        // 找到第一个未被占用的列
        while (colIdx < colCount && matrix[rowIdx][colIdx]) {
          colIdx++;
        }

        // 如果列索引超出范围，跳过
        if (colIdx >= colCount) {
          continue;
        }

        // 记录单元格位置
        layout.push({
          rowIdx,
          cellIdx,
          colIdx,
          rowspan,
          colspan,
        });

        // 标记该单元格占用的所有位置
        for (
          let r = rowIdx;
          r < rowIdx + rowspan && r < table.rows.length;
          r++
        ) {
          for (let c = colIdx; c < colIdx + colspan && c < colCount; c++) {
            matrix[r][c] = true;
          }
        }

        // 移动到下一列
        colIdx += colspan;
      }
    }

    return { layout, matrix };
  }, [table.rows, colCount]);

  // 测量所有单元格的实际高度（使用 RAF 确保 Konva 渲染完成）
  // 大表格优化：超过50行时跳过逐单元格测量，直接使用统一高度
  useLayoutEffect(() => {
    const isLargeTable = table.rows.length > 50;
    
    // 大表格直接标记为测量完成，使用统一高度
    if (isLargeTable) {
      setIsMeasuring(false);
      return;
    }
    
    let cancelled = false;
    let retryRafId: number | null = null;

    const measure = () => {
      if (cancelled) return;

      const newHeights = new Map<string, number>();
      let hasChanges = false;
      let hasUnmeasured = false;
      let measuredCount = 0;

      // 测量文本节点
      textRefs.current.forEach((textNode, key) => {
        if (textNode) {
          const height = textNode.height();

          if (height > 0) {
            newHeights.set(key, height);
            measuredCount++;
            if (!cellHeights.has(key) || cellHeights.get(key) !== height) {
              hasChanges = true;
            }
          } else {
            // 高度为 0，标记为未完成测量
            hasUnmeasured = true;
          }
        }
      });

      // 测量图片节点
      imageRefs.current.forEach((imageNode, key) => {
        if (imageNode) {
          const height = imageNode.height();

          if (height > 0) {
            newHeights.set(key, height);
            measuredCount++;
            if (!cellHeights.has(key) || cellHeights.get(key) !== height) {
              hasChanges = true;
            }
          } else {
            hasUnmeasured = true;
          }
        }
      });

      if (hasChanges) {
        setCellHeights(newHeights);
        // 重置重试计数器
        retryCountRef.current = 0;
      }

      // 如果有未测量的节点，且未超过最大重试次数，用 RAF 重试
      if (hasUnmeasured && retryCountRef.current < maxRetries && !cancelled) {
        retryCountRef.current++;
        // 关键：追踪递归RAF，以便清理
        retryRafId = requestAnimationFrame(measure);
      } else if (measuredCount > 0) {
        // 测量完成，清除正在测量的标记
        setIsMeasuring(false);
      }
    };

    // 等 Konva 真正渲染完这一帧再测量
    const rafId = requestAnimationFrame(measure);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      // 关键：取消递归创建的RAF
      if (retryRafId != null) {
        cancelAnimationFrame(retryRafId);
      }
    };
  }, [loadedImageCount, fontSize, table, width, fontFamily, maxImageHeight]); // 依赖所有影响高度的属性

  // 计算每一行的独立高度（根据该行中最高的单元格）
  const getRowHeight = (rowIdx: number): number => {
    const row = table.rows[rowIdx];
    let maxHeight = minRowHeight;
    let hasMeasuredCells = false;

    // 遍历该行的所有单元格，找出最大高度
    for (let cellIdx = 0; cellIdx < row.length; cellIdx++) {
      const key = `${rowIdx}-${cellIdx}`;
      const cellHeight = cellHeights.get(key);

      if (cellHeight && cellHeight > 0) {
        hasMeasuredCells = true;
        maxHeight = Math.max(maxHeight, cellHeight);
      }
    }

    // 如果还没有测量到该行的单元格，使用估算
    if (!hasMeasuredCells) {
      // 检查该行是否有图片单元格
      let hasImages = false;
      for (const cell of row) {
        if (cell.is_image) {
          hasImages = true;
          break;
        }
      }

      // 如果有图片，使用图片最大高度估算；否则使用文本估算
      maxHeight = hasImages ? maxImageHeight : minRowHeight;
    }

    // 加上上下 padding
    return maxHeight + cellPadding * 2;
  };

  // 计算每行的 Y 坐标和高度（每行独立计算高度）
  const rowPositions: Array<{ y: number; height: number }> = [];
  let currentY = 0;

  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const rowHeight = getRowHeight(rowIdx);
    rowPositions.push({ y: currentY, height: rowHeight });
    currentY += rowHeight;
  }

  const totalHeight = currentY;

  // 通知父组件总高度 - 只依赖 totalHeight，确保每次高度变化都会通知
  const onHeightMeasuredRef = useRef(onHeightMeasured);
  const lastReportedHeightRef = useRef<number | null>(null);
  const heightStabilityTimerRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    onHeightMeasuredRef.current = onHeightMeasured;
  }, [onHeightMeasured]);

  useLayoutEffect(() => {
    if (!onHeightMeasuredRef.current || totalHeight <= 0) return;
    
    // 如果正在测量中，不报告（等待测量完成）
    if (isMeasuring) return;
    
    // 如果高度没有实际变化，不报告
    if (lastReportedHeightRef.current !== null && 
        Math.abs(lastReportedHeightRef.current - totalHeight) < 1) {
      return;
    }

    // 清除之前的定时器
    if (heightStabilityTimerRef.current != null) {
      clearTimeout(heightStabilityTimerRef.current);
    }

    // 使用短延迟确保高度稳定后再报告（避免连续变化时的抖动）
    heightStabilityTimerRef.current = window.setTimeout(() => {
      if (onHeightMeasuredRef.current && totalHeight > 0) {
        lastReportedHeightRef.current = totalHeight;
        onHeightMeasuredRef.current(totalHeight);
      }
      heightStabilityTimerRef.current = null;
    }, 50); // 50ms 的稳定检测

    return () => {
      if (heightStabilityTimerRef.current != null) {
        clearTimeout(heightStabilityTimerRef.current);
      }
    };
  }, [totalHeight, isMeasuring]); // 依赖高度和测量状态

  return (
    <Group x={x} y={y}>
      {/* 整个表格的统一背景 */}
      <Rect
        cornerRadius={cornerRadius}
        fill="rgba(255, 255, 255, 0.1)"
        height={totalHeight}
        width={width}
        x={0}
        y={0}
      />

      {/* 表格行（所有行都是数据行，没有表头） */}
      {table.rows.map((row, rowIdx) => {
        const pos = rowPositions[rowIdx];

        if (!pos) return null;

        const { y: rowY, height: rowH } = pos;

        return (
          <Group key={`row-${rowIdx}`}>

            {/* 数据单元格内容 */}
            {cellLayout.layout
              .filter((item) => item.rowIdx === rowIdx)
              .map((item) => {
                const cell = row[item.cellIdx];
                const { colIdx, rowspan, colspan } = item;
                const actualColIdx = item.cellIdx; // 原始数组中的列索引

                const key = `${rowIdx}-${item.cellIdx}`;
                const cellX = colIdx * colWidth;
                const cellWidth = colWidth * colspan;

                // 计算跨行单元格的总高度
                let cellHeight = 0;

                for (
                  let r = rowIdx;
                  r < rowIdx + rowspan && r < table.rows.length;
                  r++
                ) {
                  const rowPos = rowPositions[r];

                  if (rowPos) {
                    cellHeight += rowPos.height;
                  }
                }

                // 如果是图片
                if (cell.is_image && cell.image) {
                  const bmp = loadedImages.get(key);
                  const loadingStatus = imageLoadingStatus.get(key);

                  // 计算图片区域（用于占位符和实际图片）
                  const maxImgWidth = cellWidth - cellPadding * 2;
                  const maxImgHeight = Math.min(
                    cellHeight - cellPadding * 2,
                    maxImageHeight,
                  );

                  const isHovered =
                    !forExport &&
                    hoveredCell?.row === rowIdx &&
                    hoveredCell?.col === actualColIdx;

                  return (
                    <Group key={key}>
                      {/* 透明热区 - 覆盖整个单元格 */}
                      <Rect
                        fill="transparent"
                        height={cellHeight}
                        listening={!forExport}
                        width={cellWidth}
                        x={cellX}
                        y={rowY}
                        onClick={() => {
                          if (!forExport && onImageClick) {
                            const imageUrl =
                              typeof cell.image === "string"
                                ? cell.image
                                : cell.image?.url;

                            onImageClick(rowIdx, actualColIdx, imageUrl);
                          }
                        }}
                        onMouseEnter={() =>
                          !forExport &&
                          setHoveredCell({ row: rowIdx, col: actualColIdx })
                        }
                        onMouseLeave={() =>
                          !forExport && setHoveredCell(null)
                        }
                      />

                      {/* 加载状态：显示占位符 - 只有在确实有图片URL时才显示 */}
                      {loadingStatus === "loading" && cell.image && (
                        <Group>
                          {/* 浅灰色背景 */}
                          <Rect
                            cornerRadius={4}
                            fill="#f0f0f0"
                            height={maxImgHeight}
                            width={maxImgWidth}
                            x={cellX + cellPadding}
                            y={rowY + (cellHeight - maxImgHeight) / 2}
                          />
                          {/* 加载动画 - 简单的脉动效果 */}
                          <Rect
                            cornerRadius={4}
                            fill="#e0e0e0"
                            height={maxImgHeight * 0.6}
                            opacity={0.5}
                            width={maxImgWidth * 0.6}
                            x={cellX + cellPadding + maxImgWidth * 0.2}
                            y={rowY + (cellHeight - maxImgHeight * 0.6) / 2}
                          />
                          {/* 加载文字 */}
                          <Text
                            align="center"
                            fill="#999"
                            fontSize={12}
                            text="Loading..."
                            verticalAlign="middle"
                            width={maxImgWidth}
                            x={cellX + cellPadding}
                            y={rowY + cellHeight / 2 - 6}
                          />
                        </Group>
                      )}

                      {/* 错误状态 - 只有在确实有图片URL但加载失败时才显示 */}
                      {loadingStatus === "error" && cell.image && (
                        <Group>
                          <Rect
                            cornerRadius={4}
                            fill="#ffebee"
                            height={maxImgHeight}
                            width={maxImgWidth}
                            x={cellX + cellPadding}
                            y={rowY + (cellHeight - maxImgHeight) / 2}
                          />
                          <Text
                            align="center"
                            fill="#d32f2f"
                            fontSize={12}
                            text="❌ 加载失败"
                            verticalAlign="middle"
                            width={maxImgWidth}
                            x={cellX + cellPadding}
                            y={rowY + cellHeight / 2 - 6}
                          />
                        </Group>
                      )}

                      {/* 图片已加载：显示图片 */}
                      {bmp && loadingStatus === "loaded" && (
                        <>
                          {(() => {
                            // 计算图片尺寸：尽量充满单元格，保持比例，留间距
                            const originalW = (bmp as any).width || 1;
                            const originalH = (bmp as any).height || 1;
                            const imgAspect = originalW / originalH;

                            let imgW = maxImgWidth;
                            let imgH = imgW / imgAspect;

                            // 如果高度超出，按高度缩放
                            if (imgH > maxImgHeight) {
                              imgH = maxImgHeight;
                              imgW = imgH * imgAspect;
                            }

                            // 居中显示图片（水平和垂直都居中）
                            const imgX = cellX + (cellWidth - imgW) / 2;
                            const imgY = rowY + (cellHeight - imgH) / 2;

                            return (
                              <KImage
                                ref={(node) => {
                                  if (node) {
                                    imageRefs.current.set(key, node);
                                  } else {
                                    imageRefs.current.delete(key);
                                  }
                                }}
                                height={imgH}
                                image={bmp as any}
                                listening={false}
                                width={imgW}
                                x={imgX}
                                y={imgY}
                              />
                            );
                          })()}
                        </>
                      )}

                      {/* 悬浮边框 */}
                      {isHovered && (
                        <Rect
                          dash={[5, 5]}
                          height={cellHeight - 2}
                          listening={false}
                          stroke="#ff3333"
                          strokeWidth={2}
                          width={cellWidth - 2}
                          x={cellX + 1}
                          y={rowY + 1}
                        />
                      )}
                    </Group>
                  );
                }

                // 文字内容
                const textHeight = cellHeights.get(key) || 0;
                const verticalOffset = (cellHeight - textHeight) / 2;

                // 根据单元格格式应用样式
                const cellAlign = cell.center ? "center" : textAlign;
                const cellFontStyle = cell.bold ? "bold" : "normal";
                const cellColor = cell.bold ? titleColor : contentColor;

                const isHovered =
                  !forExport &&
                  hoveredCell?.row === rowIdx &&
                  hoveredCell?.col === actualColIdx;

                return (
                  <Group key={key}>
                    {/* 透明热区 - 覆盖整个单元格 */}
                    <Rect
                      fill="transparent"
                      height={cellHeight}
                      listening={!forExport}
                      width={cellWidth}
                      x={cellX}
                      y={rowY}
                      onClick={() => {
                        if (!forExport && onTextClick) {
                          onTextClick(rowIdx, actualColIdx, cell.value);
                        }
                      }}
                      onMouseEnter={() =>
                        !forExport &&
                        setHoveredCell({ row: rowIdx, col: actualColIdx })
                      }
                      onMouseLeave={() => !forExport && setHoveredCell(null)}
                    />
                    {/* 文字内容 */}
                    <Text
                      ref={(node) => {
                        if (node) {
                          textRefs.current.set(key, node);
                        } else {
                          textRefs.current.delete(key);
                        }
                      }}
                      align={cellAlign}
                      direction={direction}
                      fill={cellColor}
                      fontFamily={fontFamily}
                      fontSize={fontSize}
                      fontStyle={cellFontStyle}
                      listening={false}
                      text={cell.value}
                      verticalAlign="top"
                      width={cellWidth - cellPadding * 2}
                      wrap="word"
                      x={cellX + cellPadding}
                      y={rowY + Math.max(cellPadding, verticalOffset)}
                    />
                    {/* 悬浮边框 */}
                    {isHovered && (
                      <Rect
                        dash={[5, 5]}
                        height={cellHeight - 2}
                        listening={false}
                        stroke="#ff3333"
                        strokeWidth={2}
                        width={cellWidth - 2}
                        x={cellX + 1}
                        y={rowY + 1}
                      />
                    )}
                  </Group>
                );
              })}

            {/* 行分割线 - 分段绘制，跳过合并单元格 */}
            {rowIdx < table.rows.length - 1 &&
              (() => {
                const segments: Array<{ start: number; end: number }> = [];
                let segmentStart: number | null = null;

                // 遍历所有列，找出不跨行的区段
                for (let c = 0; c < colCount; c++) {
                  // 检查该列在当前行是否有跨到下一行的单元格
                  let hasRowspan = false;

                  for (const item of cellLayout.layout) {
                    if (
                      item.rowIdx === rowIdx &&
                      item.colIdx <= c &&
                      c < item.colIdx + item.colspan &&
                      item.rowspan > 1
                    ) {
                      hasRowspan = true;
                      break;
                    }
                  }

                  if (!hasRowspan) {
                    // 该列不跨行，可以绘制分割线
                    if (segmentStart === null) {
                      segmentStart = c;
                    }
                  } else {
                    // 该列跨行，结束当前区段
                    if (segmentStart !== null) {
                      segments.push({ start: segmentStart, end: c });
                      segmentStart = null;
                    }
                  }
                }

                // 处理最后一个区段
                if (segmentStart !== null) {
                  segments.push({ start: segmentStart, end: colCount });
                }

                // 绘制所有区段
                return segments.map((seg, idx) => (
                  <Line
                    key={`row-hline-${rowIdx}-${idx}`}
                    points={[
                      seg.start * colWidth,
                      rowY + rowH,
                      seg.end * colWidth,
                      rowY + rowH,
                    ]}
                    stroke="rgba(0, 0, 0, 0.3)"
                    strokeWidth={1}
                  />
                ));
              })()}

            {/* 列分割线 - 考虑 rowspan，延伸到跨越的所有行 */}
            {cellLayout.layout
              .filter((item) => item.rowIdx === rowIdx && item.colIdx > 0)
              .map((item) => {
                // 在单元格左侧绘制分割线
                const colIdx = item.colIdx;
                const { rowspan } = item;

                // 计算跨行单元格的总高度
                let totalHeight = 0;
                for (
                  let r = rowIdx;
                  r < rowIdx + rowspan && r < table.rows.length;
                  r++
                ) {
                  const rPos = rowPositions[r];
                  if (rPos) {
                    totalHeight += rPos.height;
                  }
                }

                return (
                  <Line
                    key={`row-vline-${rowIdx}-${colIdx}`}
                    points={[
                      colIdx * colWidth,
                      rowY,
                      colIdx * colWidth,
                      rowY + totalHeight,
                    ]}
                    stroke="rgba(0, 0, 0, 0.3)"
                    strokeWidth={1}
                  />
                );
              })}
          </Group>
        );
      })}
    </Group>
  );
}
