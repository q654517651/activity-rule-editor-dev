export type ImageMeta = {
  id?: string; // 内容哈希（如 sha256:xxx）
  url: string; // 可访问的 URL（/media/xxx.png）
  w?: number; // 原始宽度
  h?: number; // 原始高度
  mime?: string; // MIME 类型（image/png 等）
};

export type Reward = {
  name?: string;
  image?: string | ImageMeta; // 支持向后兼容：字符串或新的元数据对象
  desc?: string;
};

// 表格单元格数据
export type TableCell = {
  value: string; // 单元格内容（文字或图片标识）
  is_image: boolean; // 是否为图片
  image?: ImageMeta; // 如果是图片，包含图片元数据
};

// 表格数据结构
export type TableData = {
  type: "table";
  headers: string[]; // 表头（文字）
  rows: TableCell[][]; // 数据行（每行包含多个单元格）
};

export type Section = {
  title?: string;
  content?: string;
  rewards?: Reward[];
  table?: TableData; // 新增：表格数据
  // 展平后保留的 block 元数据
  _blockType?: "rules" | "rewards"; // 块类型
  _blockTitle?: string; // 块标题
  _isFirstInBlock?: boolean; // 是否为 block 的第一个 section
};

// 新增：按 TITLE 分组的块结构
export type Block = {
  block_title: string; // TITLE- 右侧的标题文本
  block_type: "rules" | "rewards"; // 块类型
  sections: Section[]; // 该块下的所有分段
};

// Page 同时支持新旧结构
export type Page = {
  region?: string;
  blocks?: Block[]; // 新结构：块数组
  sections?: Section[]; // 旧结构：分段数组（向后兼容）
  direction?: "rtl" | "ltr"; // 文本方向，支持 RTL（阿拉伯语等）和 LTR（默认）
};

export type Data = { pages: Page[] };

export type StyleCfg = {
  pageWidth: number; // e.g. 750
  pad: { t: number; r: number; b: number; l: number };
  titleColor: string;
  contentColor: string;
  border: {
    image?: string; // data/http/file
    slice: { t: number; r: number; b: number; l: number };
  };
  font: {
    family: string;
    size: number;
    lineHeight: number; // like 1.6
  };
};
