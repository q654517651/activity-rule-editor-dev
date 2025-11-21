import type { Data, StyleCfg, Page } from "@/renderer/canvas/types";
import type { ExportProgress, ExportPhase, ParseResponse } from "@/types";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  memo,
  useDeferredValue,
} from "react";
import { Stage, Layer } from "react-konva";
import {
  Button,
  Input,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  ScrollShadow,
  Spinner,
  Tabs,
  Tab,
  Skeleton,
} from "@heroui/react";

import { PageCanvas } from "@/renderer/canvas/PageCanvas";
import { exportPagesToPng } from "@/renderer/canvas";
import { savePngsMultiSheet } from "@/utils/file";
import { DragDropZone } from "@/components/DragDropZone";

function defaultStyle(): StyleCfg {
  return {
    pageWidth: 750,
    pad: { t: 100, r: 48, b: 100, l: 48 },
    titleColor: "#0f172a",
    contentColor: "#334155",
    border: { image: "", slice: { t: 100, r: 66, b: 100, l: 66 } },
    font: { family: "system-ui, sans-serif", size: 24, lineHeight: 1.6 },
  };
}

// 使用相对路径，开发时通过 Vite proxy 转发到后端，生产环境根据需要配置
const API_BASE = import.meta.env.VITE_API_BASE || "";

// 图片位图缓存
const imageBitmapCache = new Map<string, ImageBitmap>();

// 异步加载图片位图
export async function loadImageBitmap(
  url: string,
): Promise<ImageBitmap | null> {
  try {
    if (imageBitmapCache.has(url)) return imageBitmapCache.get(url)!;
    const res = await fetch(url, { cache: "force-cache" });
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob, {
      premultiplyAlpha: "premultiply",
    });

    imageBitmapCache.set(url, bmp);

    return bmp;
  } catch (e) {
    console.error("加载图片失败:", url, e);

    return null;
  }
}

// 结构化估高函数 - 避免内容被裁剪
function estimatePageHeight(page: Page, style: StyleCfg): number {
  const base = style.pad.t + style.pad.b + 200;
  const sections = page.blocks ?? page.sections ?? [];
  const blocks = sections.length;
  const lines = sections.reduce((acc, s: any) => {
    const rewards = (s.rewards ?? []).length;
    const contentLines = (s.content ?? []).length;

    return acc + 2 + Math.ceil(rewards * 1.5) + contentLines;
  }, 0);

  return base + blocks * 180 + lines * style.font.size * style.font.lineHeight;
}

// 单个画布单元组件 - 使用 Intersection Observer 检测可见性
const CanvasCell = memo(
  function CanvasCell({
    page,
    style,
    zoomPct,
    estHeight,
    onMeasured,
  }: {
    page: any;
    style: StyleCfg;
    zoomPct: number;
    estHeight: number;
    onMeasured: (h: number) => void;
  }) {
    // 固定基准尺寸
    const baseWidth = style.pageWidth;
    const baseHeight = estHeight;
    const scale = zoomPct / 100;
    const scaledW = Math.round(baseWidth * scale);
    const scaledH = Math.round(baseHeight * scale);

    // 使用 Intersection Observer 检测可见性
    const containerRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
      const element = containerRef.current;

      if (!element) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          setIsVisible(entry.isIntersecting);
        },
        {
          root: null,
          rootMargin: "400px", // 提前 400px 开始加载
          threshold: 0,
        },
      );

      observer.observe(element);

      return () => observer.disconnect();
    }, []);

    return (
      <div
        ref={containerRef}
        style={{
          width: scaledW,
          height: scaledH,
          display: "inline-block",
          paddingRight: 16,
        }}
      >
        {page.region && (
          <div className="text-sm font-semibold text-black mb-2">
            {page.region}
          </div>
        )}
        <div
          style={{
            position: "relative",
            width: scaledW,
            height: scaledH,
            background: "#fff",
            borderRadius: 8,
            boxShadow: "0 1px 3px rgba(0,0,0,.1)",
            overflow: "hidden",
          }}
        >
          {/* 骨架屏占位 - 固定尺寸 */}
          <div className="absolute inset-0 bg-gray-50">
            <Skeleton className="w-full h-full rounded-lg">
              <div style={{ width: "100%", height: "100%" }} />
            </Skeleton>
          </div>

          {/* ✅ 只有可见时才挂载 Konva Stage */}
          {isVisible && (
            <Stage
              height={baseHeight}
              listening={false}
              pixelRatio={1}
              scaleX={scale}
              scaleY={scale}
              style={{ position: "absolute", inset: 0 }}
              width={baseWidth}
            >
              <Layer listening={false} perfectDrawEnabled={false}>
                <PageCanvas page={page} style={style} onMeasured={onMeasured} />
              </Layer>
            </Stage>
          )}
        </div>
      </div>
    );
  },
  (a, b) => {
    const heightDiff = Math.abs(a.estHeight - b.estHeight);

    return (
      a.page === b.page &&
      a.zoomPct === b.zoomPct &&
      heightDiff < 5 &&
      a.style === b.style
    );
  },
);

function filenameOf(p: string) {
  try {
    const q = p.split("?")[0];
    const h = q.split("#")[0];
    const segs = h.split("/");

    return segs[segs.length - 1] || h;
  } catch {
    return p;
  }
}

function rewriteImages(data: Data, images?: Record<string, string>): Data {
  if (!images || !Object.keys(images).length) return data;
  const pages = (data.pages || []).map((p) => {
    // 新结构：blocks
    if (p.blocks && p.blocks.length > 0) {
      return {
        ...p,
        blocks: p.blocks.map((block) => ({
          ...block,
          sections: (block.sections || []).map((s) => ({
            ...s,
            rewards: (s.rewards || []).map((r) => {
              if (!r.image) return r;
              const name = filenameOf(
                typeof r.image === "string" ? r.image : r.image?.url || "",
              );
              const uri = images[name];

              return uri ? { ...r, image: uri } : r;
            }),
          })),
        })),
      };
    }

    // 旧结构：sections（向后兼容）
    return {
      ...p,
      sections: (p.sections || []).map((s) => ({
        ...s,
        rewards: (s.rewards || []).map((r) => {
          if (!r.image) return r;
          const name = filenameOf(
            typeof r.image === "string" ? r.image : r.image?.url || "",
          );
          const uri = images[name];

          return uri ? { ...r, image: uri } : r;
        }),
      })),
    };
  });

  return { ...data, pages };
}

export default function PreviewPage() {
  // 多 Sheet 状态管理
  const [allSheets, setAllSheets] = useState<Map<string, Data>>(new Map());
  const [currentSheet, setCurrentSheet] = useState<string>("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);

  // 当前 sheet 的数据（从 allSheets 中获取）
  const [data, setData] = useState<Data>({ pages: [] });
  const [style, setStyle] = useState<StyleCfg>(defaultStyle());
  const [debouncedStyle, setDebouncedStyle] =
    useState<StyleCfg>(defaultStyle()); // 用于画布渲染
  const [pixelRatio, setPixelRatio] = useState(1);
  const [zoomPct, setZoomPct] = useState(50);
  const deferredZoom = useDeferredValue(zoomPct); // 延迟缩放变化
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heights, setHeights] = useState<number[]>([]);

  // 阶段化导出进度跟踪
  const [exportPhase, setExportPhase] = useState<ExportPhase | null>(null);
  const [renderCurr, setRenderCurr] = useState(0);
  const [renderTotal, setRenderTotal] = useState(0);
  const [zipPercent, setZipPercent] = useState(0);
  const [writePercent, setWritePercent] = useState(0);

  // 防抖更新画布样式 - style 变化后 500ms 更新 debouncedStyle
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // 清除之前的定时器
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
    }

    // 设置新的定时器：500ms 后更新画布样式
    debounceTimerRef.current = window.setTimeout(() => {
      setDebouncedStyle(style);
      debounceTimerRef.current = null;
    }, 500);

    return () => {
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [style]);

  const onPickJson = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as Data;

      console.log(
        "【调试】用户上传 JSON 内容:\n" + JSON.stringify(json, null, 2),
      );
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const onPickXlsx = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();

      fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/parse`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) throw new Error(`后端返回错误: ${res.status}`);
      const payload = (await res.json()) as ParseResponse;

      if (!payload?.ok) throw new Error(payload?.error || "解析失败");

      // 统一处理 sheets 结构
      const sheets = new Map<string, Data>();
      const names = Object.keys(payload.sheets);

      // 调试：打印完整的后端返回数据
      console.log("【完整后端返回】", JSON.stringify(payload, null, 2));

      names.forEach((name) => {
        // 调用 rewriteImages 重写图片 URL
        const sheetData = rewriteImages(
          payload.sheets[name].result,
          payload.sheets[name].images,
        );

        sheets.set(name, sheetData);

        // 调试：打印每个 sheet 处理后的数据
        console.log(
          `【Sheet: ${name} 处理后】`,
          JSON.stringify(sheetData, null, 2),
        );
      });

      setAllSheets(sheets);
      setSheetNames(names);

      // 选中第一个 sheet
      if (names.length > 0) {
        setCurrentSheet(names[0]);
        setData(sheets.get(names[0])!);
      } else {
        setError("没有找到有效的 sheet（需要包含 REGION- 标记）");
      }

      console.log(`✓ 加载 ${names.length} 个 sheet:`, names);
      if (payload.skipped_sheets?.length) {
        console.log(
          `✗ 跳过 ${payload.skipped_sheets.length} 个 sheet:`,
          payload.skipped_sheets,
        );
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const onPickDataFile = useCallback(
    (file: File) => {
      if (
        file.name.toLowerCase().endsWith(".json") ||
        file.type === "application/json"
      ) {
        onPickJson(file);
      } else if (
        file.name.toLowerCase().endsWith(".xlsx") ||
        file.type.includes("spreadsheet")
      ) {
        onPickXlsx(file);
      } else {
        setError("仅支持 JSON 或 XLSX 文件");
      }
    },
    [onPickJson, onPickXlsx],
  );

  const onPickBorder = useCallback(async (file: File) => {
    const blobUrl = URL.createObjectURL(file);

    try {
      const res = await fetch(blobUrl);
      const blob = await res.blob();
      const d = await new Promise<string>((resolve) => {
        const fr = new FileReader();

        fr.onload = () => resolve(fr.result as string);
        fr.readAsDataURL(blob);
      });

      setStyle((s) => ({ ...s, border: { ...s.border, image: d } }));
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }, []);

  // Sheet 切换处理 - 简单清理即可，虚拟化会自动处理
  const onSheetChange = useCallback(
    (sheetName: string) => {
      const sheetData = allSheets.get(sheetName);

      if (sheetData) {
        setCurrentSheet(sheetName);
        setData(sheetData);
        setHeights([]);
      }
    },
    [allSheets],
  );

  const onExport = useCallback(async () => {
    setLoading(true);
    setExportPhase("render");
    setRenderCurr(0);
    setZipPercent(0);
    setWritePercent(0);

    try {
      const allExports: Array<{
        sheetName: string;
        items: Array<{ name: string; dataUrl: string }>;
      }> = [];

      // 计算总页数
      const totalPages = Array.from(allSheets.values()).reduce(
        (sum, sheet) => sum + (sheet.pages?.length || 0),
        0,
      );

      setRenderTotal(totalPages);

      let currentPage = 0;

      // 遍历所有 sheet，分别渲染
      for (const [sheetName, sheetData] of allSheets) {
        const items = await exportPagesToPng(
          sheetData,
          debouncedStyle,
          pixelRatio,
          (progress: ExportProgress) => {
            if (progress.phase === "render") {
              setRenderCurr(currentPage + progress.current);
            }
          },
        );

        currentPage += sheetData.pages?.length || 0;
        allExports.push({ sheetName, items });
      }

      // 第二步：打包、写入和下载
      setExportPhase("zip");
      setZipPercent(0);
      const res = await savePngsMultiSheet(
        allExports,
        (progress: ExportProgress) => {
          if (progress.phase === "zip") {
            setZipPercent(progress.current);
          } else if (progress.phase === "write") {
            setExportPhase("write");
            const pct = Math.max(
              0,
              Math.min(
                100,
                Math.round(
                  (progress.current / Math.max(progress.total, 1)) * 100,
                ),
              ),
            );

            setWritePercent(pct);
          } else if (progress.phase === "done") {
            setExportPhase("done");
          }
        },
      );

      if (!res?.ok) throw new Error(res?.error || "导出失败");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setLoading(false);
      // 延迟清空状态，让用户看到"已完成"提示
      setTimeout(() => {
        setExportPhase(null);
        setRenderCurr(0);
        setRenderTotal(0);
        setZipPercent(0);
        setWritePercent(0);
      }, 1500);
    }
  }, [allSheets, debouncedStyle, pixelRatio]);

  // 当页数变化时，使用结构化估高初始化高度数组
  useEffect(() => {
    setHeights((prev) => {
      const next = data.pages.map((p) => estimatePageHeight(p, debouncedStyle));

      // 保留已测量的精确高度
      for (let i = 0; i < Math.min(prev.length, next.length); i++) {
        if (prev[i] && prev[i] > next[i]) next[i] = prev[i];
      }

      return next;
    });
  }, [data.pages.length, debouncedStyle]);

  // 批量测量回调 - RAF 合并多次更新为一次 setState
  const heightsRef = useRef<number[]>([]);

  useEffect(() => {
    heightsRef.current = heights;
  }, [heights]);

  const pendingRef = useRef<Map<number, number>>(new Map());
  const rafRefHeights = useRef<number | null>(null);

  const onMeasuredByIndex = useCallback(
    (idx: number) => (h: number) => {
      if (!Number.isFinite(h) || h <= 0) return;

      const prev = heightsRef.current[idx];

      // 变化小于 5px 视为相同，避免抖动
      if (prev != null && Math.abs(prev - h) < 5) return;

      // 立即更新 ref，确保即使 RAF 被取消也不丢失数据
      // 这解决了快速滚动时页面卸载导致高度更新丢失的问题
      const updatedHeights = heightsRef.current.slice();

      updatedHeights[idx] = h;
      heightsRef.current = updatedHeights;

      pendingRef.current.set(idx, h);

      if (rafRefHeights.current == null) {
        rafRefHeights.current = requestAnimationFrame(() => {
          // 直接使用最新的 ref 数据，避免闭包陷阱
          setHeights(heightsRef.current);
          pendingRef.current.clear();
          rafRefHeights.current = null;
        });
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (rafRefHeights.current != null) {
        cancelAnimationFrame(rafRefHeights.current);
      }
    };
  }, []);

  // 判断是否显示多 sheet 导航
  const isMultiSheet = sheetNames.length > 1;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* 左侧固定控制区 */}
      <aside
        style={{
          width: 450,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          borderRight: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
        }}
      >
        {/* 可滚动工具栏区域 */}
        <ScrollShadow className="w-full" style={{ flex: 1, padding: 16 }}>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-medium mb-4 text-gray-900">上传数据</h3>
            <DragDropZone
              accept=".json,.xlsx,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              description="点击选择或拖拽文件到此处"
              icon="📁"
              label="选择 JSON 或 XLSX 文件"
              loading={loading}
              onFile={onPickDataFile}
            />
            {error ? (
              <div className="text-xs text-red-600 mt-3">{error}</div>
            ) : null}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
            <h3 className="text-sm font-medium mb-4 text-gray-900">
              边框图 & 切片
            </h3>
            <DragDropZone
              accept="image/*"
              description="点击选择或拖拽图片到此处"
              icon="🖼️"
              label="选择边框图片"
              loading={loading}
              onFile={onPickBorder}
            />
            <div className="grid grid-cols-4 gap-2 mt-3">
              <Input
                label="Top"
                size="sm"
                type="number"
                value={String(style.border.slice.t)}
                onValueChange={(v) =>
                  setStyle((s) => ({
                    ...s,
                    border: {
                      ...s.border,
                      slice: { ...s.border.slice, t: Number(v || 0) },
                    },
                  }))
                }
              />
              <Input
                label="Right"
                size="sm"
                type="number"
                value={String(style.border.slice.r)}
                onValueChange={(v) =>
                  setStyle((s) => ({
                    ...s,
                    border: {
                      ...s.border,
                      slice: { ...s.border.slice, r: Number(v || 0) },
                    },
                  }))
                }
              />
              <Input
                label="Bottom"
                size="sm"
                type="number"
                value={String(style.border.slice.b)}
                onValueChange={(v) =>
                  setStyle((s) => ({
                    ...s,
                    border: {
                      ...s.border,
                      slice: { ...s.border.slice, b: Number(v || 0) },
                    },
                  }))
                }
              />
              <Input
                label="Left"
                size="sm"
                type="number"
                value={String(style.border.slice.l)}
                onValueChange={(v) =>
                  setStyle((s) => ({
                    ...s,
                    border: {
                      ...s.border,
                      slice: { ...s.border.slice, l: Number(v || 0) },
                    },
                  }))
                }
              />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
            <h3 className="text-sm font-medium mb-4 text-gray-900">样式</h3>

            {/* 标题颜色 */}
            <div className="mb-3">
              <Input
                endContent={
                  <div
                    className="relative pointer-events-auto flex items-center justify-center h-full"
                    style={{ alignSelf: "stretch" }}
                  >
                    <button
                      aria-label="选择标题颜色"
                      className="h-8 w-10 rounded-[4px] border border-default-300 flex-shrink-0"
                      style={{ backgroundColor: style.titleColor }}
                      type="button"
                    />
                    <input
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      style={{ pointerEvents: "auto" }}
                      type="color"
                      value={style.titleColor}
                      onChange={(e) =>
                        setStyle((s) => ({ ...s, titleColor: e.target.value }))
                      }
                    />
                  </div>
                }
                label="标题颜色"
                placeholder="#000000"
                size="md"
                type="text"
                value={style.titleColor}
                onValueChange={(v) => {
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                    setStyle((s) => ({ ...s, titleColor: v }));
                  }
                }}
              />
            </div>

            {/* 正文颜色 */}
            <div className="mb-3">
              <Input
                endContent={
                  <div
                    className="relative pointer-events-auto flex items-center justify-center h-full"
                    style={{ alignSelf: "stretch" }}
                  >
                    <button
                      aria-label="选择正文颜色"
                      className="h-8 w-10 rounded-[4px] border border-default-300 flex-shrink-0"
                      style={{ backgroundColor: style.contentColor }}
                      type="button"
                    />
                    <input
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      style={{ pointerEvents: "auto" }}
                      type="color"
                      value={style.contentColor}
                      onChange={(e) =>
                        setStyle((s) => ({
                          ...s,
                          contentColor: e.target.value,
                        }))
                      }
                    />
                  </div>
                }
                label="正文颜色"
                placeholder="#000000"
                size="md"
                type="text"
                value={style.contentColor}
                onValueChange={(v) => {
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                    setStyle((s) => ({ ...s, contentColor: v }));
                  }
                }}
              />
            </div>

            {/* 内边距 */}
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-2">
                内边距
              </label>
              <div className="grid grid-cols-4 gap-2">
                <Input
                  label="上"
                  size="sm"
                  type="number"
                  value={String(style.pad.t)}
                  onValueChange={(v) =>
                    setStyle((s) => ({
                      ...s,
                      pad: { ...s.pad, t: Number(v || 0) },
                    }))
                  }
                />
                <Input
                  label="右"
                  size="sm"
                  type="number"
                  value={String(style.pad.r)}
                  onValueChange={(v) =>
                    setStyle((s) => ({
                      ...s,
                      pad: { ...s.pad, r: Number(v || 0) },
                    }))
                  }
                />
                <Input
                  label="下"
                  size="sm"
                  type="number"
                  value={String(style.pad.b)}
                  onValueChange={(v) =>
                    setStyle((s) => ({
                      ...s,
                      pad: { ...s.pad, b: Number(v || 0) },
                    }))
                  }
                />
                <Input
                  label="左"
                  size="sm"
                  type="number"
                  value={String(style.pad.l)}
                  onValueChange={(v) =>
                    setStyle((s) => ({
                      ...s,
                      pad: { ...s.pad, l: Number(v || 0) },
                    }))
                  }
                />
              </div>
            </div>
          </div>
        </ScrollShadow>

        {/* 固定在底部的导出区域 */}
        <div className="bg-white border-t border-gray-200 p-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button
              className="flex-1"
              color="primary"
              isDisabled={loading || allSheets.size === 0}
              startContent={
                exportPhase ? (
                  <Spinner color="current" size="sm" variant="wave" />
                ) : undefined
              }
              onPress={onExport}
            >
              {exportPhase === "render"
                ? `导出中... 剩余 ${Math.max(0, renderTotal - renderCurr)} 张`
                : exportPhase === "zip"
                  ? `打包中... ${zipPercent}%`
                  : exportPhase === "write"
                    ? `写入中... ${writePercent}%`
                    : exportPhase === "done"
                      ? "✓ 已完成"
                      : isMultiSheet
                        ? `导出全部 (${sheetNames.length} 个表)`
                        : "导出 PNG"}
            </Button>
            <Dropdown>
              <DropdownTrigger>
                <Button isDisabled={loading} size="md" variant="flat">
                  {pixelRatio}x
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                selectedKeys={new Set([String(pixelRatio)])}
                selectionMode="single"
                onSelectionChange={(keys) => {
                  const k = Array.from(keys as Set<string>)[0];

                  if (k) setPixelRatio(Number(k));
                }}
              >
                <DropdownItem key="1">1x</DropdownItem>
                <DropdownItem key="2">2x</DropdownItem>
                <DropdownItem key="3">3x</DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </aside>

      {/* 右侧画布区域 - 整体可滚动 */}
      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* 顶部导航栏 - 固定 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          {/* Sheet Tabs（多 sheet 时显示） */}
          {isMultiSheet && (
            <Tabs
              aria-label="工作表切换"
              selectedKey={currentSheet}
              onSelectionChange={(key) => onSheetChange(key as string)}
            >
              {sheetNames.map((name) => (
                <Tab key={name} title={name} />
              ))}
            </Tabs>
          )}

          {/* 右侧：缩放和页数控制 */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-500">缩放</span>
            <Dropdown>
              <DropdownTrigger>
                <Button size="sm" variant="flat">
                  {zoomPct}%
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                selectedKeys={new Set([String(zoomPct)])}
                selectionMode="single"
                onSelectionChange={(keys) => {
                  const k = Array.from(keys as Set<string>)[0];

                  if (k) setZoomPct(Number(k));
                }}
              >
                <DropdownItem key="25">25%</DropdownItem>
                <DropdownItem key="50">50%</DropdownItem>
                <DropdownItem key="75">75%</DropdownItem>
                <DropdownItem key="100">100%</DropdownItem>
              </DropdownMenu>
            </Dropdown>
            <span className="text-sm text-gray-500">
              共 {data.pages?.length || 0} 页
            </span>
          </div>
        </div>

        {/* 横向滚动画布容器 - 使用 Intersection Observer 懒加载 */}
        <div
          style={{
            flex: 1,
            backgroundColor: "#f9fafb",
            overflow: "auto",
            padding: 16,
          }}
        >
          <div style={{ display: "flex", gap: 16, width: "max-content" }}>
            {data.pages.map((page, index) => (
              <CanvasCell
                key={`${currentSheet}-${index}`}
                estHeight={heights[index] || 1200}
                page={page}
                style={debouncedStyle}
                zoomPct={deferredZoom}
                onMeasured={onMeasuredByIndex(index)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
