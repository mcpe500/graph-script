import { MathRenderer } from './math-renderer';

export class BrowserMathRenderer implements MathRenderer {
  renderToSvgHtml(tex: string, display: boolean, fontSize: number, ex: number): string | null {
    const mj = getMathJaxGlobal();
    if (!mj?.tex2svg || !mj?.startup?.adaptor) return null;
    mj.texReset();
    const node = mj.tex2svg(tex, { display, em: fontSize, ex });
    return mj.startup.adaptor.outerHTML(node) as string;
  }

  async renderToSvgHtmlAsync(tex: string, display: boolean, fontSize: number, ex: number): Promise<string | null> {
    const mj = getMathJaxGlobal();
    if (!mj) return null;

    if (!mj.startup?.promise) {
      return this.renderToSvgHtml(tex, display, fontSize, ex);
    }

    try {
      await mj.startup.promise;
    } catch {
      return this.renderToSvgHtml(tex, display, fontSize, ex);
    }

    return this.renderToSvgHtml(tex, display, fontSize, ex);
  }
}

function getMathJaxGlobal(): any {
  if (typeof globalThis !== 'undefined') return (globalThis as any).MathJax;
  return null;
}
