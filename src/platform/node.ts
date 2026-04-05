import * as fs from 'fs';
import * as path from 'path';
import { Platform } from './interface';

export class NodePlatform implements Platform {
  readFile(p: string): Promise<string | null> {
    return fs.promises.readFile(p, 'utf-8').catch(() => null);
  }

  readFileSync(p: string): string | null {
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, 'utf-8');
  }

  fileExists(p: string): boolean {
    return fs.existsSync(p);
  }

  resolvePath(base: string, relative: string): string {
    return path.resolve(base, relative);
  }

  joinPath(...segments: string[]): string {
    return path.join(...segments);
  }

  dirname(p: string): string {
    return path.dirname(p);
  }

  extname(p: string): string {
    return path.extname(p);
  }

  basename(p: string, ext?: string): string {
    return path.basename(p, ext);
  }

  readFileSyncBuffer(p: string): Buffer | null {
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p);
  }

  ensureDir(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  writeFile(filePath: string, content: string): void {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}
