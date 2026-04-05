export interface Platform {
  readFile(path: string): Promise<string | null>;
  readFileSync(path: string): string | null;
  fileExists(path: string): boolean;
  resolvePath(base: string, relative: string): string;
  joinPath(...segments: string[]): string;
  dirname(path: string): string;
  extname(path: string): string;
  basename(path: string, ext?: string): string;
}
