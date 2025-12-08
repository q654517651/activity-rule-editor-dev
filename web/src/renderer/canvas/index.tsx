import type { Data, StyleCfg, Page } from "./types";
import type { ExportProgress } from "@/types";

import { useEffect, useRef, useState, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { Stage, Layer } from "react-konva";

import { PageCanvas } from "./PageCanvas";

function OffscreenExporter({
  page,
  style,
  pixelRatio,
  knownHeight,
  tableImageSize,
  onDone,
}: {
  page: Page;
  style: StyleCfg;
  pixelRatio: number;
  knownHeight?: number;
  tableImageSize?: number;
  onDone: (dataUrl: string) => void;
}) {
  const stageRef = useRef<any>(null);
  const [h, setH] = useState(knownHeight || 2400);
  const [measured, setMeasured] = useState(!!knownHeight); // 如果有已知高度，标记为已测量

  const handleMeasured = useCallback((measuredH: number) => {
    setH(measuredH);
    setMeasured(true); // 标记测量完成
  }, []);

  useEffect(() => {
    if (!measured) return; // 等待测量完成

    // 等待几帧确保所有内容都已渲染完成，然后导出
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          try {
            const dataUrl = stageRef.current?.toDataURL({ pixelRatio }) || "";

            onDone(dataUrl);
          } catch (e) {
            console.error("导出失败:", e);
            onDone("");
          }
        }),
      ),
    );

    return () => cancelAnimationFrame(id);
  }, [measured, pixelRatio, onDone]); // 依赖 measured

  return (
    <Stage ref={stageRef} height={h} width={style.pageWidth}>
      <Layer>
        <PageCanvas 
          forExport 
          page={page} 
          style={style}
          tableImageSize={tableImageSize}
          onMeasured={knownHeight ? undefined : handleMeasured}
        />
      </Layer>
    </Stage>
  );
}

export async function renderPageToDataURL(
  page: Page,
  style: StyleCfg,
  pixelRatio = 2,
  knownHeight?: number,
  tableImageSize?: number,
): Promise<string> {
  const container = document.createElement("div");
  const root = ReactDOM.createRoot(container);

  return await new Promise<string>((resolve) => {
    const handleDone = (dataUrl: string) => resolve(dataUrl);

    root.render(
      <OffscreenExporter
        page={page}
        pixelRatio={pixelRatio}
        style={style}
        knownHeight={knownHeight}
        tableImageSize={tableImageSize}
        onDone={handleDone}
      />,
    );
  }).finally(() => {
    try {
      (root as any).unmount?.();
    } catch {}
  });
}

export async function exportPagesToPng(
  data: Data,
  style: StyleCfg,
  pixelRatio = 2,
  knownHeights?: number[],
  tableImageSize?: number,
  onProgress?: (progress: ExportProgress) => void,
) {
  const out: Array<{ name: string; dataUrl: string }> = [];
  const total = (data.pages || []).length;

  for (let i = 0; i < total; i++) {
    const page = data.pages[i];
    const knownHeight = knownHeights?.[i];
    const dataUrl = await renderPageToDataURL(page, style, pixelRatio, knownHeight, tableImageSize);

    // 使用 page.region 作为文件名，与单张下载保持一致
    const regionName = page.region || `page-${i + 1}`;
    const sanitizedName = regionName.replace(/[<>:"/\\|?*]/g, "_");
    const fileName = `${sanitizedName}.png`;

    out.push({ name: fileName, dataUrl });

    // 发送阶段化进度回调（render 阶段）
    if (onProgress) {
      onProgress({
        phase: "render",
        current: i + 1,
        total,
        detail: `渲染第 ${i + 1} 页`,
      });
    }
  }

  return out;
}
