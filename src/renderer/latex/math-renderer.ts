export interface MathRenderer {
  renderToSvgHtml(tex: string, display: boolean, fontSize: number, ex: number): string | null;
  renderToSvgHtmlAsync(tex: string, display: boolean, fontSize: number, ex: number): Promise<string | null>;
}
