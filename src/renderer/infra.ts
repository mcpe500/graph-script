import { InfraDeclaration, InfraElement } from '../ast/types';
import { GSValue, Trace } from '../runtime/values';
import { escapeXml, readNumber, readString, resolveValue, round, svgDocument } from './common';

export function renderInfra(decl: InfraDeclaration, values: Record<string, GSValue>, traces: Map<string, Trace>): string {
  const width = readNumber(resolveValue(decl.properties.width, values, traces), 1100);
  const height = readNumber(resolveValue(decl.properties.height, values, traces), 700);
  const auto = autoLayout(decl.elements, width, height);
  const positions = new Map<string, { x: number; y: number; w: number; h: number; type: string; label: string }>();

  decl.elements.forEach((element, index) => {
    const fallback = auto[index];
    const x = readNumber(resolveValue(element.properties.x, values, traces), fallback.x);
    const y = readNumber(resolveValue(element.properties.y, values, traces), fallback.y);
    const w = readNumber(resolveValue(element.properties.w, values, traces), 150);
    const h = readNumber(resolveValue(element.properties.h, values, traces), 72);
    const label = readString(resolveValue(element.properties.label, values, traces), element.name);
    positions.set(element.name, { x, y, w, h, type: element.type, label });
  });

  let body = '';
  body += `<text x="${width / 2}" y="42" text-anchor="middle" font-size="30" font-weight="800" fill="#0f172a">${escapeXml(decl.name)}</text>`;
  body += `<text x="${width / 2}" y="68" text-anchor="middle" font-size="14" fill="#64748b">Provider: ${escapeXml(decl.provider)}</text>`;

  decl.connections.forEach((connection, index) => {
    const a = positions.get(connection.from);
    const b = positions.get(connection.to);
    if (!a || !b) return;
    const startX = a.x + a.w / 2;
    const startY = a.y + a.h;
    const endX = b.x + b.w / 2;
    const endY = b.y;
    const midY = (startY + endY) / 2;
    body += `<defs><marker id="infra-arrow-${index}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"/></marker></defs>`;
    body += `<path d="M ${round(startX)} ${round(startY)} L ${round(startX)} ${round(midY)} L ${round(endX)} ${round(midY)} L ${round(endX)} ${round(endY)}" fill="none" stroke="#475569" stroke-width="2.2" marker-end="url(#infra-arrow-${index})"/>`;
    if (connection.label) {
      body += `<text x="${round((startX + endX) / 2)}" y="${round(midY - 8)}" text-anchor="middle" font-size="11" fill="#475569">${escapeXml(connection.label)}</text>`;
    }
  });

  decl.elements.forEach((element) => {
    const pos = positions.get(element.name);
    if (!pos) return;
    body += renderInfraElement(pos.x, pos.y, pos.w, pos.h, pos.type, pos.label);
  });

  return svgDocument(width, height, body, '#f8fafc');
}

function autoLayout(elements: InfraElement[], width: number, height: number): { x: number; y: number }[] {
  const cols = Math.ceil(Math.sqrt(Math.max(elements.length, 1)));
  const rows = Math.ceil(Math.max(elements.length, 1) / cols);
  const paddingX = 90;
  const paddingY = 120;
  const gapX = (width - paddingX * 2) / Math.max(cols, 1);
  const gapY = (height - paddingY * 2) / Math.max(rows, 1);
  return elements.map((_, index) => ({
    x: paddingX + (index % cols) * gapX + 20,
    y: paddingY + Math.floor(index / cols) * gapY,
  }));
}

function renderInfraElement(x: number, y: number, w: number, h: number, type: string, label: string): string {
  const kind = type.toLowerCase();
  const theme = infraTheme(kind);
  let svg = '';
  switch (kind) {
    case 'user':
    case 'internet':
      svg += `<ellipse cx="${round(x + w / 2)}" cy="${round(y + h / 2)}" rx="${round(w / 2)}" ry="${round(h / 2)}" fill="${theme.fill}" stroke="${theme.stroke}" stroke-width="2"/>`;
      break;
    case 'db':
    case 'database':
      svg += `<ellipse cx="${round(x + w / 2)}" cy="${round(y + 12)}" rx="${round(w / 2)}" ry="12" fill="${theme.fill}" stroke="${theme.stroke}" stroke-width="2"/>`;
      svg += `<rect x="${round(x)}" y="${round(y + 12)}" width="${round(w)}" height="${round(h - 24)}" fill="${theme.fill}" stroke="${theme.stroke}" stroke-width="2"/>`;
      svg += `<ellipse cx="${round(x + w / 2)}" cy="${round(y + h - 12)}" rx="${round(w / 2)}" ry="12" fill="${theme.fill}" stroke="${theme.stroke}" stroke-width="2"/>`;
      break;
    case 'queue':
    case 'topic':
      svg += `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="16" fill="${theme.fill}" stroke="${theme.stroke}" stroke-width="2"/>`;
      svg += `<path d="M ${round(x + 22)} ${round(y + h / 2)} h ${round(w - 44)}" stroke="${theme.stroke}" stroke-width="3" stroke-dasharray="10 6"/>`;
      break;
    default:
      svg += `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="16" fill="${theme.fill}" stroke="${theme.stroke}" stroke-width="2"/>`;
      break;
  }
  svg += `<text x="${round(x + w / 2)}" y="${round(y + h / 2 + 5)}" text-anchor="middle" font-size="14" font-weight="700" fill="${theme.text}">${escapeXml(label)}</text>`;
  return svg;
}

function infraTheme(kind: string): { fill: string; stroke: string; text: string } {
  switch (kind) {
    case 'user':
    case 'internet':
      return { fill: '#e0f2fe', stroke: '#0284c7', text: '#075985' };
    case 'gateway':
    case 'api':
      return { fill: '#dbeafe', stroke: '#2563eb', text: '#1e3a8a' };
    case 'lambda':
    case 'compute':
    case 'service':
      return { fill: '#ede9fe', stroke: '#7c3aed', text: '#5b21b6' };
    case 'db':
    case 'database':
    case 'storage':
    case 'bucket':
      return { fill: '#dcfce7', stroke: '#16a34a', text: '#166534' };
    case 'queue':
    case 'topic':
      return { fill: '#fff7ed', stroke: '#ea580c', text: '#9a3412' };
    default:
      return { fill: '#f8fafc', stroke: '#475569', text: '#0f172a' };
  }
}
