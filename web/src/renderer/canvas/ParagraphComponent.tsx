import { useRef, useLayoutEffect, useState } from "react";
import { Group, Text, Rect } from "react-konva";
import type Konva from "konva";
import type { Paragraph } from "./types";

interface ParagraphComponentProps {
  paragraphs: Paragraph[];
  x: number;
  y: number;
  width: number;
  baseFontSize: number;
  baseFontFamily: string;
  baseColor: string;
  baseLineHeight: number; // 新增：行高
  direction?: "ltr" | "rtl";
  onHeightMeasured?: (height: number) => void;
  onTextClick?: (paraIdx: number, text: string) => void; // 改：整段文本
  forExport?: boolean;
}

export function ParagraphComponent({
  paragraphs,
  x,
  y,
  width,
  baseFontSize,
  baseFontFamily,
  baseColor,
  baseLineHeight = 1.6,
  direction = "ltr",
  onHeightMeasured,
  onTextClick,
  forExport = false,
}: ParagraphComponentProps) {
  const textRefs = useRef<Map<string, Konva.Text>>(new Map());
  const [textHeights, setTextHeights] = useState<Map<string, number>>(new Map());
  const [hoveredPara, setHoveredPara] = useState<number | null>(null);

  // 测量所有段落的高度（字号或行高改变时也要重新测量）
  useLayoutEffect(() => {
    const newHeights = new Map<string, number>();
    let hasChanges = false;

    textRefs.current.forEach((textNode, key) => {
      if (textNode) {
        const height = textNode.height();
        if (height > 0) {
          newHeights.set(key, height);
          if (!textHeights.has(key) || textHeights.get(key) !== height) {
            hasChanges = true;
          }
        }
      }
    });

    if (hasChanges) {
      setTextHeights(newHeights);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paragraphs, baseFontSize, baseLineHeight]);

  // 计算每个段落的 Y 坐标和高度
  let currentY = y;
  const paraPositions: Array<{ y: number; height: number; text: string }> = [];

  paragraphs.forEach((para, paraIdx) => {
    const key = `para-${paraIdx}`;
    
    // 拼接所有 runs 的文本（用空格分隔）
    const fullText = para.runs.map(run => run.text).join(" ");
    
    // 使用测量高度或估算
    const measuredHeight = textHeights.get(key) || 
      Math.ceil(baseFontSize * baseLineHeight);

    paraPositions.push({ 
      y: currentY, 
      height: measuredHeight,
      text: fullText 
    });
    
    currentY += measuredHeight;
  });

  const totalHeight = currentY - y;

  // 通知父组件总高度
  useLayoutEffect(() => {
    if (onHeightMeasured && totalHeight > 0) {
      onHeightMeasured(totalHeight);
    }
  }, [totalHeight, onHeightMeasured]);

  return (
    <Group>
      {paragraphs.map((para, paraIdx) => {
        const pos = paraPositions[paraIdx];
        if (!pos) return null;

        const key = `para-${paraIdx}`;
        
        // 使用第一个 run 的样式（因为是整行统一样式）
        const firstRun = para.runs[0] || {};
        const align = para.align || "left";
        
        // 颜色逻辑：如果是黑色 (#000000 或 #000)，使用主题色；否则使用自定义颜色
        let color = baseColor;
        if (firstRun.color) {
          const normalizedColor = firstRun.color.toUpperCase();
          // 检查是否为黑色（#000000, #000, 000000, 000）
          const isBlack = normalizedColor === "#000000" || 
                         normalizedColor === "#000" || 
                         normalizedColor === "000000" || 
                         normalizedColor === "000";
          if (!isBlack) {
            // 非黑色，使用自定义颜色
            color = firstRun.color;
          }
          // 如果是黑色，使用 baseColor（不改变 color 变量）
        }
        
        // 构建 fontStyle
        let fontStyle = "normal";
        if (firstRun.bold && firstRun.italic) {
          fontStyle = "bold italic";
        } else if (firstRun.bold) {
          fontStyle = "bold";
        } else if (firstRun.italic) {
          fontStyle = "italic";
        }

        const isHovered = !forExport && hoveredPara === paraIdx;

        return (
          <Group key={key}>
            {/* 透明热区用于捕获鼠标事件 */}
            <Rect
              x={x}
              y={pos.y}
              width={width}
              height={pos.height}
              fill="transparent"
              listening={!forExport}
              onClick={() => {
                if (!forExport && onTextClick) {
                  onTextClick(paraIdx, pos.text);
                }
              }}
              onMouseEnter={() => !forExport && setHoveredPara(paraIdx)}
              onMouseLeave={() => !forExport && setHoveredPara(null)}
            />
            
            {/* 段落文本 */}
            <Text
              ref={(node) => {
                if (node) {
                  textRefs.current.set(key, node);
                } else {
                  textRefs.current.delete(key);
                }
              }}
              x={x}
              y={pos.y}
              width={width}
              text={pos.text}
              fontSize={baseFontSize}
              fontFamily={baseFontFamily}
              fontStyle={fontStyle}
              fill={color}
              align={align}
              direction={direction}
              wrap="word"
              lineHeight={baseLineHeight}
              listening={false}
            />
            
            {/* 悬浮边框 */}
            {isHovered && (
              <Rect
                x={x}
                y={pos.y}
                width={width}
                height={pos.height}
                stroke="#ff3333"
                strokeWidth={2}
                dash={[5, 5]}
                listening={false}
              />
            )}
          </Group>
        );
      })}
    </Group>
  );
}

