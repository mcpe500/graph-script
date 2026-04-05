import { getPlatform } from '../../platform/global';
import { GSValue } from '../../runtime/values';
import { escapeXml, resolveValue } from '../common';

export function loadImageHref(srcValue: unknown, assetBaseDir: string): string {
  const platform = getPlatform();
  const source = resolveImageSource(srcValue);
  if (!source) throw new Error('Image element requires a valid src');
  const absolutePath = platform.fileExists(source.path) ? source.path : platform.resolvePath(assetBaseDir, source.path);
  if (!platform.fileExists(absolutePath)) throw new Error(`Image asset not found: ${absolutePath}`);

  const ext = (source.format || platform.extname(absolutePath).slice(1)).toLowerCase();
  const mime = ext === 'png'
    ? 'image/png'
    : ext === 'svg'
      ? 'image/svg+xml'
      : null;
  if (!mime) throw new Error(`Unsupported image asset format: ${absolutePath}`);

  const raw = platform.readFileSync(absolutePath);
  if (raw && raw.startsWith('data:')) return raw;

  if (raw === null) throw new Error(`Cannot read image asset: ${absolutePath}`);

  if (typeof btoa !== 'undefined') {
    return `data:${mime};base64,${btoa(raw)}`;
  }
  return `data:${mime};base64,${raw}`;
}

export function resolveImageSource(srcValue: unknown): { path: string; format: string } | null {
  const platform = getPlatform();
  if (typeof srcValue === 'string' && srcValue.trim()) {
    return { path: srcValue, format: platform.extname(srcValue).slice(1).toLowerCase() };
  }
  if (srcValue && typeof srcValue === 'object') {
    const candidate = srcValue as Record<string, unknown>;
    if (candidate.type === 'imageAsset' && typeof candidate.path === 'string') {
      const format = typeof candidate.format === 'string' && candidate.format
        ? candidate.format.toLowerCase()
        : platform.extname(candidate.path).slice(1).toLowerCase();
      return { path: candidate.path, format };
    }
  }
  return null;
}

export function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-');
}
