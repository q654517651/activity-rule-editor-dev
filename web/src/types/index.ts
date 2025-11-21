import type { Data } from "@/renderer/canvas/types";

import { SVGProps } from "react";

export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

// 导出进度类型定义
export type ExportPhase = "render" | "zip" | "write" | "done";

export type ExportProgress = {
  phase: ExportPhase;
  current: number; // 当前进度（渲染：第几页；ZIP/写入：百分比0-100；done：总页数）
  total: number; // 渲染：总页数；ZIP/写入：100或字节数；done：总页数
  detail?: string; // 可选：当前文件名等额外信息
};

// 多 Sheet 解析响应类型
export interface ParseResponse {
  ok: boolean;
  sheets: {
    [sheetName: string]: {
      result: Data;
      images: Record<string, string>;
    };
  };
  skipped_sheets?: string[];
  blob_store_size: number;
  error?: string;
}
