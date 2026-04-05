const DEFAULT_CDN = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';

export async function loadMathJax(cdnUrl?: string): Promise<void> {
  if (typeof globalThis !== 'undefined' && (globalThis as any).MathJax) return;

  if (typeof document === 'undefined') {
    throw new Error('loadMathJax() can only be used in a browser environment');
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = cdnUrl || DEFAULT_CDN;
    script.async = true;
    script.onload = () => {
      const mj = (globalThis as any).MathJax;
      if (mj?.startup?.promise) {
        mj.startup.promise.then(() => resolve()).catch(reject);
      } else {
        resolve();
      }
    };
    script.onerror = () => reject(new Error(`Failed to load MathJax from ${cdnUrl || DEFAULT_CDN}`));
    document.head.appendChild(script);
  });
}
