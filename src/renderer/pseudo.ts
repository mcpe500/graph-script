import { PseudoDeclaration } from '../ast/types';
import { escapeXml, svgDocument } from './common';

export function renderPseudoBlock(decl: PseudoDeclaration): string {
  const width = 860;
  const lineHeight = 22;
  const header = 54;
  const padding = 24;
  const lines = decl.lines.length ? decl.lines : ['// empty'];
  const height = header + padding + lines.length * lineHeight + 24;

  let body = '';
  body += `<rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="20" fill="#f8fafc" stroke="#cbd5e1"/>`;
  body += `<text x="32" y="46" font-size="22" font-weight="700" fill="#0f172a">${escapeXml(decl.name)}</text>`;
  body += `<line x1="32" y1="58" x2="${width - 32}" y2="58" stroke="#e2e8f0"/>`;
  lines.forEach((line, index) => {
    body += `<text x="40" y="${88 + index * lineHeight}" font-family="monospace" font-size="14" fill="#334155">${escapeXml(line)}</text>`;
  });
  return svgDocument(width, height, body);
}
