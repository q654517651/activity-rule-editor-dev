import type { Data, StyleCfg, Page } from "./types";
import type { ExportProgress } from "@/types";

import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { Stage, Layer } from "react-konva";

import { PageCanvas } from "./PageCanvas";

function OffscreenExporter({
  page,
  style,
  pixelRatio,
  onDone,
}: {
  page: Page;
  style: StyleCfg;
  pixelRatio: number;
  onDone: (dataUrl: string) => void;
}) {
  const stageRef = useRef<any>(null);
  const [h, setH] = useState(2400);

  useEffect(() => {
    // 等待几帧确保所有内容都已渲染完成，然后直接导出
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
  }, []); // 空依赖，只执行一次

  return (
    <Stage ref={stageRef} height={h} width={style.pageWidth}>
      <Layer>
        <PageCanvas forExport page={page} style={style} onMeasured={setH} />
      </Layer>
    </Stage>
  );
}

export async function renderPageToDataURL(
  page: Page,
  style: StyleCfg,
  pixelRatio = 2,
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
  onProgress?: (progress: ExportProgress) => void,
) {
  const out: Array<{ name: string; dataUrl: string }> = [];
  const total = (data.pages || []).length;

  for (let i = 0; i < total; i++) {
    const page = data.pages[i];
    const dataUrl = await renderPageToDataURL(page, style, pixelRatio);

    out.push({ name: `page-${i + 1}.png`, dataUrl });

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
