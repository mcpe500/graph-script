import { ErdDeclaration } from '../ast/types';
import { escapeXml, round, svgDocument } from './common';

export function renderErd(decl: ErdDeclaration): string {
  const tableWidth = 240;
  const fieldHeight = 26;
  const gap = 80;
  const padding = 48;
  const rows = Math.ceil(Math.sqrt(Math.max(decl.tables.length, 1)));
  const cols = Math.ceil(Math.max(decl.tables.length, 1) / rows);
  const width = Math.max(900, padding * 2 + cols * tableWidth + (cols - 1) * gap);
  const height = Math.max(600, padding * 2 + rows * 220);

  const positions = new Map<string, { x: number; y: number; w: number; h: number }>();
  decl.tables.forEach((table, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = padding + col * (tableWidth + gap);
    const h = 54 + table.fields.length * fieldHeight;
    const y = padding + 36 + row * 240;
    positions.set(table.name, { x, y, w: tableWidth, h });
  });

  let body = '';
  body += `<text x="${width / 2}" y="42" text-anchor="middle" font-size="28" font-weight="800" fill="#0f172a">${escapeXml(decl.name)}</text>`;

  decl.relationships.forEach((relationship, index) => {
    const fromTable = relationship.from.split('.')[0];
    const toTable = relationship.to.split('.')[0];
    const a = positions.get(fromTable);
    const b = positions.get(toTable);
    if (!a || !b) return;
    const startX = a.x + a.w;
    const startY = a.y + a.h / 2 + index * 2;
    const endX = b.x;
    const endY = b.y + b.h / 2 - index * 2;
    const midX = (startX + endX) / 2;
    body += `<defs><marker id="erd-arrow-${index}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker></defs>`;
    body += `<path d="M ${round(startX)} ${round(startY)} C ${round(midX)} ${round(startY)}, ${round(midX)} ${round(endY)}, ${round(endX)} ${round(endY)}" fill="none" stroke="#64748b" stroke-width="2" marker-end="url(#erd-arrow-${index})"/>`;
    body += `<text x="${round(midX)}" y="${round((startY + endY) / 2 - 8)}" text-anchor="middle" font-size="11" fill="#475569">${escapeXml(relationship.cardinality)}</text>`;
  });

  decl.tables.forEach((table) => {
    const pos = positions.get(table.name);
    if (!pos) return;
    body += `<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" rx="16" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5"/>`;
    body += `<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="40" rx="16" fill="#1d4ed8"/>`;
    body += `<rect x="${pos.x}" y="${pos.y + 22}" width="${pos.w}" height="18" fill="#1d4ed8"/>`;
    body += `<text x="${pos.x + pos.w / 2}" y="${pos.y + 26}" text-anchor="middle" font-size="16" font-weight="700" fill="#ffffff">${escapeXml(table.name)}</text>`;
    table.fields.forEach((field, index) => {
      const y = pos.y + 56 + index * fieldHeight;
      if (index % 2 === 0) body += `<rect x="${pos.x + 1}" y="${y - 16}" width="${pos.w - 2}" height="${fieldHeight}" fill="#f8fafc"/>`;
      const constraintText = field.constraints.length ? ` [${field.constraints.join(', ')}]` : '';
      body += `<text x="${pos.x + 14}" y="${y}" font-size="12" font-weight="600" fill="#0f172a">${escapeXml(field.name)}</text>`;
      body += `<text x="${pos.x + pos.w - 14}" y="${y}" text-anchor="end" font-size="12" fill="#475569">${escapeXml(field.fieldType + constraintText)}</text>`;
    });
  });

  return svgDocument(width, height, body, '#f8fafc');
}
