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
import { TableComponentShape } from "./TableComponentShape";
import { ParagraphComponent } from "./ParagraphComponent";
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
  forExport = false,
  onHeightMeasured,
  onTextClick,
  onImageClick,
  rewardPath: _rewardPath,
}: {
  reward: Reward;
  x: number;
  y: number;
  width: number;
  style: StyleCfg;
  direction?: "rtl" | "ltr";
  forExport?: boolean;
  onHeightMeasured?: (h: number) => void;
  onTextClick?: (
    field: "name" | "desc",
    value: string,
    pos: { x: number; y: number; width: number; height: number },
  ) => void;
  onImageClick?: () => void;
  rewardPath?: string;
}) {
  const [rewardImg, setRewardImg] = useState<CanvasImageSource | null>(null);
  const [imageStatus, setImageStatus] = useState<
    "loading" | "loaded" | "error" | "none"
  >("none");
  const nameRef = useRef<Konva.Text>(null);
  const descRef = useRef<Konva.Text>(null);
  const [hoveredPart, setHoveredPart] = useState<
    "image" | "name" | "desc" | null
  >(null);

  useEffect(() => {
    // 如果奖励没有图片，设置为 none 状态（不显示任何图片相关UI）
    if (!reward.image) {
      setRewardImg(null);
      setImageStatus("none");

      return;
    }

    setImageStatus("loading");

    (async () => {
      // 处理新旧两种格式：字符串 URL 或 ImageMeta 对象
      const imageUrl =
        typeof reward.image === "string" ? reward.image : reward.image?.url;

      if (!imageUrl) {
        setRewardImg(null);
        setImageStatus("none");

        return;
      }

      try {
        const bmp = await loadBitmap(imageUrl);

        if (bmp) {
          setRewardImg(bmp as any);
          setImageStatus("loaded");
        } else {
          setImageStatus("error");
        }
      } catch (error) {
        console.error(`[RewardItem] 图片加载失败 ${imageUrl}:`, error);
        setImageStatus("error");
      }
    })();
  }, [reward.image]);

  // 测量实际渲染高度（依赖 imageStatus 以便状态变化时重新测量）
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
  }, [reward.name, reward.desc, width, onHeightMeasured, imageStatus]);

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
      {/* 图片加载状态显示 - 只有在确实有图片时才显示 */}
      {imageStatus === "loading" && reward.image && (
        <Group>
          {/* 占位背景 */}
          <Rect
            cornerRadius={8}
            fill="#f0f0f0"
            height={imgBoxSize}
            width={imgBoxSize}
            x={(width - imgBoxSize) / 2}
            y={imgPadding}
          />
          {/* 加载动画 */}
          <Rect
            cornerRadius={8}
            fill="#e0e0e0"
            height={imgBoxSize * 0.6}
            opacity={0.5}
            width={imgBoxSize * 0.6}
            x={(width - imgBoxSize * 0.6) / 2}
            y={imgPadding + imgBoxSize * 0.2}
          />
          <Text
            align="center"
            fill="#999"
            fontSize={14}
            text="Loading..."
            width={width}
            x={0}
            y={imgPadding + imgBoxSize / 2 - 7}
          />
        </Group>
      )}

      {/* 错误状态 - 只有在确实有图片URL但加载失败时才显示 */}
      {imageStatus === "error" && reward.image && (
        <Group>
          <Rect
            cornerRadius={8}
            fill="#ffebee"
            height={imgBoxSize}
            width={imgBoxSize}
            x={(width - imgBoxSize) / 2}
            y={imgPadding}
          />
          <Text
            align="center"
            fill="#d32f2f"
            fontSize={32}
            text="❌"
            width={width}
            x={0}
            y={imgPadding + imgBoxSize / 2 - 16}
          />
        </Group>
      )}

      {/* 奖励图片 - 已加载 */}
      {rewardImg && imageStatus === "loaded" && (
        <>
          <KImage
            height={displayImgH}
            image={rewardImg as any}
            listening={!forExport}
            width={displayImgW}
            x={(width - imgBoxSize) / 2 + imgOffsetX}
            y={imgPadding + imgOffsetY}
            onClick={() => {
              if (!forExport && onImageClick) {
                onImageClick();
              }
            }}
            onMouseEnter={() => !forExport && setHoveredPart("image")}
            onMouseLeave={() => !forExport && setHoveredPart(null)}
          />
          {/* 图片悬浮边框 */}
          {!forExport && hoveredPart === "image" && (
            <Rect
              dash={[5, 5]}
              height={imgBoxSize + 8}
              listening={false}
              stroke="#ff3333"
              strokeWidth={2}
              width={imgBoxSize + 8}
              x={(width - imgBoxSize) / 2 - 4}
              y={imgPadding - 4}
            />
          )}
        </>
      )}

      {/* 奖励名称（标题，加粗，在列宽内水平居中） */}
      {reward.name && (
        <>
          <Text
            ref={nameRef}
            align="center"
            direction={direction}
            fill={style.titleColor}
            fontFamily={style.font.family}
            fontSize={style.font.size}
            fontStyle="bold"
            listening={!forExport}
            text={reward.name}
            width={width}
            x={0}
            y={textStartY}
            onClick={() => {
              if (!forExport && onTextClick && nameRef.current) {
                const absPos = nameRef.current.getAbsolutePosition();

                onTextClick("name", reward.name || "", {
                  x: absPos.x,
                  y: absPos.y,
                  width: nameRef.current.width(),
                  height: nameRef.current.height(),
                });
              }
            }}
            onMouseEnter={() => !forExport && setHoveredPart("name")}
            onMouseLeave={() => !forExport && setHoveredPart(null)}
          />
          {/* 名称悬浮边框 */}
          {!forExport && hoveredPart === "name" && (
            <Rect
              dash={[5, 5]}
              height={nameH + 8}
              listening={false}
              stroke="#ff3333"
              strokeWidth={2}
              width={width + 8}
              x={-4}
              y={textStartY - 4}
            />
          )}
        </>
      )}

      {/* 奖励描述 - 居中对齐，与图片和标题保持一致 */}
      {reward.desc ? (
        <>
          <Text
            ref={descRef}
            align="center"
            direction={direction}
            fill={style.contentColor}
            fontFamily={style.font.family}
            fontSize={style.font.size - 2}
            lineHeight={style.font.lineHeight}
            listening={!forExport}
            text={reward.desc}
            width={width}
            x={0}
            y={textStartY + nameH + textGapV}
            onClick={() => {
              if (!forExport && onTextClick && descRef.current) {
                const absPos = descRef.current.getAbsolutePosition();

                onTextClick("desc", reward.desc || "", {
                  x: absPos.x,
                  y: absPos.y,
                  width: descRef.current.width(),
                  height: descRef.current.height(),
                });
              }
            }}
            onMouseEnter={() => !forExport && setHoveredPart("desc")}
            onMouseLeave={() => !forExport && setHoveredPart(null)}
          />
          {/* 描述悬浮边框 */}
          {!forExport && hoveredPart === "desc" && (
            <Rect
              dash={[5, 5]}
              height={descRef.current ? descRef.current.height() + 8 : 20}
              listening={false}
              stroke="#ff3333"
              strokeWidth={2}
              width={width + 8}
              x={-4}
              y={textStartY + nameH + textGapV - 4}
            />
          )}
        </>
      ) : null}
    </Group>
  );
}

export function PageCanvas({
  page,
  style,
  forExport = false,
  onMeasured,
  onTextClick,
  onImageClick,
  onTableClick,
  tableImageSize = 120,
}: {
  page: Page;
  style: StyleCfg;
  forExport?: boolean;
  onMeasured?: (height: number) => void;
  onTextClick?: (info: {
    path: string; // 如 "blocks.0.sections.1.title"
    value: string;
    position: { x: number; y: number };
    width: number;
    height: number;
    fontSize: number;
    multiline: boolean;
  }) => void;
  onImageClick?: (info: {
    path: string; // 如 "blocks.0.sections.1.rewards.0.image"
    currentImage?: string;
  }) => void;
  onTableClick?: (info: {
    path: string; // 如 "sections.0.table"
    table: any;
  }) => void;
  tableImageSize?: number; // 表格图片大小，默认 120
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
  const [blockTitleBgBmp, setBlockTitleBgBmp] = useState<CanvasImageSource | null>(null);
  const [sectionTitleBgBmp, setSectionTitleBgBmp] = useState<CanvasImageSource | null>(null);

  // 存储每个section文本的实际渲染高度
  const [measuredHeights, setMeasuredHeights] = useState<Map<string, number>>(
    new Map(),
  );

  // 悬浮状态管理（用于显示虚线边框）
  const [hoveredText, setHoveredText] = useState<string | null>(null);

  // 存储 Text 组件的 ref
  const textRefs = useRef<Map<string, Konva.Text>>(new Map());

  useEffect(() => {
    (async () => {
      setBorderBmp(null);
      const bmp = await loadBitmap(style.border.image);

      if (bmp) setBorderBmp(bmp as any);
    })();
  }, [style.border.image]);

  // 加载大标题背景
  useEffect(() => {
    (async () => {
      setBlockTitleBgBmp(null);
      if (style.blockTitleBg) {
        const bmp = await loadBitmap(style.blockTitleBg);
        if (bmp) setBlockTitleBgBmp(bmp as any);
      }
    })();
  }, [style.blockTitleBg]);

  // 加载小标题背景
  useEffect(() => {
    (async () => {
      setSectionTitleBgBmp(null);
      if (style.sectionTitleBg) {
        const bmp = await loadBitmap(style.sectionTitleBg);
        if (bmp) setSectionTitleBgBmp(bmp as any);
      }
    })();
  }, [style.sectionTitleBg]);

  // 测量所有文本的实际渲染高度
  useLayoutEffect(() => {
    let hasChanges = false;
    const updates: Array<{ key: string; height: number }> = [];

    textRefs.current.forEach((textNode, key) => {
      if (textNode) {
        const height = textNode.height();

        if (height > 0) {
          if (
            !measuredHeights.has(key) ||
            measuredHeights.get(key) !== height
          ) {
            hasChanges = true;
            updates.push({ key, height });
          }
        }
      }
    });

    // 合并更新，而不是完全替换，保留表格、奖励等其他组件的高度
    if (hasChanges) {
      setMeasuredHeights((prev) => {
        const newMap = new Map(prev);
        for (const { key, height } of updates) {
          newMap.set(key, height);
        }
        return newMap;
      });
    }
  }, [normalizedPage, style.font.size, style.font.lineHeight, style.pageWidth]); // 依赖所有影响文本高度的属性

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

      // section 内容高度 - 优先使用 paragraphs，否则使用 content
      let contentH = 0;

      if (section.paragraphs && section.paragraphs.length > 0) {
        // 使用新的段落结构
        const paragraphKey = `section-${sectionIdx}-paragraphs`;
        contentH = measuredHeights.get(paragraphKey) || 
          Math.ceil(section.paragraphs.length * style.font.size * style.font.lineHeight);
      } else if (section.content && contentW > 0) {
        // 向后兼容旧的字符串格式
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
          (() => {
            // 检查表格中是否有图片单元格
            let hasImages = false;

            for (const row of section.table.rows) {
              for (const cell of row) {
                if (cell.is_image) {
                  hasImages = true;
                  break;
                }
              }
              if (hasImages) break;
            }

            // 如果有图片，使用图片最大高度估算（tableImageSize + padding）
            // 否则使用文本高度估算（minRowHeight + padding）
            const rowHeight = hasImages
              ? tableImageSize + 16
              : style.font.size * 2 + 16;

            return Math.ceil(rowHeight * (section.table.rows.length + 1));
          })()
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

  // 防止无限循环：只在高度确实变化时上报
  // 使用稳定性检测：等待高度稳定后再上报，避免多表格竞态条件
  const lastReportedRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const stabilityTimerRef = useRef<number | null>(null);
  const pendingHeightRef = useRef<number | null>(null);
  const stabilityDelay = 100; // 等待 100ms 确认高度稳定

  const reportHeight = useCallback(
    (h: number) => {
      if (!Number.isFinite(h) || h <= 0) return;
      
      // 记录待上报的高度
      pendingHeightRef.current = h;
      
      // 清除之前的稳定性检测定时器
      if (stabilityTimerRef.current != null) {
        clearTimeout(stabilityTimerRef.current);
      }
      
      // 设置稳定性检测：如果 100ms 内没有新的高度变化，才上报
      stabilityTimerRef.current = window.setTimeout(() => {
        const finalHeight = pendingHeightRef.current;
        if (finalHeight == null || !Number.isFinite(finalHeight)) return;
        
        // 变化小于 1px 视为相同，不上报
        if (
          lastReportedRef.current !== null &&
          Math.abs(lastReportedRef.current - finalHeight) < 1
        ) {
          return;
        }

        lastReportedRef.current = finalHeight;
        
        // 使用 RAF 确保在下一帧渲染
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          onMeasured?.(finalHeight);
          rafRef.current = null;
        });
        
        stabilityTimerRef.current = null;
      }, stabilityDelay);
    },
    [onMeasured],
  );

  useLayoutEffect(() => {
    reportHeight(H);
  }, [H, reportHeight]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (stabilityTimerRef.current != null) clearTimeout(stabilityTimerRef.current);
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
              <>
                {/* 大标题背景图（在文字下层） */}
                {blockTitleBgBmp && (() => {
                  const bgHeight = s.blockTitleH + 16; // 标题高度 + padding (上下各8)
                  const bgWidth = ((blockTitleBgBmp as any).width / (blockTitleBgBmp as any).height) * bgHeight;
                  const bgX = contentX + (contentW - bgWidth) / 2; // 水平居中
                  const bgY = blockTitleY - 8; // 垂直居中（预留padding）
                  
                  return (
                    <KImage
                      image={blockTitleBgBmp as any}
                      x={bgX}
                      y={bgY}
                      width={bgWidth}
                      height={bgHeight}
                      listening={false}
                    />
                  );
                })()}
                
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
                  listening={!forExport}
                  text={s.section._blockTitle}
                  width={contentW}
                  x={contentX}
                  y={blockTitleY}
                  onClick={() => {
                    if (!forExport && onTextClick) {
                      const node = textRefs.current.get(
                        `section-${sectionIdx}-blocktitle`,
                      );

                      if (node) {
                        const absPos = node.getAbsolutePosition();

                        onTextClick({
                          path: `sections.${sectionIdx}._blockTitle`,
                          value: s.section._blockTitle || "",
                          position: { x: absPos.x, y: absPos.y },
                          width: node.width(),
                          height: node.height(),
                          fontSize: style.font.size + 4,
                          multiline: false,
                        });
                      }
                    }
                  }}
                  onMouseEnter={() =>
                    !forExport && setHoveredText(`blocktitle-${sectionIdx}`)
                  }
                  onMouseLeave={() => !forExport && setHoveredText(null)}
                />
                {/* 悬浮时的虚线边框 */}
                {!forExport && hoveredText === `blocktitle-${sectionIdx}` && (
                  <Rect
                    dash={[5, 5]}
                    height={s.blockTitleH + 8}
                    listening={false}
                    stroke="#ff3333"
                    strokeWidth={2}
                    width={contentW + 8}
                    x={contentX - 4}
                    y={blockTitleY - 4}
                  />
                )}
              </>
            ) : null}

            {/* Section 标题 - 水平居中 */}
            {s.section.title ? (
              <>
                {/* 小标题背景图（在文字下层） */}
                {sectionTitleBgBmp && (() => {
                  const bgHeight = s.titleH + 16; // 标题高度 + padding (上下各8)
                  const bgWidth = ((sectionTitleBgBmp as any).width / (sectionTitleBgBmp as any).height) * bgHeight;
                  const bgX = contentX + (contentW - bgWidth) / 2; // 水平居中
                  const bgY = titleY - 8; // 垂直居中（预留padding）
                  
                  return (
                    <KImage
                      image={sectionTitleBgBmp as any}
                      x={bgX}
                      y={bgY}
                      width={bgWidth}
                      height={bgHeight}
                      listening={false}
                    />
                  );
                })()}
                
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
                  listening={!forExport}
                  text={s.section.title}
                  width={contentW}
                  x={contentX}
                  y={titleY}
                  onClick={() => {
                    if (!forExport && onTextClick) {
                      const node = textRefs.current.get(
                        `section-${sectionIdx}-title`,
                      );

                      if (node) {
                        const absPos = node.getAbsolutePosition();

                        onTextClick({
                          path: `sections.${sectionIdx}.title`,
                          value: s.section.title || "",
                          position: { x: absPos.x, y: absPos.y },
                          width: node.width(),
                          height: node.height(),
                          fontSize: style.font.size,
                          multiline: false,
                        });
                      }
                    }
                  }}
                  onMouseEnter={() =>
                    !forExport && setHoveredText(`title-${sectionIdx}`)
                  }
                  onMouseLeave={() => !forExport && setHoveredText(null)}
                />
                {/* 悬浮时的虚线边框 */}
                {!forExport && hoveredText === `title-${sectionIdx}` && (
                  <Rect
                    dash={[5, 5]}
                    height={s.titleH + 8}
                    listening={false}
                    stroke="#ff3333"
                    strokeWidth={2}
                    width={contentW + 8}
                    x={contentX - 4}
                    y={titleY - 4}
                  />
                )}
              </>
            ) : null}

            {/* Section 内容 - 优先使用新的段落结构，否则使用旧的 content */}
            {s.section.paragraphs && s.section.paragraphs.length > 0 ? (
              <ParagraphComponent
                baseFontSize={style.font.size}
                baseFontFamily={style.font.family}
                baseColor={style.contentColor}
                baseLineHeight={style.font.lineHeight}
                direction={direction}
                forExport={forExport}
                paragraphs={s.section.paragraphs}
                width={contentW}
                x={contentX}
                y={contentY}
                onHeightMeasured={(h) => {
                  const key = `section-${sectionIdx}-paragraphs`;
                  if (measuredHeights.get(key) !== h) {
                    setMeasuredHeights((prev) => new Map(prev).set(key, h));
                  }
                }}
                onTextClick={(paraIdx, text) => {
                  if (!forExport && onTextClick) {
                    onTextClick({
                      path: `sections.${sectionIdx}.paragraphs.${paraIdx}`,
                      value: text,
                      position: { x: contentX, y: contentY },
                      width: contentW,
                      height: s.contentH,
                      fontSize: style.font.size,
                      multiline: true,
                    });
                  }
                }}
              />
            ) : s.section.content ? (
              <>
                <Group
                  listening={!forExport}
                  onClick={() => {
                    if (!forExport && onTextClick) {
                      onTextClick({
                        path: `sections.${sectionIdx}.content`,
                        value: s.section.content || "",
                        position: { x: contentX, y: contentY },
                        width: contentW,
                        height: s.contentH,
                        fontSize: style.font.size,
                        multiline: true,
                      });
                    }
                  }}
                  onMouseEnter={() =>
                    !forExport && setHoveredText(`content-${sectionIdx}`)
                  }
                  onMouseLeave={() => !forExport && setHoveredText(null)}
                >
                  {/* 透明 Rect 用于捕获鼠标事件 */}
                  {!forExport && (
                    <Rect
                      fill="transparent"
                      height={s.contentH}
                      listening={true}
                      width={contentW}
                      x={contentX}
                      y={contentY}
                    />
                  )}
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
                          listening={false}
                          text={displayText}
                          width={contentW}
                          x={contentX}
                          y={currentY}
                        />
                      );
                    });
                  })()}
                </Group>
                {/* 悬浮时的虚线边框 */}
                {!forExport && hoveredText === `content-${sectionIdx}` && (
                  <Rect
                    dash={[5, 5]}
                    height={s.contentH + 8}
                    listening={false}
                    stroke="#ff3333"
                    strokeWidth={2}
                    width={contentW + 8}
                    x={contentX - 4}
                    y={contentY - 4}
                  />
                )}
              </>
            ) : null}

            {/* Section 表格 */}
            {s.section.table ? (
              <TableComponentShape
                contentColor={style.contentColor}
                direction={direction}
                fontFamily={style.font.family}
                fontSize={style.font.size}
                forExport={forExport}
                maxImageHeight={tableImageSize}
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
                onTableClick={(table) => {
                  if (!forExport && onTableClick) {
                    onTableClick({
                      path: `sections.${sectionIdx}.table`,
                      table,
                    });
                  }
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
                          forExport={forExport}
                          reward={s.rewards[rewardIdx]}
                          rewardPath={`sections.${sectionIdx}.rewards.${rewardIdx}`}
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
                          onImageClick={() => {
                            if (onImageClick) {
                              const currentImage = s.rewards[rewardIdx].image;
                              const imageUrl =
                                typeof currentImage === "string"
                                  ? currentImage
                                  : currentImage?.url;

                              onImageClick({
                                path: `sections.${sectionIdx}.rewards.${rewardIdx}.image`,
                                currentImage: imageUrl,
                              });
                            }
                          }}
                          onTextClick={(field, value, pos) => {
                            if (onTextClick) {
                              onTextClick({
                                path: `sections.${sectionIdx}.rewards.${rewardIdx}.${field}`,
                                value,
                                position: { x: pos.x, y: pos.y },
                                width: pos.width,
                                height: pos.height,
                                fontSize:
                                  field === "name"
                                    ? style.font.size
                                    : style.font.size - 2,
                                multiline: false,
                              });
                            }
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
