import { Group, Image as KImage } from "react-konva";

/**
 * Nine-Slice 缩放组件
 * 将图片分割为 9 块，角和边保持原始大小，中间拉伸填充
 */
export function NineSlice({
  x,
  y,
  w,
  h,
  bmp,
  slice,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  bmp: CanvasImageSource;
  slice: { t: number; r: number; b: number; l: number };
}) {
  // 参数校验，防止 NaN
  if (
    !bmp ||
    !isFinite(x) ||
    !isFinite(y) ||
    !isFinite(w) ||
    !isFinite(h) ||
    w <= 0 ||
    h <= 0
  ) {
    return null;
  }

  // 获取源图片尺寸
  const sw = (bmp as any).width || 0;
  const sh = (bmp as any).height || 0;

  if (sw <= 0 || sh <= 0) {
    return null;
  }

  // 边界切片尺寸（确保有效）
  const { t, r, b, l } = slice;
  const sliceT = isFinite(t) && t >= 0 ? t : 0;
  const sliceR = isFinite(r) && r >= 0 ? r : 0;
  const sliceB = isFinite(b) && b >= 0 ? b : 0;
  const sliceL = isFinite(l) && l >= 0 ? l : 0;

  // 中间部分尺寸（源图和目标图）
  const cw = Math.max(0, sw - sliceL - sliceR);
  const ch = Math.max(0, sh - sliceT - sliceB);
  const mw = Math.max(0, w - sliceL - sliceR);
  const mh = Math.max(0, h - sliceT - sliceB);

  // 添加微小的重叠（1px）来消除亚像素渲染导致的白线
  // 这在预览时缩放（50%、75%等）会特别明显，导出时使用整数倍缩放则不明显
  const overlap = 1;

  return (
    <Group x={x} y={y}>
      {/* 四个角 - 添加重叠 */}
      <KImage
        crop={{ x: 0, y: 0, width: sliceL, height: sliceT }}
        height={sliceT + overlap}
        image={bmp as any}
        width={sliceL + overlap}
        x={0}
        y={0}
      />
      <KImage
        crop={{ x: sw - sliceR, y: 0, width: sliceR, height: sliceT }}
        height={sliceT + overlap}
        image={bmp as any}
        width={sliceR + overlap}
        x={w - sliceR - overlap}
        y={0}
      />
      <KImage
        crop={{ x: 0, y: sh - sliceB, width: sliceL, height: sliceB }}
        height={sliceB + overlap}
        image={bmp as any}
        width={sliceL + overlap}
        x={0}
        y={h - sliceB - overlap}
      />
      <KImage
        crop={{ x: sw - sliceR, y: sh - sliceB, width: sliceR, height: sliceB }}
        height={sliceB + overlap}
        image={bmp as any}
        width={sliceR + overlap}
        x={w - sliceR - overlap}
        y={h - sliceB - overlap}
      />

      {/* 四条边 - 添加重叠 */}
      <KImage
        crop={{ x: sliceL, y: 0, width: cw, height: sliceT }}
        height={sliceT + overlap}
        image={bmp as any}
        width={mw + overlap * 2}
        x={sliceL - overlap}
        y={0}
      />
      <KImage
        crop={{ x: sliceL, y: sh - sliceB, width: cw, height: sliceB }}
        height={sliceB + overlap}
        image={bmp as any}
        width={mw + overlap * 2}
        x={sliceL - overlap}
        y={h - sliceB - overlap}
      />
      <KImage
        crop={{ x: 0, y: sliceT, width: sliceL, height: ch }}
        height={mh + overlap * 2}
        image={bmp as any}
        width={sliceL + overlap}
        x={0}
        y={sliceT - overlap}
      />
      <KImage
        crop={{ x: sw - sliceR, y: sliceT, width: sliceR, height: ch }}
        height={mh + overlap * 2}
        image={bmp as any}
        width={sliceR + overlap}
        x={w - sliceR - overlap}
        y={sliceT - overlap}
      />

      {/* 中间填充 - 添加重叠 */}
      <KImage
        crop={{ x: sliceL, y: sliceT, width: cw, height: ch }}
        height={mh + overlap * 2}
        image={bmp as any}
        width={mw + overlap * 2}
        x={sliceL - overlap}
        y={sliceT - overlap}
      />
    </Group>
  );
}
