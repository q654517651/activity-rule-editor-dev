import type { TableData } from "./types";
import type Konva from "konva";

import { useRef, useLayoutEffect, useState, useEffect } from "react";
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
  onHeightMeasured,
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
  onHeightMeasured?: (height: number) => void;
}) {
  // 存储每个单元格文本节点的高度
  const [cellHeights, setCellHeights] = useState<Map<string, number>>(
    new Map(),
  );
  const textRefs = useRef<Map<string, Konva.Text>>(new Map());
  const imageRefs = useRef<Map<string, Konva.Image>>(new Map());

  // 存储已加载的图片
  const [loadedImages, setLoadedImages] = useState<
    Map<string, CanvasImageSource>
  >(new Map());

  // 重试计数器，避免无限重试
  const retryCountRef = useRef(0);
  const maxRetries = 5;

  // 加载所有表格中的图片
  useEffect(() => {
    const loadImages = async () => {
      const newImages = new Map<string, CanvasImageSource>();

      for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
        const row = table.rows[rowIdx];

        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          const cell = row[colIdx];

          if (cell.is_image && cell.image) {
            const key = `${rowIdx}-${colIdx}`;

            // 处理新旧两种格式：字符串 URL 或 ImageMeta 对象（与奖励图片一致）
            const imageUrl =
              typeof cell.image === "string" ? cell.image : cell.image?.url;

            if (imageUrl) {
              const bmp = await loadBitmap(imageUrl);

              if (bmp) {
                newImages.set(key, bmp as any);
              }
            }
          }
        }
      }

      setLoadedImages(newImages);
    };

    loadImages();
  }, [table]);

  const colCount = table.headers.length;
  const colWidth = width / colCount;
  const cellPadding = 8;
  const minRowHeight = fontSize * 2;
  const textAlign = direction === "rtl" ? "right" : "left";
  const cornerRadius = 8; // 圆角半径

  // 测量所有单元格的实际高度
  useLayoutEffect(() => {
    const newHeights = new Map<string, number>();
    let hasChanges = false;
    let hasUnmeasured = false;

    // 测量文本节点
    textRefs.current.forEach((textNode, key) => {
      if (textNode) {
        const height = textNode.height();

        if (height > 0) {
          newHeights.set(key, height);
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

    // 如果有未测量的节点，且未超过最大重试次数，则重试
    if (hasUnmeasured && retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      const timer = setTimeout(() => {
        setCellHeights((prev) => new Map(prev)); // 强制触发重新渲染
      }, 100);

      return () => clearTimeout(timer);
    }
  });

  // 计算表头高度（表头单独计算）
  const getHeaderHeight = () => {
    let maxHeight = minRowHeight;

    for (let colIdx = 0; colIdx < colCount; colIdx++) {
      const key = `-1-${colIdx}`;
      const cellHeight = cellHeights.get(key);

      if (cellHeight && cellHeight > maxHeight) {
        maxHeight = cellHeight;
      }
    }

    return maxHeight + cellPadding * 2;
  };

  // 计算所有数据行的统一高度（找出整个表格中最高的单元格）
  const getUnifiedDataRowHeight = () => {
    let maxHeight = minRowHeight;

    // 遍历所有数据行的所有单元格，找出最大高度
    for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
      for (let colIdx = 0; colIdx < colCount; colIdx++) {
        const key = `${rowIdx}-${colIdx}`;
        const cellHeight = cellHeights.get(key);

        if (cellHeight && cellHeight > maxHeight) {
          maxHeight = cellHeight;
        }
      }
    }

    // 加上上下 padding
    return maxHeight + cellPadding * 2;
  };

  const headerHeight = getHeaderHeight();
  const unifiedDataRowHeight = getUnifiedDataRowHeight(); // 所有数据行使用同一个统一高度

  // 计算每个数据行的 Y 坐标（所有行使用统一高度）
  const rowPositions: Array<{ y: number; height: number }> = [];
  let currentY = headerHeight;

  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    rowPositions.push({ y: currentY, height: unifiedDataRowHeight });
    currentY += unifiedDataRowHeight;
  }

  const totalHeight = currentY;

  // 通知父组件总高度 - 只依赖 totalHeight，确保每次高度变化都会通知
  const onHeightMeasuredRef = useRef(onHeightMeasured);

  useLayoutEffect(() => {
    onHeightMeasuredRef.current = onHeightMeasured;
  }, [onHeightMeasured]);

  useLayoutEffect(() => {
    if (onHeightMeasuredRef.current && totalHeight > 0) {
      onHeightMeasuredRef.current(totalHeight);
    }
  }, [totalHeight]);

  return (
    <Group x={x} y={y}>
      {/* 表头行 */}
      <Group>
        {/* 表头背景 - 上方圆角 */}
        <Rect
          cornerRadius={[cornerRadius, cornerRadius, 0, 0]}
          fill="rgba(255, 255, 255, 0.2)"
          height={headerHeight}
          width={width}
          x={0}
          y={0}
        />

        {/* 表头文字 */}
        {table.headers.map((header, colIdx) => {
          const key = `-1-${colIdx}`;
          const textHeight = cellHeights.get(key) || 0;
          const verticalOffset = (headerHeight - textHeight) / 2;

          return (
            <Text
              key={key}
              ref={(node) => {
                if (node) {
                  textRefs.current.set(key, node);
                } else {
                  textRefs.current.delete(key);
                }
              }}
              align="center"
              direction={direction}
              fill={titleColor}
              fontFamily={fontFamily}
              fontSize={fontSize}
              fontStyle="bold"
              text={header}
              verticalAlign="top"
              width={colWidth - cellPadding * 2}
              wrap="word"
              x={colIdx * colWidth + cellPadding}
              y={Math.max(cellPadding, verticalOffset)}
            />
          );
        })}

        {/* 表头底部分割线 */}
        <Line
          points={[0, headerHeight, width, headerHeight]}
          stroke="rgba(0, 0, 0, 0.3)"
          strokeWidth={1}
        />

        {/* 表头列分割线 */}
        {table.headers.map((_, colIdx) => {
          if (colIdx === 0) return null;

          return (
            <Line
              key={`header-vline-${colIdx}`}
              points={[colIdx * colWidth, 0, colIdx * colWidth, headerHeight]}
              stroke="rgba(0, 0, 0, 0.3)"
              strokeWidth={1}
            />
          );
        })}
      </Group>

      {/* 数据行 */}
      {table.rows.map((row, rowIdx) => {
        const pos = rowPositions[rowIdx];

        if (!pos) return null;

        const { y: rowY, height: rowH } = pos;
        const isLastRow = rowIdx === table.rows.length - 1;

        return (
          <Group key={`row-${rowIdx}`}>
            {/* 数据行背景 - 最后一行添加下方圆角 */}
            <Rect
              cornerRadius={isLastRow ? [0, 0, cornerRadius, cornerRadius] : 0}
              fill="rgba(255, 255, 255, 0.1)"
              height={rowH}
              width={width}
              x={0}
              y={rowY}
            />

            {/* 数据单元格内容 */}
            {row.map((cell, colIdx) => {
              const key = `${rowIdx}-${colIdx}`;
              const cellX = colIdx * colWidth;

              // 如果是图片
              if (cell.is_image && cell.image) {
                const bmp = loadedImages.get(key);

                if (bmp) {
                  // 计算图片尺寸：尽量充满单元格，保持比例，留间距
                  const maxImgWidth = colWidth - cellPadding * 2;
                  const maxImgHeight = rowH - cellPadding * 2;

                  // 获取图片的原始尺寸
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
                  const imgX = cellX + (colWidth - imgW) / 2;
                  const imgY = rowY + (rowH - imgH) / 2;

                  return (
                    <KImage
                      key={key}
                      ref={(node) => {
                        if (node) {
                          imageRefs.current.set(key, node);
                        } else {
                          imageRefs.current.delete(key);
                        }
                      }}
                      height={imgH}
                      image={bmp as any}
                      width={imgW}
                      x={imgX}
                      y={imgY}
                    />
                  );
                }

                // 图片加载中或未加载，返回空占位
                return null;
              }

              // 文字内容
              const textHeight = cellHeights.get(key) || 0;
              const verticalOffset = (rowH - textHeight) / 2;

              return (
                <Text
                  key={key}
                  ref={(node) => {
                    if (node) {
                      textRefs.current.set(key, node);
                    } else {
                      textRefs.current.delete(key);
                    }
                  }}
                  align={textAlign}
                  direction={direction}
                  fill={contentColor}
                  fontFamily={fontFamily}
                  fontSize={fontSize}
                  text={cell.value}
                  verticalAlign="top"
                  width={colWidth - cellPadding * 2}
                  wrap="word"
                  x={cellX + cellPadding}
                  y={rowY + Math.max(cellPadding, verticalOffset)}
                />
              );
            })}

            {/* 数据行底部分割线 - 最后一行不显示底部线 */}
            {!isLastRow && (
              <Line
                points={[0, rowY + rowH, width, rowY + rowH]}
                stroke="rgba(0, 0, 0, 0.3)"
                strokeWidth={1}
              />
            )}

            {/* 数据行列分割线 */}
            {row.map((_, colIdx) => {
              if (colIdx === 0) return null;

              return (
                <Line
                  key={`data-vline-${rowIdx}-${colIdx}`}
                  points={[
                    colIdx * colWidth,
                    rowY,
                    colIdx * colWidth,
                    rowY + rowH,
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
