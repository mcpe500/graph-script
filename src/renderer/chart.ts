import { ChartDeclaration, Expression } from '../ast/types';
import { GSValue, Trace } from '../runtime/values';

export interface ChartConfig {
  title?: string;
  type: 'bar' | 'line' | 'scatter' | 'pie' | 'box' | 'area';
  width: number;
  height: number;
  xLabel?: string;
  yLabel?: string;
  labels?: string[];
}

export interface DataSeries {
  name: string;
  x?: number[];
  y: number[];
  labels?: string[];
}

const palette = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777'];

export function extractChartConfig(decl: ChartDeclaration, values?: Record<string, GSValue>, traces?: Map<string, Trace>): ChartConfig {
  const config: ChartConfig = {
    title: decl.name,
    type: 'line',
    width: 900,
    height: 480,
  };

  const typeValue = resolveValue(decl.properties.type, values, traces);
  if (typeof typeValue === 'string' && ['bar', 'line', 'scatter', 'pie', 'box', 'area'].includes(typeValue)) {
    config.type = typeValue as ChartConfig['type'];
  }

  const widthValue = resolveValue(decl.properties.width, values, traces);
  if (typeof widthValue === 'number') config.width = widthValue;
  const heightValue = resolveValue(decl.properties.height, values, traces);
  if (typeof heightValue === 'number') config.height = heightValue;

  const xLabelValue = resolveValue(decl.properties.xlabel, values, traces);
  if (typeof xLabelValue === 'string') config.xLabel = xLabelValue;
  const yLabelValue = resolveValue(decl.properties.ylabel, values, traces);
  if (typeof yLabelValue === 'string') config.yLabel = yLabelValue;
  const titleValue = resolveValue(decl.properties.title, values, traces);
  if (typeof titleValue === 'string') config.title = titleValue;

  const labelValue = resolveValue(decl.properties.labels, values, traces);
  const labels = asStringArray(labelValue);
  if (labels.length) config.labels = labels;

  return config;
}

export function buildChartSeries(
  decl: ChartDeclaration,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>
): DataSeries[] {
  const sourceValue = resolveValue(decl.properties.source, values, traces);
  const xValue = resolveValue(decl.properties.x, values, traces);
  const yValue = resolveValue(decl.properties.y, values, traces);
  const labelValue = resolveValue(decl.properties.labels, values, traces);
  const explicitLabels = asStringArray(labelValue);
  const xLabels = asStringArray(xValue);
  const labels = explicitLabels.length ? explicitLabels : xLabels;

  const trace = sourceValue && typeof sourceValue === 'object' && (sourceValue as Trace).type === 'trace'
    ? sourceValue as Trace
    : resolveTraceFromExpression(decl.properties.source, traces);

  if (trace) {
    const xColumn = expressionToFieldName(decl.properties.x) ?? firstNumericColumn(trace) ?? trace.columns[0];
    const yColumn = expressionToFieldName(decl.properties.y) ?? secondNumericColumn(trace, xColumn) ?? firstNumericColumn(trace) ?? trace.columns[0];
    const labelColumn = expressionToFieldName(decl.properties.labels) ?? firstStringColumn(trace);
    const x = numericColumn(trace, xColumn);
    const y = numericColumn(trace, yColumn);
    const traceLabels = labelColumn ? stringColumn(trace, labelColumn) : undefined;
    if (y.length) return [{ name: yColumn, x: x.length === y.length ? x : undefined, y, labels: traceLabels }];
  }

  const sourceMatrix = asNumberMatrix(sourceValue);
  if (sourceMatrix.length > 1) {
    return sourceMatrix.map((row, idx) => ({
      name: labels[idx] ?? `Series ${idx + 1}`,
      y: row,
    }));
  }

  const yMatrix = asNumberMatrix(yValue);
  if (yMatrix.length > 1) {
    return yMatrix.map((row, idx) => ({
      name: labels[idx] ?? `Series ${idx + 1}`,
      x: asNumberArray(xValue),
      y: row,
      labels,
    }));
  }

  const x = asNumberArray(xValue);
  const y = asNumberArray(yValue ?? sourceValue);
  if (y.length) {
    return [{
      name: expressionToFieldName(decl.properties.y) ?? expressionToFieldName(decl.properties.source) ?? 'series',
      x: x.length === y.length ? x : undefined,
      y,
      labels,
    }];
  }

  const fallback = Object.entries(values)
    .filter(([, value]) => Array.isArray(value) && value.every((item) => typeof item === 'number'))
    .map(([name, value]) => ({ name, y: value as number[] }));
  return fallback;
}

export function renderChart(config: ChartConfig, series: DataSeries[]): string {
  switch (config.type) {
    case 'bar':
      return renderBarChart(config, series);
    case 'scatter':
      return renderXYChart(config, series, 'scatter');
    case 'area':
      return renderXYChart(config, series, 'area');
    case 'pie':
      return renderPieChart(config, series);
    case 'box':
      return renderBoxChart(config, series);
    case 'line':
    default:
      return renderXYChart(config, series, 'line');
  }
}

function renderXYChart(config: ChartConfig, series: DataSeries[], mode: 'line' | 'scatter' | 'area'): string {
  const padding = { top: 56, right: 28, bottom: 72, left: 72 };
  const chartWidth = config.width - padding.left - padding.right;
  const chartHeight = config.height - padding.top - padding.bottom;
  const allX = series.flatMap((s) => s.x ?? s.y.map((_, index) => index));
  const allY = series.flatMap((s) => s.y);
  const { min: minX, max: maxX } = minMax(allX, 0, Math.max(allX.length - 1, 1));
  const { min: minY, max: maxY } = minMax(allY, 0, 1);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;
  const discreteX = resolveDiscreteXAxis(series);

  let svg = openSvg(config);
  svg += `<g transform="translate(${padding.left}, ${padding.top})">`;
  svg += renderYGrid(chartWidth, chartHeight, minY, maxY);
  svg += discreteX
    ? renderDiscreteXAxis(chartWidth, chartHeight, minX, xRange, discreteX)
    : renderNumericXAxis(chartWidth, chartHeight, minX, maxX);

  series.forEach((s, index) => {
    const color = palette[index % palette.length];
    const xs = s.x ?? s.y.map((_, pointIndex) => pointIndex);
    const points = s.y.map((value, pointIndex) => ({
      x: ((xs[pointIndex] - minX) / xRange) * chartWidth,
      y: chartHeight - ((value - minY) / yRange) * chartHeight,
      value,
      rawX: xs[pointIndex],
    }));

    if (mode === 'line' || mode === 'area') {
      const polyline = points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
      if (mode === 'area') {
        const areaPoints = [`0,${chartHeight}`, polyline, `${chartWidth},${chartHeight}`].join(' ');
        svg += `<polygon points="${areaPoints}" fill="${color}" fill-opacity="0.18" stroke="none"/>`;
      }
      svg += `<polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    }

    points.forEach((point) => {
      svg += `<circle cx="${round(point.x)}" cy="${round(point.y)}" r="4.5" fill="${color}" stroke="white" stroke-width="1.5"><title>${escapeXml(s.name)}: (${round(point.rawX, 2)}, ${round(point.value, 2)})</title></circle>`;
    });
  });

  svg += renderAxes(chartWidth, chartHeight, config.xLabel, config.yLabel);
  svg += renderLegend(series, config.width - padding.right - 8, padding.top - 22);
  svg += `</g></svg>`;
  return svg;
}

export function renderBarChart(config: ChartConfig, series: DataSeries[]): string {
  const padding = { top: 56, right: 28, bottom: 84, left: 72 };
  const chartWidth = config.width - padding.left - padding.right;
  const chartHeight = config.height - padding.top - padding.bottom;
  const count = Math.max(...series.map((s) => s.y.length), 1);
  const groupWidth = chartWidth / count;
  const barWidth = Math.max(14, (groupWidth - 16) / Math.max(series.length, 1));
  const allValues = series.flatMap((s) => s.y);
  const { min: rawMin, max: rawMax } = minMax(allValues, 0, 1);
  const minValue = Math.min(0, rawMin);
  const maxValue = Math.max(0, rawMax);
  const yRange = maxValue - minValue || 1;
  const baselineY = chartHeight - ((0 - minValue) / yRange) * chartHeight;
  const labels = config.labels?.length ? config.labels : series[0]?.labels?.length ? series[0].labels : series[0]?.x?.map((value) => String(value));

  let svg = openSvg(config);
  svg += `<g transform="translate(${padding.left}, ${padding.top})">`;
  svg += renderYGrid(chartWidth, chartHeight, minValue, maxValue);

  series.forEach((s, sIdx) => {
    const color = palette[sIdx % palette.length];
    s.y.forEach((value, idx) => {
      const x = idx * groupWidth + 8 + sIdx * barWidth;
      const y = chartHeight - ((value - minValue) / yRange) * chartHeight;
      const rectY = Math.min(y, baselineY);
      const height = Math.abs(baselineY - y);
      svg += `<rect x="${round(x)}" y="${round(rectY)}" width="${round(barWidth - 4)}" height="${round(Math.max(height, 1))}" fill="${color}" rx="4"><title>${escapeXml(s.name)}: ${round(value, 2)}</title></rect>`;
    });
  });

  if (labels?.length) {
    labels.slice(0, count).forEach((label, idx) => {
      const x = idx * groupWidth + groupWidth / 2;
      svg += `<text x="${round(x)}" y="${chartHeight + 22}" text-anchor="middle" font-size="11" fill="#475569">${escapeXml(label)}</text>`;
    });
  }

  svg += renderAxes(chartWidth, chartHeight, config.xLabel, config.yLabel);
  svg += renderLegend(series, config.width - padding.right - 8, padding.top - 22);
  svg += `</g></svg>`;
  return svg;
}

function renderPieChart(config: ChartConfig, series: DataSeries[]): string {
  const values = series.flatMap((s) => s.y);
  const labels = series.flatMap((s) => s.labels ?? []).length
    ? series.flatMap((s) => s.labels ?? [])
    : config.labels?.length
      ? config.labels
      : series.flatMap((s) => s.y.map((_, index) => s.name === 'series' ? `Slice ${index + 1}` : `${s.name} ${index + 1}`));
  const total = values.reduce((sum, value) => sum + Math.max(value, 0), 0) || 1;
  const radius = Math.min(config.width, config.height) * 0.28;
  const cx = config.width * 0.36;
  const cy = config.height * 0.55;

  let svg = openSvg(config);
  let angle = -Math.PI / 2;

  values.forEach((value, index) => {
    const sliceAngle = (Math.max(value, 0) / total) * Math.PI * 2;
    const nextAngle = angle + sliceAngle;
    const x1 = cx + radius * Math.cos(angle);
    const y1 = cy + radius * Math.sin(angle);
    const x2 = cx + radius * Math.cos(nextAngle);
    const y2 = cy + radius * Math.sin(nextAngle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const color = palette[index % palette.length];
    svg += `<path d="M ${round(cx)} ${round(cy)} L ${round(x1)} ${round(y1)} A ${round(radius)} ${round(radius)} 0 ${largeArc} 1 ${round(x2)} ${round(y2)} Z" fill="${color}" stroke="white" stroke-width="2"/>`;

    const labelAngle = angle + sliceAngle / 2;
    const labelX = cx + radius * 0.66 * Math.cos(labelAngle);
    const labelY = cy + radius * 0.66 * Math.sin(labelAngle);
    const pct = `${round((value / total) * 100, 1)}%`;
    if (sliceAngle > 0.28) {
      svg += `<text x="${round(labelX)}" y="${round(labelY)}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="white">${escapeXml(pct)}</text>`;
    }
    angle = nextAngle;
  });

  labels.forEach((label, index) => {
    const y = 90 + index * 22;
    const color = palette[index % palette.length];
    svg += `<rect x="${config.width * 0.68}" y="${y - 10}" width="14" height="14" rx="3" fill="${color}"/>`;
    svg += `<text x="${config.width * 0.68 + 22}" y="${y + 1}" font-size="12" fill="#334155">${escapeXml(label)} (${round(values[index] ?? 0, 2)})</text>`;
  });

  svg += `</svg>`;
  return svg;
}

function renderBoxChart(config: ChartConfig, series: DataSeries[]): string {
  const padding = { top: 56, right: 28, bottom: 84, left: 72 };
  const chartWidth = config.width - padding.left - padding.right;
  const chartHeight = config.height - padding.top - padding.bottom;
  const flattened = series.flatMap((s) => s.y);
  const { min, max } = minMax(flattened, 0, 1);
  const yRange = max - min || 1;
  const slotWidth = chartWidth / Math.max(series.length, 1);

  let svg = openSvg(config);
  svg += `<g transform="translate(${padding.left}, ${padding.top})">`;
  svg += renderYGrid(chartWidth, chartHeight, min, max);

  series.forEach((s, index) => {
    const stats = fiveNumberSummary(s.y);
    const centerX = slotWidth * index + slotWidth / 2;
    const boxWidth = Math.min(72, slotWidth * 0.42);
    const color = palette[index % palette.length];
    const yMin = scaleY(stats.min, min, yRange, chartHeight);
    const yQ1 = scaleY(stats.q1, min, yRange, chartHeight);
    const yMedian = scaleY(stats.median, min, yRange, chartHeight);
    const yQ3 = scaleY(stats.q3, min, yRange, chartHeight);
    const yMax = scaleY(stats.max, min, yRange, chartHeight);

    svg += `<line x1="${round(centerX)}" y1="${round(yMax)}" x2="${round(centerX)}" y2="${round(yQ3)}" stroke="#475569" stroke-width="2"/>`;
    svg += `<line x1="${round(centerX)}" y1="${round(yQ1)}" x2="${round(centerX)}" y2="${round(yMin)}" stroke="#475569" stroke-width="2"/>`;
    svg += `<line x1="${round(centerX - boxWidth / 3)}" y1="${round(yMax)}" x2="${round(centerX + boxWidth / 3)}" y2="${round(yMax)}" stroke="#475569" stroke-width="2"/>`;
    svg += `<line x1="${round(centerX - boxWidth / 3)}" y1="${round(yMin)}" x2="${round(centerX + boxWidth / 3)}" y2="${round(yMin)}" stroke="#475569" stroke-width="2"/>`;
    svg += `<rect x="${round(centerX - boxWidth / 2)}" y="${round(yQ3)}" width="${round(boxWidth)}" height="${round(Math.max(yQ1 - yQ3, 1))}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="2" rx="6"/>`;
    svg += `<line x1="${round(centerX - boxWidth / 2)}" y1="${round(yMedian)}" x2="${round(centerX + boxWidth / 2)}" y2="${round(yMedian)}" stroke="${color}" stroke-width="3"/>`;
    svg += `<text x="${round(centerX)}" y="${chartHeight + 22}" text-anchor="middle" font-size="11" fill="#475569">${escapeXml(s.name)}</text>`;
  });

  svg += renderAxes(chartWidth, chartHeight, config.xLabel, config.yLabel);
  svg += `</g></svg>`;
  return svg;
}

function resolveTraceFromExpression(expr: Expression | undefined, traces: Map<string, Trace>): Trace | undefined {
  if (!expr || expr.type !== 'MemberExpression' || expr.property !== 'trace' || expr.object.type !== 'Identifier') return undefined;
  return traces.get(expr.object.name);
}

function resolveValue(expr: Expression | undefined, values?: Record<string, GSValue>, traces?: Map<string, Trace>): any {
  if (!expr) return undefined;
  switch (expr.type) {
    case 'Literal':
      return expr.value;
    case 'Identifier':
      return values && expr.name in values ? values[expr.name] : expr.name;
    case 'ArrayExpression':
      return expr.elements.map((element) => resolveValue(element, values, traces));
    case 'ObjectExpression':
      return Object.fromEntries(expr.properties.map((prop) => [prop.key, resolveValue(prop.value, values, traces)]));
    case 'MemberExpression': {
      if (expr.property === 'trace' && expr.object.type === 'Identifier') return traces?.get(expr.object.name);
      const object = resolveValue(expr.object, values, traces);
      if (object && typeof object === 'object') return object[expr.property];
      return undefined;
    }
    case 'IndexExpression': {
      const object = resolveValue(expr.object, values, traces);
      const index = resolveValue(expr.index, values, traces);
      return Array.isArray(object) ? object[index] : object?.[index];
    }
    default:
      return undefined;
  }
}

function expressionToFieldName(expr?: Expression): string | undefined {
  if (!expr) return undefined;
  if (expr.type === 'Identifier') return expr.name;
  if (expr.type === 'Literal' && typeof expr.value === 'string') return expr.value;
  return undefined;
}

function asNumberArray(value: any): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === 'number');
}

function asStringArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asNumberMatrix(value: any): number[][] {
  if (!Array.isArray(value) || !value.length || !Array.isArray(value[0])) return [];
  return value
    .filter((row): row is any[] => Array.isArray(row))
    .map((row) => row.filter((item): item is number => typeof item === 'number'))
    .filter((row) => row.length > 0);
}

function numericColumn(trace: Trace, column: string): number[] {
  return trace.rows.map((row) => row[column]).filter((value): value is number => typeof value === 'number');
}

function stringColumn(trace: Trace, column: string): string[] {
  return trace.rows.map((row) => row[column]).filter((value): value is string => typeof value === 'string');
}

function firstNumericColumn(trace: Trace): string | undefined {
  return trace.columns.find((column) => trace.rows.some((row) => typeof row[column] === 'number'));
}

function secondNumericColumn(trace: Trace, exclude?: string): string | undefined {
  return trace.columns.find((column) => column !== exclude && trace.rows.some((row) => typeof row[column] === 'number'));
}

function firstStringColumn(trace: Trace): string | undefined {
  return trace.columns.find((column) => trace.rows.some((row) => typeof row[column] === 'string'));
}

function openSvg(config: ChartConfig): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}">`;
  svg += `<rect width="${config.width}" height="${config.height}" fill="#ffffff"/>`;
  if (config.title) {
    svg += `<text x="${config.width / 2}" y="30" text-anchor="middle" font-size="20" font-weight="700" fill="#0f172a">${escapeXml(config.title)}</text>`;
  }
  return svg;
}

function renderYGrid(chartWidth: number, chartHeight: number, minValue: number, maxValue: number): string {
  const lines = 5;
  let svg = '';
  for (let i = 0; i <= lines; i += 1) {
    const ratio = i / lines;
    const y = chartHeight - ratio * chartHeight;
    const value = minValue + ratio * (maxValue - minValue);
    svg += `<line x1="0" y1="${round(y)}" x2="${chartWidth}" y2="${round(y)}" stroke="#e2e8f0" stroke-dasharray="4 4"/>`;
    svg += `<text x="-12" y="${round(y + 4)}" text-anchor="end" font-size="11" fill="#64748b">${round(value, 2)}</text>`;
  }
  return svg;
}

function renderNumericXAxis(chartWidth: number, chartHeight: number, minX: number, maxX: number): string {
  const ticks = 6;
  let svg = '';
  for (let i = 0; i <= ticks; i += 1) {
    const ratio = i / ticks;
    const x = ratio * chartWidth;
    const value = minX + ratio * (maxX - minX);
    svg += `<line x1="${round(x)}" y1="${chartHeight}" x2="${round(x)}" y2="${chartHeight + 6}" stroke="#475569"/>`;
    svg += `<text x="${round(x)}" y="${chartHeight + 20}" text-anchor="middle" font-size="11" fill="#64748b">${round(value, 2)}</text>`;
  }
  return svg;
}

function renderDiscreteXAxis(chartWidth: number, chartHeight: number, minX: number, xRange: number, values: number[]): string {
  let svg = '';
  values.forEach((value) => {
    const x = ((value - minX) / (xRange || 1)) * chartWidth;
    svg += `<line x1="${round(x)}" y1="${chartHeight}" x2="${round(x)}" y2="${chartHeight + 6}" stroke="#475569"/>`;
    svg += `<text x="${round(x)}" y="${chartHeight + 20}" text-anchor="middle" font-size="11" fill="#64748b">${formatTick(value)}</text>`;
  });
  return svg;
}

function renderAxes(chartWidth: number, chartHeight: number, xLabel?: string, yLabel?: string): string {
  let svg = `<line x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" stroke="#334155" stroke-width="1.5"/>`;
  svg += `<line x1="0" y1="0" x2="0" y2="${chartHeight}" stroke="#334155" stroke-width="1.5"/>`;
  if (xLabel) svg += `<text x="${chartWidth / 2}" y="${chartHeight + 50}" text-anchor="middle" font-size="13" fill="#0f172a">${escapeXml(xLabel)}</text>`;
  if (yLabel) svg += `<text x="${-chartHeight / 2}" y="-48" text-anchor="middle" font-size="13" fill="#0f172a" transform="rotate(-90)">${escapeXml(yLabel)}</text>`;
  return svg;
}

function renderLegend(series: DataSeries[], x: number, y: number): string {
  if (series.length <= 1) return '';
  const longest = Math.max(...series.map((entry) => entry.name.length), 10);
  const width = Math.max(160, longest * 7 + 34);
  const height = series.length * 18 + 16;
  const left = x - width;
  const top = y - 12;
  let svg = '';
  svg += `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="10" fill="#ffffff" fill-opacity="0.92" stroke="#cbd5e1"/>`;
  series.forEach((entry, index) => {
    const color = palette[index % palette.length];
    const itemY = y + index * 18;
    svg += `<rect x="${left + 12}" y="${itemY - 8}" width="12" height="12" rx="3" fill="${color}"/>`;
    svg += `<text x="${left + 30}" y="${itemY + 2}" font-size="11" fill="#334155">${escapeXml(entry.name)}</text>`;
  });
  return svg;
}

function resolveDiscreteXAxis(series: DataSeries[]): number[] | null {
  const candidate = series[0]?.x;
  if (!candidate?.length || candidate.length > 12) return null;
  const normalized = candidate.map((value) => round(value, 6));
  const isDiscrete = normalized.every((value) => Math.abs(value - Math.round(value)) < 1e-6);
  const shared = series.every((entry) => entry.x && entry.x.length === candidate.length && entry.x.every((value, index) => round(value, 6) === normalized[index]));
  if (!isDiscrete || !shared) return null;
  return normalized;
}

function formatTick(value: number): string {
  if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value));
  return String(round(value, 2));
}

function fiveNumberSummary(values: number[]): { min: number; q1: number; median: number; q3: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0] ?? 0,
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lower = sorted[base] ?? sorted[sorted.length - 1];
  const upper = sorted[base + 1] ?? lower;
  return lower + rest * (upper - lower);
}

function scaleY(value: number, min: number, range: number, chartHeight: number): number {
  return chartHeight - ((value - min) / range) * chartHeight;
}

function minMax(values: number[], fallbackMin: number, fallbackMax: number): { min: number; max: number } {
  if (!values.length) return { min: fallbackMin, max: fallbackMax };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
