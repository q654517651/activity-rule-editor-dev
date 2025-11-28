export type ImageMeta = {
  id?: string; // 内容哈希（如 sha256:xxx）
  url: string; // 可访问的 URL（/media/xxx.png）
  w?: number; // 原始宽度
  h?: number; // 原始高度
  mime?: string; // MIME 类型（image/png 等）
};

// 文本片段（对应一个 Excel 单元格或合并单元格）
export type TextRun = {
  text: string; // 文本内容
  bold?: boolean; // 加粗
  italic?: boolean; // 斜体
  color?: string; // 文字颜色（如 "#FF0000"）
};

// 段落（对应 Excel 的一行）
export type Paragraph = {
  align?: "left" | "center" | "right"; // 对齐方式
  runs: TextRun[]; // 文本片段数组（通常每行一个单元格对应一个 run）
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
  rowspan?: number; // 跨行数（默认为 1）
  colspan?: number; // 跨列数（默认为 1）
  bold?: boolean; // 是否加粗
  center?: boolean; // 是否居中
};

// 表格数据结构
export type TableData = {
  type: "table";
  rows: TableCell[][]; // 表格行（每行包含多个单元格），没有表头的概念
};

export type Section = {
  title?: string;
  content?: string; // 旧格式（向后兼容）
  paragraphs?: Paragraph[]; // 新格式：结构化段落数组
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
  blockTitleBg?: string; // 大标题背景（TITLE-）
  sectionTitleBg?: string; // 小标题背景（RULES-/RANK-）
  font: {
    family: string;
    size: number;
    lineHeight: number; // like 1.6
  };
};
