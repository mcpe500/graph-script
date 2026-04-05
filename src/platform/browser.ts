import { Platform } from './interface';

export class BrowserPlatform implements Platform {
  private fs = new Map<string, string>();

  registerFile(virtualPath: string, content: string): void {
    this.fs.set(virtualPath, content);
  }

  readFile(virtualPath: string): Promise<string | null> {
    return Promise.resolve(this.fs.get(virtualPath) ?? null);
  }

  readFileSync(virtualPath: string): string | null {
    return this.fs.get(virtualPath) ?? null;
  }

  fileExists(virtualPath: string): boolean {
    return this.fs.has(virtualPath);
  }

  resolvePath(base: string, relative: string): string {
    try {
      if (typeof URL !== 'undefined') {
        return new URL(relative, base).pathname;
      }
    } catch { /* fallthrough */ }
    const parts = base.split('/').slice(0, -1);
    const relParts = relative.split('/');
    for (const part of relParts) {
      if (part === '..') parts.pop();
      else if (part !== '.') parts.push(part);
    }
    return parts.join('/');
  }

  joinPath(...segments: string[]): string {
    let result = segments[0] || '';
    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) continue;
      if (result.endsWith('/')) result = result.slice(0, -1);
      if (!seg.startsWith('/')) result += '/';
      result += seg;
    }
    return result.replace(/\/+/g, '/');
  }

  dirname(p: string): string {
    const idx = p.lastIndexOf('/');
    return idx >= 0 ? p.substring(0, idx) || '.' : '.';
  }

  extname(p: string): string {
    const base = this.basename(p);
    const dot = base.lastIndexOf('.');
    return dot >= 0 ? base.slice(dot) : '';
  }

  basename(p: string, ext?: string): string {
    const idx = p.lastIndexOf('/');
    let base = idx >= 0 ? p.substring(idx + 1) : p;
    if (ext && base.endsWith(ext)) base = base.slice(0, -ext.length);
    return base;
  }
}
