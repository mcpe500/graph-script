import { PageDeclaration } from '../ast/types';
import { GSValue, Trace } from '../runtime/values';
import { escapeXml, extractSvgDocument, fitIntoBox, readNumber, readString, resolveValue, round, svgDocument } from './common';

interface RenderEmbed {
  (target: string): string | null;
}

export function renderPage(decl: PageDeclaration, values: Record<string, GSValue>, traces: Map<string, Trace>, renderEmbed: RenderEmbed): string {
  const width = readNumber(resolveValue(decl.properties.width, values, traces), 1440);
  const height = readNumber(resolveValue(decl.properties.height, values, traces), 900);
  const columns = Math.max(1, readNumber(resolveValue(decl.properties.columns, values, traces), 2));
  const rows = Math.max(1, readNumber(resolveValue(decl.properties.rows, values, traces), Math.max(1, Math.ceil(decl.placements.length / Math.max(columns, 1)))));
  const gap = Math.max(0, readNumber(resolveValue(decl.properties.gap, values, traces), 24));
  const margin = Math.max(24, readNumber(resolveValue(decl.properties.margin, values, traces), 32));
  const title = readString(resolveValue(decl.properties.title, values, traces), decl.name);
  const subtitle = readString(resolveValue(decl.properties.subtitle, values, traces), '');

  const topOffset = subtitle ? 108 : 84;
  const cellWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
  const cellHeight = (height - topOffset - margin - gap * (rows - 1)) / rows;

  let body = '';
  body += `<text x="${width / 2}" y="42" text-anchor="middle" font-size="30" font-weight="800" fill="#0f172a">${escapeXml(title)}</text>`;
  if (subtitle) body += `<text x="${width / 2}" y="68" text-anchor="middle" font-size="15" fill="#64748b">${escapeXml(subtitle)}</text>`;

  decl.placements.forEach((placement, index) => {
    const match = placement.position.match(/cell\((\d+)\s*,\s*(\d+)\)/);
    const row = match ? Number(match[1]) - 1 : Math.floor(index / columns);
    const col = match ? Number(match[2]) - 1 : index % columns;
    const x = margin + col * (cellWidth + gap);
    const y = topOffset + row * (cellHeight + gap);
    body += `<rect x="${round(x)}" y="${round(y)}" width="${round(cellWidth)}" height="${round(cellHeight)}" rx="20" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.2"/>`;
    const embedded = renderEmbed(placement.target);
    if (!embedded) {
      body += `<text x="${round(x + cellWidth / 2)}" y="${round(y + cellHeight / 2)}" text-anchor="middle" font-size="14" fill="#475569">Missing: ${escapeXml(placement.target)}</text>`;
      return;
    }
    const doc = extractSvgDocument(embedded);
    const fit = fitIntoBox(doc.width, doc.height, cellWidth - 24, cellHeight - 24);
    body += `<g transform="translate(${round(x + 12 + fit.dx)}, ${round(y + 12 + fit.dy)}) scale(${round(fit.scale, 4)})">${doc.svg}</g>`;
  });

  return svgDocument(width, height, body, '#f8fafc');
}
