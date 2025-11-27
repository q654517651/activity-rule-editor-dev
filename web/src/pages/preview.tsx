import type { Data, StyleCfg, Page } from "@/renderer/canvas/types";
import type { ExportProgress, ExportPhase, ParseResponse } from "@/types";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  memo,
  useDeferredValue,
  useMemo,
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
  Slider,
} from "@heroui/react";

import { PageCanvas } from "@/renderer/canvas/PageCanvas";
import { exportPagesToPng, renderPageToDataURL } from "@/renderer/canvas";
import { savePngsMultiSheet } from "@/utils/file";
import { convertImageFormat, compressImage } from "@/utils/image";
import { DragDropZone } from "@/components/DragDropZone";
import { ImageUploadModal } from "@/components/ImageUploadModal";
import { TextEditModal } from "@/components/TextEditModal";
import {
  DownloadHistory,
  type DownloadItem,
} from "@/components/DownloadHistory";
import { DownloadMenu } from "@/components/DownloadMenu";

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
    onDownload,
    onTextClick,
    onImageClick,
    tableImageSize,
  }: {
    page: Page;
    style: StyleCfg;
    zoomPct: number;
    estHeight: number;
    onMeasured: (h: number) => void;
    onDownload: (type: "original" | "tinypng", format: "png" | "webp") => void;
    onTextClick: (info: any) => void;
    onImageClick: (info: any) => void;
    tableImageSize: number;
  }) {
    // 固定基准尺寸
    const baseWidth = style.pageWidth;
    const baseHeight = estHeight;
    const scale = zoomPct / 100;
    const scaledW = Math.round(baseWidth * scale);
    const scaledH = Math.round(baseHeight * scale);

    // 使用 Intersection Observer 检测可见性
    const containerRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<any>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

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
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
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
              ref={stageRef}
              height={baseHeight}
              listening={true}
              pixelRatio={1}
              scaleX={scale}
              scaleY={scale}
              style={{ position: "absolute", inset: 0 }}
              width={baseWidth}
            >
              <Layer listening={true} perfectDrawEnabled={false}>
                <PageCanvas
                  page={page}
                  style={style}
                  tableImageSize={tableImageSize}
                  onImageClick={onImageClick}
                  onMeasured={onMeasured}
                  onTextClick={(info) => onTextClick(info)}
                />
              </Layer>
            </Stage>
          )}

          {/* 悬浮时显示下载菜单 */}
          {isHovered && (
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                zIndex: 10,
              }}
            >
              <DownloadMenu onDownload={onDownload} />
            </div>
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
      a.style === b.style &&
      a.tableImageSize === b.tableImageSize
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
  const [tableImageSize, setTableImageSize] = useState(120); // 表格图片大小
  const [uploadedDataFile, setUploadedDataFile] = useState<{
    name: string;
    type: string;
  } | null>(null); // 已上传的数据文件
  const [uploadedBorderFile, setUploadedBorderFile] = useState<string | null>(
    null,
  ); // 已上传的边框图文件名
  const [uploadedBlockTitleBg, setUploadedBlockTitleBg] = useState<string | null>(
    null,
  ); // 已上传的大标题背景文件名
  const [uploadedSectionTitleBg, setUploadedSectionTitleBg] = useState<string | null>(
    null,
  ); // 已上传的小标题背景文件名

  // 编辑功能状态
  const [editingText, setEditingText] = useState<{
    pageIndex: number;
    path: string;
    value: string;
    position: { x: number; y: number };
    width: number;
    height: number;
    fontSize: number;
    multiline: boolean;
    title: string;
    large: boolean;
  } | null>(null);

  const [editingImage, setEditingImage] = useState<{
    pageIndex: number;
    path: string;
    currentImage?: string;
  } | null>(null);

  // 阶段化导出进度跟踪
  const [exportPhase, setExportPhase] = useState<ExportPhase | null>(null);
  const [renderCurr, setRenderCurr] = useState(0);
  const [renderTotal, setRenderTotal] = useState(0);
  const [zipPercent, setZipPercent] = useState(0);
  const [writePercent, setWritePercent] = useState(0);


  // 下载历史
  const [downloadHistory, setDownloadHistory] = useState<DownloadItem[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

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
      setUploadedDataFile({ name: file.name, type: "json" });
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
      setUploadedDataFile({ name: file.name, type: "xlsx" });
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
      setUploadedBorderFile(file.name);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }, []);

  // 删除数据文件
  const onDeleteDataFile = useCallback(() => {
    setData({ pages: [] });
    setAllSheets(new Map());
    setSheetNames([]);
    setCurrentSheet("");
    setUploadedDataFile(null);
    setError(null);
  }, []);

  // 删除边框图
  const onDeleteBorderFile = useCallback(() => {
    setStyle((s) => ({ ...s, border: { ...s.border, image: "" } }));
    setUploadedBorderFile(null);
  }, []);

  // 上传大标题背景
  const onPickBlockTitleBg = useCallback(async (file: File) => {
    const blobUrl = URL.createObjectURL(file);

    try {
      const res = await fetch(blobUrl);
      const blob = await res.blob();
      const d = await new Promise<string>((resolve) => {
        const fr = new FileReader();

        fr.onload = () => resolve(fr.result as string);
        fr.readAsDataURL(blob);
      });

      setStyle((s) => ({ ...s, blockTitleBg: d }));
      setUploadedBlockTitleBg(file.name);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }, []);

  // 删除大标题背景
  const onDeleteBlockTitleBg = useCallback(() => {
    setStyle((s) => ({ ...s, blockTitleBg: undefined }));
    setUploadedBlockTitleBg(null);
  }, []);

  // 上传小标题背景
  const onPickSectionTitleBg = useCallback(async (file: File) => {
    const blobUrl = URL.createObjectURL(file);

    try {
      const res = await fetch(blobUrl);
      const blob = await res.blob();
      const d = await new Promise<string>((resolve) => {
        const fr = new FileReader();

        fr.onload = () => resolve(fr.result as string);
        fr.readAsDataURL(blob);
      });

      setStyle((s) => ({ ...s, sectionTitleBg: d }));
      setUploadedSectionTitleBg(file.name);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }, []);

  // 删除小标题背景
  const onDeleteSectionTitleBg = useCallback(() => {
    setStyle((s) => ({ ...s, sectionTitleBg: undefined }));
    setUploadedSectionTitleBg(null);
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

  // 处理文字点击
  const handleTextClick = useCallback((pageIndex: number, info: {
    path: string;
    value: string;
    position: { x: number; y: number };
    width?: number;
    height?: number;
    fontSize?: number;
    multiline?: boolean;
  }) => {
    // 根据路径判断编辑的是什么内容
    let title = "编辑文字";
    let large = false;

    if (info.path.includes(".table.rows.")) {
      title = "编辑表格单元格";
    } else if (info.path.includes(".content")) {
      title = "编辑规则内容";
      large = true; // 规则页内容用大文本框
    } else if (info.path.includes("._blockTitle")) {
      title = "编辑区块标题";
    } else if (info.path.includes(".title")) {
      title = "编辑标题";
    } else if (info.path.includes(".rewards.")) {
      if (info.path.endsWith(".name")) {
        title = "编辑奖励名称";
      } else if (info.path.endsWith(".desc")) {
        title = "编辑奖励描述";
      }
    }

    setEditingText({
      pageIndex,
      path: info.path,
      value: info.value,
      position: info.position,
      width: info.width ?? 0,
      height: info.height ?? 0,
      fontSize: info.fontSize ?? 14,
      multiline: info.multiline ?? false,
      title,
      large,
    });
  }, []);

  // 处理图片点击
  const handleImageClick = useCallback((pageIndex: number, info: any) => {
    setEditingImage({
      pageIndex,
      ...info,
    });
  }, []);

  // 保存文字编辑
  const handleTextSave = useCallback(
    (newValue: string) => {
      if (!editingText) return;

      const newData = JSON.parse(JSON.stringify(data));
      const page = newData.pages[editingText.pageIndex];

      // 解析路径：sections.0.title 或 sections.0.rewards.1.name
      const pathParts = editingText.path.split(".");

      // 如果页面有 blocks 结构但路径是 sections.X，需要映射回原始 blocks
      if (page.blocks && pathParts[0] === "sections") {
        const sectionIdx = Number(pathParts[1]);

        // 找到这个 section 属于哪个 block
        let currentSectionCount = 0;

        for (let blockIdx = 0; blockIdx < page.blocks.length; blockIdx++) {
          const block = page.blocks[blockIdx];
          const sectionsInBlock = block.sections.length;

          if (currentSectionCount + sectionsInBlock > sectionIdx) {
            // 找到了对应的 block
            const sectionInBlockIdx = sectionIdx - currentSectionCount;

            // 构建新路径
            let target: any = page.blocks[blockIdx].sections[sectionInBlockIdx];

            // 处理剩余路径 (title, content, rewards.X.name等)
            for (let i = 2; i < pathParts.length - 1; i++) {
              const key = pathParts[i];

              if (!isNaN(Number(pathParts[i + 1]))) {
                target = target[key][Number(pathParts[++i])];
              } else {
                target = target[key];
              }
            }

            target[pathParts[pathParts.length - 1]] = newValue;
            break;
          }

          currentSectionCount += sectionsInBlock;
        }
      } else {
        // 旧结构或直接 sections，直接更新
        let target: any = page;

        for (let i = 0; i < pathParts.length - 1; i++) {
          const key = pathParts[i];

          if (!isNaN(Number(pathParts[i + 1]))) {
            target = target[key][Number(pathParts[++i])];
          } else {
            target = target[key];
          }
        }
        target[pathParts[pathParts.length - 1]] = newValue;
      }

      setData(newData);

      // 同步到 allSheets
      const newSheets = new Map(allSheets);

      newSheets.set(currentSheet, newData);
      setAllSheets(newSheets);

      setEditingText(null);
      console.log("✓ 文字已保存:", newValue);
    },
    [editingText, data, allSheets, currentSheet],
  );

  // 保存图片替换
  const handleImageSave = useCallback(
    (imageDataUrl: string) => {
      if (!editingImage) return;

      const newData = JSON.parse(JSON.stringify(data));
      const page = newData.pages[editingImage.pageIndex];

      // 解析路径：sections.0.rewards.1.image
      const pathParts = editingImage.path.split(".");

      // 如果页面有 blocks 结构但路径是 sections.X，需要映射回原始 blocks
      if (page.blocks && pathParts[0] === "sections") {
        const sectionIdx = Number(pathParts[1]);

        // 找到这个 section 属于哪个 block
        let currentSectionCount = 0;

        for (let blockIdx = 0; blockIdx < page.blocks.length; blockIdx++) {
          const block = page.blocks[blockIdx];
          const sectionsInBlock = block.sections.length;

          if (currentSectionCount + sectionsInBlock > sectionIdx) {
            // 找到了对应的 block
            const sectionInBlockIdx = sectionIdx - currentSectionCount;

            // 构建新路径
            let target: any = page.blocks[blockIdx].sections[sectionInBlockIdx];

            // 处理剩余路径 (rewards.X.image)
            for (let i = 2; i < pathParts.length - 1; i++) {
              const key = pathParts[i];

              if (!isNaN(Number(pathParts[i + 1]))) {
                target = target[key][Number(pathParts[++i])];
              } else {
                target = target[key];
              }
            }

            target[pathParts[pathParts.length - 1]] = imageDataUrl;
            break;
          }

          currentSectionCount += sectionsInBlock;
        }
      } else {
        // 旧结构或直接 sections，直接更新
        let target: any = page;

        for (let i = 0; i < pathParts.length - 1; i++) {
          const key = pathParts[i];

          if (!isNaN(Number(pathParts[i + 1]))) {
            target = target[key][Number(pathParts[++i])];
          } else {
            target = target[key];
          }
        }
        target[pathParts[pathParts.length - 1]] = imageDataUrl;
      }

      setData(newData);

      // 同步到 allSheets
      const newSheets = new Map(allSheets);

      newSheets.set(currentSheet, newData);
      setAllSheets(newSheets);

      setEditingImage(null);
      console.log("✓ 图片已保存");
    },
    [editingImage, data, allSheets, currentSheet],
  );

  // 处理单个图片下载
  const processImageDownload = useCallback(
    async (
      dataUrl: string,
      _fileName: string,
      type: "original" | "tinypng",
      format: "png" | "webp",
    ): Promise<string> => {
      let processedUrl = dataUrl;

      // 转换格式（如果需要）
      if (format === "webp") {
        processedUrl = await convertImageFormat(dataUrl, "webp");
      }

      // 压缩（如果需要）
      if (type === "tinypng") {
        processedUrl = await compressImage(processedUrl, format);
      }

      return processedUrl;
    },
    [],
  );

  // 下载单个页面
  const onDownloadPage = useCallback(
    async (
      pageIndex: number,
      type: "original" | "tinypng",
      format: "png" | "webp",
    ) => {
      try {
        const page = data.pages[pageIndex];
        const dataUrl = await renderPageToDataURL(
          page,
          debouncedStyle,
          pixelRatio,
        );

        // 使用 page.region 作为文件名
        const regionName = page.region || `page-${pageIndex + 1}`;
        const sanitizedName = regionName.replace(/[<>:"/\\|?*]/g, "_");
        const ext = format === "webp" ? "webp" : "png";
        const fileName = `${sanitizedName}.${ext}`;

        // 生成或使用当前会话ID
        const sessionId = currentSessionId || Date.now().toString();
        if (!currentSessionId) {
          setCurrentSessionId(sessionId);
        }

        // 处理图片（原图和TinyPNG都添加到下载历史）
        if (type === "original") {
          // 原图：同步处理并下载
          const processedUrl = await processImageDownload(
            dataUrl,
            fileName,
            "original",
            format,
          );

          // 添加到下载历史
          const itemId = `${sessionId}-${Date.now()}-${pageIndex}`;
          const item: DownloadItem = {
            id: itemId,
            name: fileName,
            status: "ready",
            format: format,
            type: "original",
            timestamp: Date.now(),
            dataUrl: processedUrl,
          };

          setDownloadHistory((prev) => [...prev, item]);

          // 触发下载
          const a = document.createElement("a");

          a.href = processedUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          // TinyPNG：异步处理，添加到下载历史
          const itemId = `${sessionId}-${Date.now()}-${pageIndex}`;
          const item: DownloadItem = {
            id: itemId,
            name: fileName,
            status: "processing",
            format: format,
            type: "tinypng",
            timestamp: Date.now(),
          };

          setDownloadHistory((prev) => [...prev, item]);

          // 异步处理
          processImageDownload(dataUrl, fileName, "tinypng", format)
            .then((processedUrl) => {
              setDownloadHistory((prev) =>
                prev.map((i) =>
                  i.id === itemId
                    ? { ...i, status: "ready" as const, dataUrl: processedUrl }
                    : i,
                ),
              );
            })
            .catch((error) => {
              setDownloadHistory((prev) =>
                prev.map((i) =>
                  i.id === itemId
                    ? {
                        ...i,
                        status: "error" as const,
                        error: error.message || "处理失败",
                      }
                    : i,
                ),
              );
            });
        }
      } catch (e: any) {
        alert(`下载失败: ${e?.message ?? String(e)}`);
      }
    },
    [data, debouncedStyle, pixelRatio, processImageDownload, currentSessionId],
  );

  // 从下载历史下载
  const handleDownloadFromHistory = useCallback((item: DownloadItem) => {
    if (!item.dataUrl) return;

    const a = document.createElement("a");

    a.href = item.dataUrl;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // 清空下载历史
  const handleClearHistory = useCallback(() => {
    setDownloadHistory([]);
    setCurrentSessionId(null);
  }, []);

  const onExport = useCallback(async () => {
    setLoading(true);
    setExportPhase("render");
    setRenderCurr(0);
    setZipPercent(0);
    setWritePercent(0);

    // 生成新的会话ID
    const sessionId = Date.now().toString();
    setCurrentSessionId(sessionId);

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

      // 打包、写入和下载（批量导出只支持原图PNG）
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

  // 检查当前页面是否有表格且表格中是否有图片
  const hasTableWithImages = useMemo(() => {
    if (!data.pages || data.pages.length === 0) return false;

    for (const page of data.pages) {
      const sections = page.blocks
        ? page.blocks.flatMap((block) => block.sections || [])
        : page.sections || [];

      for (const section of sections) {
        if (section.table?.rows) {
          // 检查表格中是否有图片
          for (const row of section.table.rows) {
            for (const cell of row) {
              if (cell.is_image && cell.image) {
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  }, [data]);

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
            {uploadedDataFile ? (
              <div className="relative border-2 border-gray-200 rounded-lg p-4 bg-gray-50 min-h-[120px] flex items-center">
                <Button
                  isIconOnly
                  aria-label="删除文件"
                  className="absolute top-2 right-2"
                  color="danger"
                  size="sm"
                  variant="flat"
                  onPress={onDeleteDataFile}
                >
                  ✕
                </Button>
                <div className="flex items-center gap-3 pr-8 w-full">
                  <div className="text-4xl">
                    {uploadedDataFile.type === "xlsx" ? "📊" : "📄"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {uploadedDataFile.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {uploadedDataFile.type === "xlsx"
                        ? "Excel 表格"
                        : "JSON 文件"}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-h-[120px]">
                <DragDropZone
                  accept=".json,.xlsx,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  description="点击选择或拖拽文件到此处"
                  icon="📁"
                  label="选择 JSON 或 XLSX 文件"
                  loading={loading}
                  onFile={onPickDataFile}
                />
              </div>
            )}
            {error ? (
              <div className="text-xs text-red-600 mt-3">{error}</div>
            ) : null}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
            <h3 className="text-sm font-medium mb-4 text-gray-900">
              边框图 & 切片
            </h3>
            {uploadedBorderFile ? (
              <div className="relative border-2 border-gray-200 rounded-lg p-3 bg-gray-50 min-h-[120px] flex items-center">
                <Button
                  isIconOnly
                  aria-label="删除边框图"
                  className="absolute top-2 right-2 z-10"
                  color="danger"
                  size="sm"
                  variant="flat"
                  onPress={onDeleteBorderFile}
                >
                  ✕
                </Button>
                <div className="flex items-center gap-3 pr-8 w-full">
                  {style.border.image && (
                    <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden border border-gray-200">
                      <img
                        alt="边框图预览"
                        className="w-full h-full object-cover"
                        src={style.border.image}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {uploadedBorderFile}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">边框图片</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-h-[120px]">
                <DragDropZone
                  accept="image/*"
                  description="点击选择或拖拽图片到此处"
                  icon="🖼️"
                  label="选择边框图片"
                  loading={loading}
                  onFile={onPickBorder}
                />
              </div>
            )}
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

            {/* 大标题背景 */}
            <h3 className="text-sm font-semibold text-gray-700 mt-6 mb-3">
              大标题背景（TITLE-）
            </h3>
            {uploadedBlockTitleBg ? (
              <div className="relative border-2 border-gray-200 rounded-lg p-3 bg-gray-50 min-h-[120px] flex items-center">
                <Button
                  isIconOnly
                  aria-label="删除大标题背景"
                  className="absolute top-2 right-2 z-10"
                  color="danger"
                  size="sm"
                  variant="flat"
                  onPress={onDeleteBlockTitleBg}
                >
                  ✕
                </Button>
                <div className="flex items-center gap-3 pr-8 w-full">
                  {style.blockTitleBg && (
                    <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden border border-gray-200">
                      <img
                        alt="大标题背景预览"
                        className="w-full h-full object-cover"
                        src={style.blockTitleBg}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {uploadedBlockTitleBg}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">大标题背景图片</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-h-[120px]">
                <DragDropZone
                  accept="image/*"
                  description="点击选择或拖拽图片到此处"
                  icon="🎨"
                  label="选择大标题背景"
                  loading={loading}
                  onFile={onPickBlockTitleBg}
                />
              </div>
            )}

            {/* 小标题背景 */}
            <h3 className="text-sm font-semibold text-gray-700 mt-6 mb-3">
              小标题背景（RULES-/RANK-）
            </h3>
            {uploadedSectionTitleBg ? (
              <div className="relative border-2 border-gray-200 rounded-lg p-3 bg-gray-50 min-h-[120px] flex items-center">
                <Button
                  isIconOnly
                  aria-label="删除小标题背景"
                  className="absolute top-2 right-2 z-10"
                  color="danger"
                  size="sm"
                  variant="flat"
                  onPress={onDeleteSectionTitleBg}
                >
                  ✕
                </Button>
                <div className="flex items-center gap-3 pr-8 w-full">
                  {style.sectionTitleBg && (
                    <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden border border-gray-200">
                      <img
                        alt="小标题背景预览"
                        className="w-full h-full object-cover"
                        src={style.sectionTitleBg}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {uploadedSectionTitleBg}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">小标题背景图片</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-h-[120px]">
                <DragDropZone
                  accept="image/*"
                  description="点击选择或拖拽图片到此处"
                  icon="🎨"
                  label="选择小标题背景"
                  loading={loading}
                  onFile={onPickSectionTitleBg}
                />
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
            <h3 className="text-sm font-medium mb-4 text-gray-900">样式</h3>

            {/* 标题颜色 */}
            <div className="mb-6">
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
            <div className="mb-6">
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
            <div className="mb-6">
              <label htmlFor="pad-t" className="text-xs font-medium text-gray-700 block mb-2">
                内边距
              </label>
              <div className="grid grid-cols-4 gap-2">
                <Input
                  id="pad-t"
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

            {/* 字体大小 */}
            <div>
              <Slider
                label="基准字号"
                size="sm"
                step={2}
                minValue={24}
                maxValue={28}
                value={style.font.size}
                onChange={(value) => {
                  setStyle((s) => ({
                    ...s,
                    font: { ...s.font, size: value as number },
                  }));
                }}
                className="max-w-full"
                showTooltip={true}
                tooltipProps={{
                  placement: "top",
                  content: `${style.font.size}px`
                }}
              />
              <div className="text-xs text-gray-500 mt-2">
                可选值: 24px、26px、28px（其他文字大小将自动调整）
              </div>
            </div>
          </div>

          {/* 表格图片大小调整 */}
          {hasTableWithImages && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
              <h3 className="text-sm font-medium mb-4 text-gray-900">
                表格图片大小
              </h3>
              <Slider
                className="max-w-full"
                label="图片高度"
                maxValue={160}
                minValue={80}
                showTooltip={true}
                size="sm"
                step={10}
                tooltipProps={{
                  placement: "top",
                  content: `${tableImageSize}px`,
                }}
                value={tableImageSize}
                onChange={(value) => setTableImageSize(value as number)}
              />
              <div className="text-xs text-gray-500 mt-2">
                范围: 80-160px，当前: {tableImageSize}px
              </div>
            </div>
          )}
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

        {/* 横向和纵向滚动画布容器 - 使用 Intersection Observer 懒加载 */}
        <div
          className="force-scrollbar-visible"
          style={{
            flex: 1,
            backgroundColor: "#f9fafb",
            overflow: "auto",
            padding: 16,
            minHeight: 0, // 确保 flex 子元素可以缩小
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 16,
              width: "max-content",
              minHeight: "100%",
            }}
          >
            {data.pages.map((page, index) => (
              <CanvasCell
                key={`${currentSheet}-${index}`}
                estHeight={heights[index] || 1200}
                page={page}
                style={debouncedStyle}
                tableImageSize={tableImageSize}
                zoomPct={deferredZoom}
                onDownload={(type, format) => onDownloadPage(index, type, format)}
                onImageClick={(info) => handleImageClick(index, info)}
                onMeasured={onMeasuredByIndex(index)}
                onTextClick={(info) => handleTextClick(index, info)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 文字编辑弹窗 */}
      {editingText && (
        <TextEditModal
          isOpen={true}
          large={editingText.large}
          multiline={editingText.multiline}
          title={editingText.title}
          value={editingText.value}
          onClose={() => setEditingText(null)}
          onSave={handleTextSave}
        />
      )}

      {/* 图片上传弹窗 */}
      <ImageUploadModal
        currentImage={editingImage?.currentImage}
        isOpen={!!editingImage}
        onClose={() => setEditingImage(null)}
        onSave={handleImageSave}
      />

      {/* 下载历史组件 */}
      <DownloadHistory
        currentSessionId={currentSessionId}
        items={downloadHistory}
        onClear={handleClearHistory}
        onDownload={handleDownloadFromHistory}
      />
    </div>
  );
}
