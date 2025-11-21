import type Konva from "konva";
import type { Page, StyleCfg, Reward, Section } from "./types";

import {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
} from "react";
import { Group, Image as KImage, Text, Rect } from "react-konva";

import { loadBitmap } from "./useImageCache";
import { NineSlice } from "./nineSlice";
import { TableComponent } from "./TableComponent";
// Konva Text 组件的 direction 属性类型已在 konva-extensions.d.ts 中扩展

/**
 * 规范化页面数据：如果有 blocks，展平为 sections；如果有 sections，保持原样
 * 关键：展平时保留 block_type 信息，这样渲染时能区分规则和奖励
 *
 * 在第一个 section 前插入 block title 作为大标题
 */
function normalizePage(page: Page): Page {
  if (page.blocks && page.blocks.length > 0) {
    // 新结构：将所有 blocks 的 sections 展平，但保留 block 元数据
    const allSections: Section[] = [];

    for (const block of page.blocks) {
      // 为块内的每个 section 添加 block 元数据
      if (block.sections && block.sections.length > 0) {
        for (let i = 0; i < block.sections.length; i++) {
          const section = block.sections[i];

          allSections.push({
            ...section,
            _blockType: block.block_type, // 保留块类型（rules/rewards）
            _blockTitle: block.block_title, // 保留块标题
            _isFirstInBlock: i === 0, // 标记是否为 block 的第一个 section
          });
        }
      }
    }

    return {
      ...page,
      sections: allSections,
      blocks: undefined, // 清除 blocks 以避免重复处理
    };
  }

  // 旧结构或两者都不存在，直接返回
  return page;
}

/**
 * 奖励项组件 - 图片在上（160x160），文字在下（标题 + 描述）
 * 使用实际渲染高度而非预测
 */
function RewardItem({
  reward,
  x,
  y,
  width,
  style,
  direction = "ltr",
  onHeightMeasured,
}: {
  reward: Reward;
  x: number;
  y: number;
  width: number;
  style: StyleCfg;
  direction?: "rtl" | "ltr";
  onHeightMeasured?: (h: number) => void;
}) {
  const [rewardImg, setRewardImg] = useState<CanvasImageSource | null>(null);
  const nameRef = useRef<Konva.Text>(null);
  const descRef = useRef<Konva.Text>(null);

  useEffect(() => {
    if (!reward.image) {
      setRewardImg(null);

      return;
    }
    (async () => {
      // 处理新旧两种格式：字符串 URL 或 ImageMeta 对象
      const imageUrl =
        typeof reward.image === "string" ? reward.image : reward.image?.url;

      if (!imageUrl) {
        setRewardImg(null);

        return;
      }

      const bmp = await loadBitmap(imageUrl);

      setRewardImg(bmp as any);
    })();
  }, [reward.image]);

  // 测量实际渲染高度
  useLayoutEffect(() => {
    const imgBoxH = 160 + 8;
    const textGapV = 4;

    let nameH = 0;
    let descH = 0;

    if (nameRef.current && reward.name) {
      nameH = nameRef.current.height();
    }

    if (descRef.current && reward.desc) {
      descH = descRef.current.height();
    }

    const totalH =
      imgBoxH + (nameH ? nameH + textGapV : 0) + (descH ? descH + textGapV : 0);

    if (onHeightMeasured && totalH > 0) {
      onHeightMeasured(totalH);
    }
  }, [reward.name, reward.desc, width, onHeightMeasured]);

  // 图片尺寸（保持正方形容器，内部图片长边贴边）
  const imgBoxSize = 160;
  const imgPadding = 4;
  const imgBoxH = imgBoxSize + imgPadding * 2;

  // 计算图片的实际尺寸（长边贴边，保持比例）
  let displayImgW = imgBoxSize;
  let displayImgH = imgBoxSize;
  let imgOffsetX = 0;
  let imgOffsetY = 0;

  if (rewardImg) {
    const originalW = (rewardImg as any).width || 1;
    const originalH = (rewardImg as any).height || 1;
    const aspectRatio = originalW / originalH;

    if (aspectRatio > 1) {
      displayImgW = imgBoxSize;
      displayImgH = imgBoxSize / aspectRatio;
      imgOffsetY = (imgBoxSize - displayImgH) / 2;
    } else {
      displayImgH = imgBoxSize;
      displayImgW = imgBoxSize * aspectRatio;
      imgOffsetX = (imgBoxSize - displayImgW) / 2;
    }
  }

  // 文字区域
  const textStartY = imgBoxH + 4;
  const textGapV = 4;

  // 获取实际渲染高度（通过 ref）
  const nameH = nameRef.current ? nameRef.current.height() : 0;

  return (
    <Group x={x} y={y}>
      {/* 奖励图片 - 在容器内垂直和水平居中，长边贴边 */}
      {rewardImg && (
        <KImage
          height={displayImgH}
          image={rewardImg as any}
          width={displayImgW}
          x={(width - imgBoxSize) / 2 + imgOffsetX}
          y={imgPadding + imgOffsetY}
        />
      )}

      {/* 奖励名称（标题，加粗，在列宽内水平居中） */}
      {reward.name && (
        <Text
          ref={nameRef}
          align="center"
          direction={direction}
          fill={style.titleColor}
          fontFamily={style.font.family}
          fontSize={style.font.size}
          fontStyle="bold"
          text={reward.name}
          width={width}
          x={0}
          y={textStartY}
        />
      )}

      {/* 奖励描述 - 居中对齐，与图片和标题保持一致 */}
      {reward.desc ? (
        <Text
          ref={descRef}
          align="center"
          direction={direction}
          fill={style.contentColor}
          fontFamily={style.font.family}
          fontSize={style.font.size - 2}
          lineHeight={style.font.lineHeight}
          text={reward.desc}
          width={width}
          x={0}
          y={textStartY + nameH + textGapV}
        />
      ) : null}
    </Group>
  );
}

export function PageCanvas({
  page,
  style,
  forExport = false,
  onMeasured,
}: {
  page: Page;
  style: StyleCfg;
  forExport?: boolean;
  onMeasured?: (height: number) => void;
}) {
  // 规范化页面数据：支持新旧两种结构
  const normalizedPage = useMemo(() => normalizePage(page), [page]);

  // 直接使用后端提供的文本方向（基于地区代码）
  const direction = page.direction || "ltr";

  // 根据方向获取文本对齐方式
  const textAlign = direction === "rtl" ? "right" : "left";

  const W = style.pageWidth;
  const PAD = style.pad;
  const [borderBmp, setBorderBmp] = useState<CanvasImageSource | null>(null);

  // 存储每个section文本的实际渲染高度
  const [measuredHeights, setMeasuredHeights] = useState<Map<string, number>>(
    new Map(),
  );

  // 存储 Text 组件的 ref
  const textRefs = useRef<Map<string, Konva.Text>>(new Map());

  useEffect(() => {
    (async () => {
      setBorderBmp(null);
      const bmp = await loadBitmap(style.border.image);

      if (bmp) setBorderBmp(bmp as any);
    })();
  }, [style.border.image]);

  // 测量所有文本的实际渲染高度
  useLayoutEffect(() => {
    const newHeights = new Map<string, number>();
    let hasChanges = false;

    textRefs.current.forEach((textNode, key) => {
      if (textNode) {
        const height = textNode.height();

        if (height > 0) {
          newHeights.set(key, height);
          if (
            !measuredHeights.has(key) ||
            measuredHeights.get(key) !== height
          ) {
            hasChanges = true;
          }
        }
      }
    });

    if (hasChanges) {
      setMeasuredHeights(newHeights);
    }
  });

  // 确保所有数值有效，防止 NaN
  const contentX = isFinite(PAD.l) ? PAD.l : 0;
  const contentY = isFinite(PAD.t) ? PAD.t : 0;
  const contentW =
    isFinite(W) && isFinite(PAD.l) && isFinite(PAD.r) ? W - PAD.l - PAD.r : 0;

  // 布局：各个 section（每个 section 包含标题、内容、奖励）
  // 页面标题已移至 Canvas 外部，不再在此渲染
  const gapH = 12;
  const sectionGap = 20; // 同一 block 内 section 之间的间距
  const blockGap = 48; // 不同 block 之间的间距

  // 奖励网格配置
  const rewardColCount = 3; // 一排3个奖励
  const rewardGutterX = 12; // 奖励列之间的水平间距
  const rewardGapH = 12; // 奖励行之间的垂直间距
  const rewardColW =
    contentW > 0
      ? (contentW - rewardGutterX * (rewardColCount - 1)) / rewardColCount
      : 0;

  // 存储每行奖励的最大高度
  const rewardRowHeights: Record<string, number> = {};

  // 计算每个 section 的高度和布局信息
  const sections = (normalizedPage.sections || []).map(
    (section, sectionIdx) => {
      // block 标题高度（如果是 block 的第一个 section）
      const blockTitleKey = `section-${sectionIdx}-blocktitle`;
      const blockTitleH =
        section._isFirstInBlock && section._blockTitle
          ? measuredHeights.get(blockTitleKey) ||
            Math.ceil((style.font.size + 4) * style.font.lineHeight)
          : 0;

      // section 标题高度 - 使用实际测量值或估算
      const titleKey = `section-${sectionIdx}-title`;
      const titleH = section.title
        ? measuredHeights.get(titleKey) ||
          Math.ceil(style.font.size * style.font.lineHeight)
        : 0;

      // section 内容高度 - 累加所有行的高度
      let contentH = 0;

      if (section.content && contentW > 0) {
        const lines = section.content.split("\n");

        contentH = lines.reduce((sum, _, lineIdx) => {
          const lineKey = `section-${sectionIdx}-content-line-${lineIdx}`;
          const lineHeight =
            measuredHeights.get(lineKey) ||
            Math.ceil(style.font.size * style.font.lineHeight);

          return sum + lineHeight;
        }, 0);
      }

      // section 表格区域高度 - 使用实际测量值或估算
      const tableKey = `section-${sectionIdx}-table`;
      const tableH = section.table
        ? measuredHeights.get(tableKey) ||
          Math.ceil(style.font.size * 8 * (section.table.rows.length + 1)) // 初始估算：每行8倍字体大小（考虑图片和多行文本）
        : 0;

      // section 奖励区域高度
      const rewards = section.rewards || [];
      const rewardRows =
        rewards.length > 0 ? Math.ceil(rewards.length / rewardColCount) : 0;

      // 计算每行的最大高度（使用实际测量值）
      let rewardsH = 0;

      for (let row = 0; row < rewardRows; row++) {
        const rowStartIdx = row * rewardColCount;
        const rowEndIdx = Math.min(
          rowStartIdx + rewardColCount,
          rewards.length,
        );
        let maxRowH = 0;

        for (let i = rowStartIdx; i < rowEndIdx; i++) {
          const rewardKey = `section-${sectionIdx}-reward-${i}`;
          // 使用实际测量高度，如果没有则使用估算值（168 = 图片160 + padding8）
          const itemH = measuredHeights.get(rewardKey) || 250; // 估算：图片 + 文本

          maxRowH = Math.max(maxRowH, itemH);
        }

        rewardRowHeights[`${sectionIdx}-${row}`] = maxRowH;
        rewardsH += maxRowH;
        if (row < rewardRows - 1) rewardsH += rewardGapH;
      }

      // section 总高度（包含 block 标题）
      const sectionH =
        (blockTitleH ? blockTitleH + gapH + 8 : 0) + // block 标题 + 额外间距
        (titleH ? titleH + gapH : 0) +
        (contentH ? contentH + gapH : 0) +
        (tableH ? tableH + gapH : 0) + // 表格高度
        rewardsH;

      return {
        section,
        blockTitleH,
        titleH,
        contentH,
        tableH,
        rewardsH,
        sectionH,
        rewards,
        rewardRows,
      };
    },
  );

  // 计算总高度（考虑 block 之间的间距）
  const sectionsH = sections.reduce((sum, s, i) => {
    if (i === 0) return sum + s.sectionH;
    // 如果是新 block 的第一个 section，使用 blockGap，否则使用 sectionGap
    const gap = s.section._isFirstInBlock ? blockGap : sectionGap;

    return sum + s.sectionH + gap;
  }, 0);

  // 页面标题已移至 Canvas 外部，不再计入高度
  const innerH = sectionsH;
  const H = PAD.t + innerH + PAD.b;

  // 防止无限循环：只在高度确实变化时上报，且用 RAF 合批
  const lastReportedRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const reportHeight = useCallback(
    (h: number) => {
      if (!Number.isFinite(h) || h <= 0) return;
      // 变化小于 1px 视为相同，不上报
      if (
        lastReportedRef.current !== null &&
        Math.abs(lastReportedRef.current - h) < 1
      )
        return;

      lastReportedRef.current = h;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        onMeasured?.(h);
        rafRef.current = null;
      });
    },
    [onMeasured],
  );

  useLayoutEffect(() => {
    reportHeight(H);
  }, [H, reportHeight]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // 计算每个 section 的 Y 坐标
  // 页面标题已移至 Canvas 外部，从 contentY 直接开始
  let currentY = contentY;

  // 为每个 section 计算 Y 坐标（考虑 block 之间的间距）
  const sectionsWithPos = sections.map((s, i) => {
    const sectionY = currentY;

    if (i < sections.length - 1) {
      // 如果下一个 section 是新 block 的第一个，使用 blockGap
      const nextSection = sections[i + 1];
      const gap = nextSection.section._isFirstInBlock ? blockGap : sectionGap;

      currentY += s.sectionH + gap;
    } else {
      currentY += s.sectionH;
    }

    return { ...s, y: sectionY };
  });

  return (
    <Group data-export-page>
      {/* 编辑模式背景层 - 导出时隐藏 */}
      {!forExport && <Rect fill="#f5f5f5" height={H} width={W} x={0} y={0} />}

      {/* 背景边框 */}
      {borderBmp ? (
        <NineSlice
          bmp={borderBmp as any}
          h={H}
          slice={style.border.slice}
          w={W}
          x={0}
          y={0}
        />
      ) : (
        <Group />
      )}

      {/* 页面标题已移至 Canvas 外部显示，此处不再渲染 */}

      {/* 渲染每个 section */}
      {sectionsWithPos.map((s, sectionIdx) => {
        // 计算此 section 内部的 Y 坐标
        let sectionCursorY = s.y;

        // Block 标题（如果是block的第一个section）
        const blockTitleY = sectionCursorY;

        if (s.blockTitleH) sectionCursorY += s.blockTitleH + gapH + 8;

        const titleY = sectionCursorY;

        if (s.titleH) sectionCursorY += s.titleH + gapH;

        const contentY = sectionCursorY;

        if (s.contentH) sectionCursorY += s.contentH + gapH;

        const tableY = sectionCursorY;

        if (s.tableH) sectionCursorY += s.tableH + gapH;

        const rewardsY = sectionCursorY;

        return (
          <Group key={sectionIdx}>
            {/* Block 标题 - 大标题，稍大字号，水平居中 */}
            {s.section._isFirstInBlock && s.section._blockTitle ? (
              <Text
                ref={(node) => {
                  if (node) {
                    textRefs.current.set(
                      `section-${sectionIdx}-blocktitle`,
                      node,
                    );
                  }
                }}
                align="center"
                direction={direction}
                fill={style.titleColor}
                fontFamily={style.font.family}
                fontSize={style.font.size + 4}
                fontStyle="bold"
                text={s.section._blockTitle}
                width={contentW}
                x={contentX}
                y={blockTitleY}
              />
            ) : null}

            {/* Section 标题 - 水平居中 */}
            {s.section.title ? (
              <Text
                ref={(node) => {
                  if (node) {
                    textRefs.current.set(`section-${sectionIdx}-title`, node);
                  }
                }}
                align="center"
                direction={direction}
                fill={style.titleColor}
                fontFamily={style.font.family}
                fontSize={style.font.size}
                fontStyle="bold"
                text={s.section.title}
                width={contentW}
                x={contentX}
                y={titleY}
              />
            ) : null}

            {/* Section 内容 - 支持单行加粗 */}
            {s.section.content ? (
              <Group>
                {(() => {
                  const lines = s.section.content.split("\n");
                  let cumulativeY = 0;

                  return lines.map((line, lineIdx) => {
                    let text = line;

                    // 先检查是否整行加粗（因为后端先加居中再加粗）
                    let isBold = false;

                    if (text.startsWith("**") && text.endsWith("**")) {
                      isBold = true;
                      text = text.slice(2, -2); // 去掉 **
                    }

                    // 再检查是否居中对齐
                    let lineAlign = textAlign; // 默认对齐方式（基于语言方向）

                    if (text.startsWith("[center]")) {
                      lineAlign = "center";
                      text = text.slice(8); // 去掉 [center]
                    }

                    const displayText = text;
                    const lineKey = `section-${sectionIdx}-content-line-${lineIdx}`;

                    // 获取该行的测量高度（如果有），否则使用估算
                    const lineHeight =
                      measuredHeights.get(lineKey) ||
                      style.font.size * style.font.lineHeight;
                    const currentY = contentY + cumulativeY;

                    cumulativeY += lineHeight;

                    return (
                      <Text
                        key={lineKey}
                        ref={(node) => {
                          if (node) {
                            textRefs.current.set(lineKey, node);
                          }
                        }}
                        align={lineAlign}
                        direction={direction}
                        fill={style.contentColor}
                        fontFamily={style.font.family}
                        fontSize={style.font.size}
                        fontStyle={isBold ? "bold" : "normal"}
                        lineHeight={style.font.lineHeight}
                        text={displayText}
                        width={contentW}
                        x={contentX}
                        y={currentY}
                      />
                    );
                  });
                })()}
              </Group>
            ) : null}

            {/* Section 表格 */}
            {s.section.table ? (
              <TableComponent
                contentColor={style.contentColor}
                direction={direction}
                fontFamily={style.font.family}
                fontSize={style.font.size}
                table={s.section.table}
                titleColor={style.titleColor}
                width={contentW}
                x={contentX}
                y={tableY}
                onHeightMeasured={(h) => {
                  const key = `section-${sectionIdx}-table`;

                  setMeasuredHeights((prev) => {
                    if (prev.get(key) !== h) {
                      const newMap = new Map(prev);

                      newMap.set(key, h);

                      return newMap;
                    }

                    return prev;
                  });
                }}
              />
            ) : null}

            {/* Section 奖励网格（3列布局，最后一行居中） */}
            {s.rewards.length > 0 && (
              <Group>
                {Array.from({ length: s.rewardRows }).map((_, row) => {
                  const rowStartIdx = row * rewardColCount;
                  const rowEndIdx = Math.min(
                    rowStartIdx + rewardColCount,
                    s.rewards.length,
                  );
                  const rowItemCount = rowEndIdx - rowStartIdx;

                  // 计算该行的最大高度
                  // const rowH = rewardRowHeights[`${sectionIdx}-${row}`] || 0;

                  // 计算该行的 Y 坐标
                  let rowY = rewardsY;

                  for (let r = 0; r < row; r++) {
                    rowY += rewardRowHeights[`${sectionIdx}-${r}`] || 0;
                    rowY += rewardGapH;
                  }

                  // 如果是最后一行且不足3个，计算居中的起始 X
                  const isLastRow = row === s.rewardRows - 1;
                  const rowTotalW =
                    rowItemCount * rewardColW +
                    (rowItemCount - 1) * rewardGutterX;
                  const rowStartX =
                    isLastRow && rowItemCount < rewardColCount
                      ? contentX + (contentW - rowTotalW) / 2
                      : contentX;

                  return Array.from({ length: rowItemCount }).map(
                    (_, colInRow) => {
                      const rewardIdx = rowStartIdx + colInRow;
                      // RTL 模式下从右到左排列，LTR 模式下从左到右排列
                      const colPos =
                        direction === "rtl"
                          ? rowItemCount - 1 - colInRow
                          : colInRow;
                      const x =
                        rowStartX + colPos * (rewardColW + rewardGutterX);
                      const y = rowY;

                      if (!isFinite(x) || !isFinite(y)) return null;

                      return (
                        <RewardItem
                          key={`${sectionIdx}-${rewardIdx}`}
                          direction={direction}
                          reward={s.rewards[rewardIdx]}
                          style={style}
                          width={rewardColW}
                          x={x}
                          y={y}
                          onHeightMeasured={(h) => {
                            const key = `section-${sectionIdx}-reward-${rewardIdx}`;

                            setMeasuredHeights((prev) => {
                              if (prev.get(key) !== h) {
                                const newMap = new Map(prev);

                                newMap.set(key, h);

                                return newMap;
                              }

                              return prev;
                            });
                          }}
                        />
                      );
                    },
                  );
                })}
              </Group>
            )}
          </Group>
        );
      })}
    </Group>
  );
}
