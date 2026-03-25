export type LatexMode = 'auto' | 'on' | 'off';

export const DEFAULT_FONT_FAMILY = 'DejaVu Sans, Arial, sans-serif';

export interface RichToken {
  type: 'text' | 'math';
  value: string;
  display: boolean;
}

export interface RichTextLineLayout {
  tokens: RichToken[];
  width: number;
  height: number;
  ascent: number;
}

export interface RichTextRenderOptions {
  x: number;
  y: number;
  maxWidth: number;
  fontSize?: number;
  color?: string;
  weight?: string;
  anchor?: 'start' | 'middle' | 'end';
  lineGap?: number;
  latex?: LatexMode;
  maxLines?: number;
  fontFamily?: string;
}

export interface RichTextBlockMetrics {
  width: number;
  height: number;
  lines: number;
  mathFallbackCount: number;
  normalizedValue: string;
}

export interface RichTextRenderResult extends RichTextBlockMetrics {
  svg: string;
}

export interface FormulaMeasureResult {
  width: number;
  height: number;
  ascent: number;
  fallback: boolean;
  normalizedValue: string;
}

export interface MathFragment {
  body: string;
  viewBox: string;
  width: number;
  height: number;
  ascent: number;
  fallback: boolean;
  normalizedValue: string;
}
