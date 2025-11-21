/**
 * Konva Text 组件的类型扩展
 * 添加 direction 属性支持（RTL 语言支持）
 */

import "konva";

declare module "konva/lib/shapes/Text" {
  interface TextConfig {
    /**
     * 文本方向，用于支持 RTL 语言（如阿拉伯语、希伯来语）
     * @default 'inherit'
     */
    direction?: "ltr" | "rtl" | "inherit";
  }
}

// 扩展 react-konva 的 Text 组件属性
declare module "react-konva" {
  interface TextConfig {
    /**
     * 文本方向，用于支持 RTL 语言（如阿拉伯语、希伯来语）
     * @default 'inherit'
     */
    direction?: "ltr" | "rtl" | "inherit";
  }
}
