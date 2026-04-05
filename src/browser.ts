import { BrowserPlatform } from './platform/browser';
import { setPlatform } from './platform/global';
import { BrowserMathRenderer } from './renderer/latex/math-browser';
import { setMathRenderer } from './renderer/latex/math-svg';
import { Parser } from './parser';
import { Evaluator } from './runtime';
import { Renderer, RenderOptions, RenderResult } from './renderer';

export { loadMathJax } from './browser/load-mathjax';

export interface GraphScriptOptions {
  mathJaxCdn?: string;
  baseDir?: string;
  renderOptions?: RenderOptions;
}

export class GraphScript {
  private platform: BrowserPlatform;
  private renderer: Renderer;

  constructor(options?: GraphScriptOptions) {
    this.platform = new BrowserPlatform();
    setPlatform(this.platform);
    setMathRenderer(new BrowserMathRenderer());
    this.renderer = new Renderer(options?.renderOptions);
  }

  async loadMathJax(cdnUrl?: string): Promise<void> {
    const { loadMathJax } = await import('./browser/load-mathjax');
    return loadMathJax(cdnUrl);
  }

  registerFile(virtualPath: string, content: string): void {
    this.platform.registerFile(virtualPath, content);
  }

  parse(source: string) {
    return new Parser().parse(source);
  }

  evaluate(program: any): { values: Record<string, any>; traces: Map<string, any> } {
    const evaluator = new Evaluator();
    const values = evaluator.execute(program);
    return { values, traces: evaluator.getTraces() };
  }

  async render(source: string, options?: RenderOptions): Promise<RenderResult[]> {
    const program = this.parse(source);
    const { values, traces } = this.evaluate(program);
    return this.renderer.renderToString(values, traces, options);
  }
}
