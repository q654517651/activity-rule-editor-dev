import type { ExportProgress } from "@/types";

import JSZip from "jszip";

/**
 * 按块写入 Blob 并报告写入进度
 */
async function writeBlobByChunks(
  blob: Blob,
  writable: any,
  onProgress?: (progress: ExportProgress) => void,
): Promise<void> {
  const reader = blob.stream().getReader();
  let written = 0;
  const total = blob.size;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      await writable.write(value);
      written += value.length;

      // 报告写入进度
      onProgress?.({
        phase: "write",
        current: written,
        total,
      });
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 使用 File System Access API 弹出保存对话框
 * 关键：先拿句柄（在用户手势中），再生成和写入
 */
async function savePngsWithFileSystemAccess(
  items: Array<{ name: string; dataUrl: string }>,
  onZipProgress?: (progress: ExportProgress) => void,
): Promise<boolean> {
  try {
    // @ts-ignore
    const showSaveFilePicker = (window as any).showSaveFilePicker;

    if (!showSaveFilePicker) return false;

    // 1️⃣ 尽早弹窗（在用户手势中），拿到保存句柄
    const handle = await showSaveFilePicker({
      suggestedName: "export.zip",
      types: [{ description: "ZIP", accept: { "application/zip": [".zip"] } }],
    });

    const writable = await handle.createWritable();

    // 2️⃣ 现在开始生成 ZIP（用户已选好位置）
    const zip = new JSZip();

    for (const it of items) {
      const b64 = it.dataUrl.split(",")[1] || "";

      zip.file(it.name, b64, { base64: true });
    }

    // 报告压缩开始
    onZipProgress?.({
      phase: "zip",
      current: 0,
      total: 100,
    });

    // 3️⃣ 生成 Blob 并捕获压缩进度
    const blob = await zip.generateAsync(
      {
        type: "blob",
        compression: "STORE",
      },
      (metadata: any) => {
        onZipProgress?.({
          phase: "zip",
          current: Math.round(metadata.percent || 0),
          total: 100,
        });
      },
    );

    // 4️⃣ 按块写入并报告写入进度
    await writeBlobByChunks(blob, writable, onZipProgress);

    // 关闭写入流
    await writable.close();

    // 5️⃣ 标记完成
    onZipProgress?.({
      phase: "done",
      current: items.length,
      total: items.length,
    });

    return true;
  } catch (error: any) {
    // 用户取消
    if (error?.name === "AbortError") {
      return false;
    }
    // 其它错误则回退
    throw error;
  }
}

/**
 * 兼容性回退：传统 Blob URL 下载
 */
async function savePngsWithLegacyBlobUrl(
  items: Array<{ name: string; dataUrl: string }>,
  onZipProgress?: (progress: ExportProgress) => void,
): Promise<void> {
  const zip = new JSZip();

  for (const it of items) {
    const b64 = it.dataUrl.split(",")[1] || "";

    zip.file(it.name, b64, { base64: true });
  }

  // 报告压缩开始
  onZipProgress?.({
    phase: "zip",
    current: 0,
    total: 100,
  });

  // 生成 Blob 并捕获压缩进度
  const blob = await zip.generateAsync(
    {
      type: "blob",
      compression: "STORE",
    },
    (metadata: any) => {
      onZipProgress?.({
        phase: "zip",
        current: Math.round(metadata.percent || 0),
        total: 100,
      });
    },
  );

  // 触发下载（Blob URL 方式下没有逐块写入进度）
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);

  a.href = url;
  a.download = "export.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // 在下一帧释放 URL（给浏览器足够时间启动下载）
  requestAnimationFrame(() => {
    URL.revokeObjectURL(url);
  });

  // 标记完成
  requestAnimationFrame(() => {
    onZipProgress?.({
      phase: "done",
      current: items.length,
      total: items.length,
    });
  });
}

/**
 * 清理文件/文件夹名称中的非法字符
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_");
}

/**
 * 多 Sheet 导出：每个 sheet 一个文件夹
 */
export async function savePngsMultiSheet(
  allExports: Array<{
    sheetName: string;
    items: Array<{ name: string; dataUrl: string }>;
  }>,
  onZipProgress?: (progress: ExportProgress) => void,
) {
  const totalItems = allExports.reduce((sum, exp) => sum + exp.items.length, 0);

  // 生成 ZIP 结构
  const zip = new JSZip();

  for (const { sheetName, items } of allExports) {
    const folder = zip.folder(sanitizeFileName(sheetName));

    if (!folder) continue;

    for (const item of items) {
      const b64 = item.dataUrl.split(",")[1] || "";

      folder.file(item.name, b64, { base64: true });
    }
  }

  // 报告压缩开始
  onZipProgress?.({
    phase: "zip",
    current: 0,
    total: 100,
  });

  // 生成 Blob
  const blob = await zip.generateAsync(
    {
      type: "blob",
      compression: "STORE",
    },
    (metadata: any) => {
      onZipProgress?.({
        phase: "zip",
        current: Math.round(metadata.percent || 0),
        total: 100,
      });
    },
  );

  // 尝试使用 File System Access API
  try {
    // @ts-ignore
    const showSaveFilePicker = (window as any).showSaveFilePicker;

    if (showSaveFilePicker) {
      const handle = await showSaveFilePicker({
        suggestedName: "export-multi-sheets.zip",
        types: [
          { description: "ZIP", accept: { "application/zip": [".zip"] } },
        ],
      });

      const writable = await handle.createWritable();

      await writeBlobByChunks(blob, writable, onZipProgress);
      await writable.close();

      onZipProgress?.({
        phase: "done",
        current: totalItems,
        total: totalItems,
      });

      return { ok: true };
    }
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return { ok: false, error: "用户已取消" };
    }
    console.warn("File System Access API 失败，回退到 Blob URL:", error);
  }

  // 回退到传统下载
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);

  a.href = url;
  a.download = "export-multi-sheets.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  requestAnimationFrame(() => {
    URL.revokeObjectURL(url);
  });

  requestAnimationFrame(() => {
    onZipProgress?.({
      phase: "done",
      current: totalItems,
      total: totalItems,
    });
  });

  return { ok: true };
}

export async function savePngs(
  items: Array<{ name: string; dataUrl: string }>,
  onZipProgress?: (progress: ExportProgress) => void,
) {
  // Browser: 优先尝试 File System Access API
  try {
    const success = await savePngsWithFileSystemAccess(items, onZipProgress);

    if (success) {
      return { ok: true };
    }
  } catch (error: any) {
    if (error?.name === "AbortError") {
      // 用户取消了保存对话框
      return { ok: false, error: "用户已取消" };
    }
    // 其它错误继续回退
    console.warn("File System Access API 失败，回退到 Blob URL:", error);
  }

  // 回退到传统方案
  await savePngsWithLegacyBlobUrl(items, onZipProgress);

  return { ok: true };
}
