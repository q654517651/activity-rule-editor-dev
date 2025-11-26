/**
 * 将 data URL 转换为指定格式
 */
export async function convertImageFormat(
  dataUrl: string,
  format: "png" | "webp",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法获取 canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const mimeType = format === "webp" ? "image/webp" : "image/png";
      const quality = format === "webp" ? 0.9 : undefined;
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("转换失败"));
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        mimeType,
        quality,
      );
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * 调用后端压缩API
 */
export async function compressImage(
  dataUrl: string,
  format: "png" | "webp",
): Promise<string> {
  const API_BASE = import.meta.env.VITE_API_BASE || "";
  const response = await fetch(`${API_BASE}/api/compress`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      image_data: dataUrl,
      format: format,
    }),
  });

  if (!response.ok) {
    throw new Error(`压缩失败: ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "压缩失败");
  }

  return result.data;
}

