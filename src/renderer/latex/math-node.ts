import { MathRenderer } from './math-renderer';
import { execFileSync } from 'child_process';
import { EX_RATIO } from './measure';

export class NodeMathRenderer implements MathRenderer {
  renderToSvgHtml(tex: string, display: boolean, fontSize: number, ex: number): string | null {
    try {
      return renderMathSvgWithChildProcess(tex, display, fontSize, ex);
    } catch {
      return null;
    }
  }

  async renderToSvgHtmlAsync(tex: string, display: boolean, fontSize: number, ex: number): Promise<string | null> {
    return this.renderToSvgHtml(tex, display, fontSize, ex);
  }
}

function renderMathSvgWithChildProcess(value: string, display: boolean, fontSize: number, ex: number): string {
  const payload = JSON.stringify({ value, display, fontSize, ex });
  const script = `
const payload = JSON.parse(process.env.GRAPHSCRIPT_MATHJAX_PAYLOAD || '{}');
const mj = require('@mathjax/src/bundle/node-main.cjs');
globalThis.MathJax = mj;
(async () => {
  const ready = await mj.init({ loader: { load: ['input/tex', 'output/svg'] } });
  const node = ready.tex2svg(payload.value, { display: payload.display, em: payload.fontSize, ex: payload.ex });
  const html = ready.startup.adaptor.outerHTML(node);
  process.stdout.write(html);
})().catch((error) => {
  process.stderr.write(String(error && error.message ? error.message : error));
  process.exit(1);
});
`;

  return execFileSync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    env: { ...process.env, GRAPHSCRIPT_MATHJAX_PAYLOAD: payload },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
