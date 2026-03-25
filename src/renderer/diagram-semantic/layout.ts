import { DiagramElement } from '../../ast/types';
import { GSValue, Trace } from '../../runtime/values';
import { resolveValue } from '../common';
import { DEFAULT_FONT_FAMILY, measureDisplayFormula, measureRichTextBlock, readLatexMode } from '../latex';
import { compileConnector, estimateConnectorPriority } from './connectors';
import {
  BODY_TEXT_MIN,
  CARD_GAP_MIN,
  CARD_TITLE_MIN,
  CHILD_GAP_MIN,
  CONNECTOR_LABEL_MIN,
  FORMULA_TEXT_MIN,
  HEADER_TITLE_MIN,
  MIN_ASSET_HEIGHT,
  MIN_ASSET_WIDTH,
  SECTION_TITLE_MIN,
  CardLayout,
  CardMeasurement,
  ChildLayout,
  ConnectorRoutingContext,
  ContainerOptions,
  LaneSpec,
  SemanticCompileOptions,
  SemanticCompileResult,
  SEMANTIC_TYPES,
} from './types';
import {
  alignToAnchor,
  clamp,
  cloneElement,
  computeColumnWidths,
  element,
  getBoolean,
  getColumnX,
  getNumber,
  getSlotWidth,
  getString,
  measureSemanticBounds,
  offsetChildren,
  readContainerOptions,
  resolveAlignedX,
  resolveLaneLabel,
  resolveLanes,
} from './helpers';

export async function compileSemanticDiagram(
  elements: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  width: number,
  height: number,
  options: SemanticCompileOptions = {},
): Promise<SemanticCompileResult> {
  const hasSemantic = elements.some((element) => SEMANTIC_TYPES.has(element.type));
  if (!hasSemantic) {
    return { elements, minWidth: width, minHeight: height, hasSemantic: false };
  }

  const fontFamily = options.fontFamily ?? DEFAULT_FONT_FAMILY;
  const semantic = elements.filter((element) => SEMANTIC_TYPES.has(element.type));
  const plain = elements.filter((element) => !SEMANTIC_TYPES.has(element.type));

  const header = semantic.find((element) => element.type === 'header');
  const separator = semantic.find((element) => element.type === 'separator');
  const loopLabel = semantic.find((element) => element.type === 'loop_label');
  const laneElements = semantic.filter((element) => element.type === 'lane');
  const cardElements = semantic.filter((element) => element.type === 'card');
  const connectorElements = semantic.filter((element) => element.type === 'connector');

  const outerPadX = 36;
  const outerPadBottom = 48;
  const topPad = header ? 20 : 30;
  const contentX = outerPadX;
  const contentWidth = Math.max(900, width - outerPadX * 2);
  const compiled: DiagramElement[] = [];

  let cursorY = topPad;

  if (header) {
    const headerHeight = Math.max(70, getNumber(header, values, traces, 'h', 76));
    const fill = getString(header, values, traces, 'fill', '#173f76');
    const stroke = getString(header, values, traces, 'stroke', fill);
    const title = getString(header, values, traces, 'title', getString(header, values, traces, 'label', header.name));
    const color = getString(header, values, traces, 'color', '#ffffff');
    const size = Math.max(HEADER_TITLE_MIN, getNumber(header, values, traces, 'size', HEADER_TITLE_MIN));
    const titleBlock = await measureRichTextBlock(title, {
      x: width / 2,
      y: 0,
      maxWidth: contentWidth - 56,
      fontSize: size,
      weight: getString(header, values, traces, 'weight', '800'),
      anchor: 'middle',
      latex: readLatexMode(resolveValue(header.properties.latex, values, traces), 'auto'),
      maxLines: 2,
      fontFamily,
    });
    compiled.push(element('box', `${header.name}-bg`, {
      x: contentX,
      y: cursorY,
      w: contentWidth,
      h: headerHeight,
      label: '',
      fill,
      stroke,
      radius: getNumber(header, values, traces, 'radius', 0),
      shadow: false,
      validation_ignore: true,
    }));
    compiled.push(element('text', `${header.name}-title`, {
      x: width / 2,
      y: cursorY + Math.max(10, (headerHeight - titleBlock.height) / 2),
      w: contentWidth - 56,
      h: titleBlock.height,
      anchor: 'middle',
      value: title,
      size,
      weight: getString(header, values, traces, 'weight', '800'),
      color,
      latex: getString(header, values, traces, 'latex', 'auto'),
      font_family: fontFamily,
      min_gap: CHILD_GAP_MIN,
      semantic_role: 'header_title',
    }));
    cursorY += headerHeight + Math.max(CARD_GAP_MIN, getNumber(header, values, traces, 'gap', 30));
  }

  let lanes = resolveLanes(laneElements, separator, values, traces, contentX, cursorY, contentWidth, height);
  const separatorHeight = separator ? Math.max(46, getNumber(separator, values, traces, 'h', 48)) : 0;
  const separatorGap = separator ? Math.max(CARD_GAP_MIN, getNumber(separator, values, traces, 'gap', 30)) : 0;
  const laneTop = cursorY + separatorHeight + separatorGap;
  for (const lane of lanes) {
    lane.frame.y = laneTop;
    lane.frame.h = Math.max(0, lane.frame.h - laneTop);
  }

  let cards = await layoutCards(cardElements, lanes, values, traces, fontFamily);
  lanes = compactLaneFrames(lanes, cards, contentX, contentWidth, separator ? 84 : 52);
  for (const lane of lanes) {
    lane.frame.y = laneTop;
    lane.frame.h = Math.max(0, height - laneTop);
  }
  cards = await layoutCards(cardElements, lanes, values, traces, fontFamily);
  let contentBottom = Math.max(laneTop, ...cards.map((card) => card.y + card.height));
  const packedLeft = lanes.length ? Math.min(...lanes.map((lane) => lane.frame.x)) : contentX;
  const packedRight = lanes.length ? Math.max(...lanes.map((lane) => lane.frame.x + lane.frame.w)) : contentX + contentWidth;
  const packedCenterX = (packedLeft + packedRight) / 2;

  if (header) {
    const headerBg = compiled.find((elementToFind) => elementToFind.name === `${header.name}-bg`);
    const headerTitle = compiled.find((elementToFind) => elementToFind.name === `${header.name}-title`);
    const headerWidth = Math.max(360, packedRight - packedLeft);
    if (headerBg) {
      headerBg.properties.x = { type: 'Literal', value: packedLeft, location: headerBg.properties.x.location };
      headerBg.properties.w = { type: 'Literal', value: headerWidth, location: headerBg.properties.w.location };
    }
    if (headerTitle) {
      headerTitle.properties.x = { type: 'Literal', value: packedCenterX, location: headerTitle.properties.x.location };
      headerTitle.properties.w = { type: 'Literal', value: Math.max(280, headerWidth - 56), location: headerTitle.properties.w.location };
    }
  }

  if (separator) {
    const size = Math.max(SECTION_TITLE_MIN, getNumber(separator, values, traces, 'size', SECTION_TITLE_MIN));
    const color = getString(separator, values, traces, 'color', '#333333');
    for (const lane of lanes) {
      const label = resolveLaneLabel(lane, separator, values, traces);
      const labelBlock = await measureRichTextBlock(label, {
        x: lane.frame.x + lane.frame.w / 2,
        y: 0,
        maxWidth: lane.frame.w - 28,
        fontSize: size,
        weight: getString(separator, values, traces, 'weight', '800'),
        anchor: 'middle',
        latex: 'auto',
        maxLines: 2,
        fontFamily,
      });
      compiled.push(element('text', `${separator.name}-${lane.id}-label`, {
        x: lane.frame.x + lane.frame.w / 2,
        y: cursorY + Math.max(0, (separatorHeight - labelBlock.height) / 2),
        w: lane.frame.w - 28,
        h: labelBlock.height,
        anchor: 'middle',
        value: label,
        size,
        weight: getString(separator, values, traces, 'weight', '800'),
        color,
        font_family: fontFamily,
        semantic_role: 'section_heading',
      }));
    }
  }

  if (separator) {
    const separatorStroke = getString(separator, values, traces, 'stroke', '#a0a0a0');
    const dash = getString(separator, values, traces, 'dash', '10 12');
    const strokeWidth = getNumber(separator, values, traces, 'strokeWidth', 3);
    lanes.slice(0, -1).forEach((lane, index) => {
      const dividerX = lane.frame.x + lane.frame.w + 42;
      compiled.push(element('line', `${separator.name}-divider-${index + 1}`, {
        x: dividerX,
        y: cursorY + 6,
        x2: dividerX,
        y2: contentBottom + 5,
        stroke: separatorStroke,
        strokeWidth,
        dash,
        strokeOpacity: getNumber(separator, values, traces, 'strokeOpacity', 0.6),
        validation_ignore: true,
      }));
    });
  }

  if (loopLabel) {
    const loopValue = getString(loopLabel, values, traces, 'value', loopLabel.name);
    const loopSize = Math.max(BODY_TEXT_MIN, getNumber(loopLabel, values, traces, 'size', 26));
    const block = await measureRichTextBlock(loopValue, {
      x: width / 2,
      y: 0,
      maxWidth: Math.max(220, (packedRight - packedLeft) * 0.32),
      fontSize: loopSize,
      weight: getString(loopLabel, values, traces, 'weight', '700'),
      anchor: 'middle',
      latex: 'auto',
      maxLines: 2,
      fontFamily,
    });
    compiled.push(element('text', `${loopLabel.name}-text`, {
      x: width / 2,
      y: (laneTop + contentBottom) / 2 - block.height / 2,
      w: Math.max(220, (packedRight - packedLeft) * 0.32),
      h: block.height,
      anchor: 'middle',
      value: loopValue,
      size: loopSize,
      weight: getString(loopLabel, values, traces, 'weight', '700'),
      color: getString(loopLabel, values, traces, 'color', '#e0e0e0'),
      font_family: fontFamily,
      validation_ignore: true,
      semantic_role: 'decorative',
    }));
  }

  compiled.push(...cards.map((card) => card.compiled));
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const routingContext: ConnectorRoutingContext = { segments: [], labels: [] };
  const sortedConnectors = [...connectorElements].sort((a, b) =>
    estimateConnectorPriority(b, cardMap, values, traces) - estimateConnectorPriority(a, cardMap, values, traces),
  );
  for (const connector of sortedConnectors) {
    const connectorParts = await compileConnector(connector, cardMap, routingContext, values, traces, fontFamily);
    compiled.push(...connectorParts);
  }

  contentBottom = Math.max(contentBottom, ...compiled
    .map((elementToMeasure) => {
      const y = getNumber(elementToMeasure, values, traces, 'y', 0);
      const h = getNumber(elementToMeasure, values, traces, 'h', 0);
      return y + h;
    })
    .filter((value) => Number.isFinite(value)));

  const bounds = measureSemanticBounds(compiled, values, traces);
  return {
    elements: [...compiled, ...plain],
    minWidth: Math.max(720, Math.min(width, bounds.maxX + outerPadX)),
    minHeight: Math.max(360, bounds.maxY + outerPadBottom),
    hasSemantic: true,
  };
}

async function layoutCards(
  cardElements: DiagramElement[],
  lanes: LaneSpec[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  fontFamily: string,
): Promise<CardLayout[]> {
  const cards: CardLayout[] = [];

  for (const lane of lanes) {
    const laneCards = cardElements
      .filter((card) => getString(card, values, traces, 'section', '') === lane.section)
      .sort((a, b) => {
        const rowDiff = getNumber(a, values, traces, 'row', 1) - getNumber(b, values, traces, 'row', 1);
        if (rowDiff !== 0) return rowDiff;
        return getNumber(a, values, traces, 'col', 1) - getNumber(b, values, traces, 'col', 1);
      });
    if (!laneCards.length) continue;

    const innerX = lane.frame.x + lane.padding;
    const innerW = Math.max(200, lane.frame.w - lane.padding * 2);
    const columnWidths = computeColumnWidths(lane, innerW);

    const measured: Array<{
      card: DiagramElement;
      row: number;
      col: number;
      span: number;
      rowSpan: number;
      width: number;
      height: number;
      children: DiagramElement[];
    }> = [];
    const rowHeights = new Map<number, number>();
    let maxRow = 1;
    for (const card of laneCards) {
      const row = Math.max(1, getNumber(card, values, traces, 'row', 1));
      const col = Math.max(1, getNumber(card, values, traces, 'col', 1));
      const span = Math.max(1, Math.min(lane.columns - col + 1, getNumber(card, values, traces, 'span', 1)));
      const rowSpan = Math.max(1, getNumber(card, values, traces, 'row_span', 1));
      maxRow = Math.max(maxRow, row + rowSpan - 1);
      const slotWidth = getSlotWidth(columnWidths, lane.gapX, col - 1, span);
      const hasExplicitWidth = card.properties.w != null;
      const preferredWidth = getNumber(card, values, traces, 'w', slotWidth);
      const minWidth = getNumber(card, values, traces, 'min_w', 0);
      const boundedMinWidth = minWidth > 0 ? Math.min(slotWidth, minWidth) : 0;
      const initialWidth = Math.max(boundedMinWidth, Math.min(slotWidth, preferredWidth));
      let measurement = await measureCard(card, initialWidth, values, traces, fontFamily);
      let width = initialWidth;
      if (!hasExplicitWidth) {
        const compactWidth = clamp(measurement.width, boundedMinWidth || 0, slotWidth);
        if (Math.abs(compactWidth - width) > 10) {
          width = compactWidth;
          measurement = await measureCard(card, width, values, traces, fontFamily);
        } else {
          width = compactWidth;
        }
      }
      measured.push({ card, row, col, span, rowSpan, width, height: measurement.height, children: measurement.children });
      if (rowSpan === 1) rowHeights.set(row, Math.max(rowHeights.get(row) ?? 0, measurement.height));
    }

    for (let row = 1; row <= maxRow; row += 1) {
      if (!rowHeights.has(row)) rowHeights.set(row, 0);
    }

    let adjusted = true;
    let guard = 0;
    while (adjusted && guard < 6) {
      adjusted = false;
      guard += 1;
      for (const entry of measured.filter((item) => item.rowSpan > 1)) {
        const currentHeight = spanHeight(rowHeights, entry.row, entry.rowSpan, lane.gapY);
        if (currentHeight + 0.1 < entry.height) {
          const delta = (entry.height - currentHeight) / entry.rowSpan;
          for (let row = entry.row; row < entry.row + entry.rowSpan; row += 1) {
            rowHeights.set(row, (rowHeights.get(row) ?? 0) + delta);
          }
          adjusted = true;
        }
      }
    }

    const rowY = new Map<number, number>();
    let laneCursorY = lane.frame.y + 10;
    for (let row = 1; row <= maxRow; row += 1) {
      rowY.set(row, laneCursorY);
      laneCursorY += (rowHeights.get(row) ?? 0) + lane.gapY;
    }

    for (const entry of measured) {
      const slotWidth = getSlotWidth(columnWidths, lane.gapX, entry.col - 1, entry.span);
      const x = innerX + getColumnX(columnWidths, lane.gapX, entry.col - 1) + Math.max(0, (slotWidth - entry.width) / 2);
      const y = rowY.get(entry.row) ?? lane.frame.y;
      const reservedHeight = spanHeight(rowHeights, entry.row, entry.rowSpan, lane.gapY);
      const height = entry.rowSpan > 1 ? Math.max(entry.height, reservedHeight) : entry.height;
      const compiled = compileMeasuredCard(entry.card, x, y, entry.width, height, entry.children, values, traces, fontFamily);
      cards.push({
        id: entry.card.name,
        section: lane.section,
        row: entry.row,
        col: entry.col,
        span: entry.span,
        rowSpan: entry.rowSpan,
        width: entry.width,
        height,
        x,
        y,
        laneId: lane.id,
        compiled,
      });
    }
  }

  return cards;
}

function spanHeight(rowHeights: Map<number, number>, row: number, rowSpan: number, gapY: number): number {
  let total = 0;
  for (let current = row; current < row + rowSpan; current += 1) total += rowHeights.get(current) ?? 0;
  if (rowSpan > 1) total += gapY * (rowSpan - 1);
  return total;
}

async function measureCard(
  card: DiagramElement,
  width: number,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  fontFamily: string,
): Promise<CardMeasurement> {
  const padding = Math.max(24, getNumber(card, values, traces, 'padding', 24));
  const gap = Math.max(CHILD_GAP_MIN, getNumber(card, values, traces, 'gap', 18));
  const label = getString(card, values, traces, 'label', card.name);
  const subtitle = getString(card, values, traces, 'subtitle', '');
  const titleSize = Math.max(CARD_TITLE_MIN, getNumber(card, values, traces, 'size', CARD_TITLE_MIN));
  const subtitleSize = Math.max(BODY_TEXT_MIN, getNumber(card, values, traces, 'subtitle_size', BODY_TEXT_MIN));
  const latexMode = readLatexMode(resolveValue(card.properties.latex, values, traces), 'auto');

  const titleBlock = label
    ? await measureRichTextBlock(label, {
        x: width / 2,
        y: 0,
        maxWidth: width - 32,
        fontSize: titleSize,
        weight: '800',
        anchor: 'middle',
        latex: latexMode,
        maxLines: 3,
        fontFamily,
      })
    : { width: 0, height: 0 };

  const subtitleBlock = subtitle
    ? await measureRichTextBlock(subtitle, {
        x: width / 2,
        y: 0,
        maxWidth: width - 36,
        fontSize: subtitleSize,
        weight: '500',
        anchor: 'middle',
        latex: latexMode,
        maxLines: 4,
        fontFamily,
      })
    : { width: 0, height: 0 };

  const headerTop = 18;
  const titleBottomGap = titleBlock.height ? 12 : 0;
  const subtitleGap = subtitleBlock.height ? 8 : 0;
  const headerHeight = titleBlock.height || subtitleBlock.height
    ? Math.max(64, headerTop + titleBlock.height + (subtitleBlock.height ? titleBottomGap + subtitleBlock.height + subtitleGap : 0) + 12)
    : 28;

  const innerWidth = Math.max(140, width - padding * 2);
  const containerOptions = readContainerOptions(card, values, traces, 'stack', gap);
  const content = await layoutContainerChildren(card.children ?? [], innerWidth, containerOptions, values, traces, fontFamily);
  const bodyTop = headerHeight + padding;
  const fallbackHeight = headerHeight + padding * 2 + (content.elements.length ? content.height : 52);
  const minHeight = getNumber(card, values, traces, 'min_h', 0);
  const compactWidth = clamp(Math.max(
    titleBlock.width ? titleBlock.width + 48 : 0,
    subtitleBlock.width ? subtitleBlock.width + 52 : 0,
    content.width ? content.width + padding * 2 : 0,
    getNumber(card, values, traces, 'compact_min_w', 220),
  ), getNumber(card, values, traces, 'min_w', 0) || 0, width);

  return {
    width: compactWidth,
    height: Math.max(minHeight, fallbackHeight),
    children: offsetChildren(content.elements, padding, bodyTop),
  };
}

function compileMeasuredCard(
  card: DiagramElement,
  x: number,
  y: number,
  w: number,
  h: number,
  children: DiagramElement[],
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  fontFamily: string,
): DiagramElement {
  const titleSize = Math.max(CARD_TITLE_MIN, getNumber(card, values, traces, 'size', CARD_TITLE_MIN));
  const subtitleSize = Math.max(BODY_TEXT_MIN, getNumber(card, values, traces, 'subtitle_size', BODY_TEXT_MIN));
  return element('panel', card.name, {
    x,
    y,
    w,
    h,
    label: getString(card, values, traces, 'label', card.name),
    subtitle: getString(card, values, traces, 'subtitle', ''),
    fill: getString(card, values, traces, 'fill', '#ffffff'),
    stroke: getString(card, values, traces, 'stroke', '#cbd5e1'),
    radius: getNumber(card, values, traces, 'radius', 18),
    shadow: false,
    strokeWidth: getNumber(card, values, traces, 'strokeWidth', 1.8),
    dash: getString(card, values, traces, 'dash', ''),
    size: titleSize,
    title_size: titleSize,
    subtitle_size: subtitleSize,
    latex: getString(card, values, traces, 'latex', 'auto'),
    font_family: fontFamily,
    min_gap: Math.max(CHILD_GAP_MIN, getNumber(card, values, traces, 'gap', CHILD_GAP_MIN)),
    semantic_role: 'card',
    semantic_label_role: 'card_title',
    semantic_subtitle_role: 'body_text',
  }, children);
}

async function layoutContainerChildren(
  children: DiagramElement[],
  width: number,
  options: ContainerOptions,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  fontFamily: string,
): Promise<ChildLayout> {
  if (!children.length) return { width, height: 0, elements: [] };
  if (options.layout === 'row') return layoutRowChildren(children, width, options, values, traces, fontFamily);
  if (options.layout === 'columns') return layoutColumnChildren(children, width, options, values, traces, fontFamily);
  return layoutStackChildren(children, width, options, values, traces, fontFamily);
}

async function layoutStackChildren(
  children: DiagramElement[],
  width: number,
  options: ContainerOptions,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  fontFamily: string,
): Promise<ChildLayout> {
  let cursorY = 0;
  let usedWidth = 0;
  const elements: DiagramElement[] = [];
  for (const child of children) {
    const measured = await measureChild(child, width, values, traces, fontFamily);
    const x = resolveAlignedX(options.align, width, measured.width);
    usedWidth = Math.max(usedWidth, measured.width);
    elements.push(...offsetChildren(measured.elements, x, cursorY));
    cursorY += measured.height + options.gap;
  }
  const height = Math.max(0, cursorY - options.gap);
  return { width: Math.min(width, usedWidth || width), height, elements };
}

async function layoutRowChildren(
  children: DiagramElement[],
  width: number,
  options: ContainerOptions,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  fontFamily: string,
): Promise<ChildLayout> {
  const count = Math.max(children.length, 1);
  const naturalMeasured = [];
  for (const child of children) naturalMeasured.push(await measureChild(child, width, values, traces, fontFamily));
  const naturalTotalWidth = naturalMeasured.reduce((sum, entry) => sum + entry.width, 0) + options.gap * Math.max(0, naturalMeasured.length - 1);

  let measured = naturalMeasured;
  let totalWidth = naturalTotalWidth;
  if (naturalTotalWidth > width + 8) {
    const budget = Math.max(84, (width - options.gap * (count - 1)) / count);
    const compactMeasured = [];
    for (const child of children) compactMeasured.push(await measureChild(child, budget, values, traces, fontFamily));
    const compactTotalWidth = compactMeasured.reduce((sum, entry) => sum + entry.width, 0) + options.gap * Math.max(0, compactMeasured.length - 1);
    if (compactTotalWidth > width + 8 && children.length > 1) {
      return layoutStackChildren(children, width, { ...options, align: options.align === 'stretch' ? 'stretch' : 'center' }, values, traces, fontFamily);
    }
    measured = compactMeasured;
    totalWidth = compactTotalWidth;
  }

  const rowHeight = Math.max(...measured.map((entry) => entry.height), 48);
  let cursorX = resolveAlignedX(options.align, width, totalWidth);
  const elements: DiagramElement[] = [];
  measured.forEach((entry) => {
    const y = (rowHeight - entry.height) / 2;
    elements.push(...offsetChildren(entry.elements, cursorX, y));
    cursorX += entry.width + options.gap;
  });
  return { width: Math.min(width, totalWidth), height: rowHeight, elements };
}

async function layoutColumnChildren(
  children: DiagramElement[],
  width: number,
  options: ContainerOptions,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  fontFamily: string,
): Promise<ChildLayout> {
  const columns = Math.max(1, options.columns);
  const cellWidth = (width - options.gap * (columns - 1)) / columns;
  const measured = await Promise.all(children.map((child) => measureChild(child, cellWidth, values, traces, fontFamily)));
  const rowHeights = new Map<number, number>();
  measured.forEach((entry, index) => {
    const row = Math.floor(index / columns);
    rowHeights.set(row, Math.max(rowHeights.get(row) ?? 0, entry.height));
  });

  const elements: DiagramElement[] = [];
  let totalHeight = 0;
  for (let index = 0; index < measured.length; index += 1) {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const y = totalHeight + rowOffset(rowHeights, row, options.gap);
    const rowHeight = rowHeights.get(row) ?? measured[index].height;
    const localX = col * (cellWidth + options.gap) + resolveAlignedX(options.align, cellWidth, measured[index].width);
    const localY = y + (rowHeight - measured[index].height) / 2;
    elements.push(...offsetChildren(measured[index].elements, localX, localY));
  }

  const compactColumnWidths = new Map<number, number>();
  measured.forEach((entry, index) => {
    const col = index % columns;
    compactColumnWidths.set(col, Math.max(compactColumnWidths.get(col) ?? 0, entry.width));
  });
  let usedWidth = 0;
  for (let col = 0; col < columns; col += 1) usedWidth += compactColumnWidths.get(col) ?? 0;
  if (columns > 1) usedWidth += options.gap * (columns - 1);

  if (rowHeights.size > 0) totalHeight = [...rowHeights.values()].reduce((sum, value) => sum + value, 0) + options.gap * Math.max(0, rowHeights.size - 1);
  return { width: Math.min(width, usedWidth || width), height: totalHeight, elements };
}

function rowOffset(rowHeights: Map<number, number>, row: number, gap: number): number {
  let offset = 0;
  for (let current = 0; current < row; current += 1) offset += (rowHeights.get(current) ?? 0) + gap;
  return offset;
}

async function measureChild(
  child: DiagramElement,
  maxWidth: number,
  values: Record<string, GSValue>,
  traces: Map<string, Trace>,
  fontFamily: string,
): Promise<ChildLayout> {
  switch (child.type) {
    case 'text': {
      const fontSize = Math.max(BODY_TEXT_MIN, getNumber(child, values, traces, 'size', BODY_TEXT_MIN));
      const value = getString(child, values, traces, 'value', child.name);
      const weight = getString(child, values, traces, 'weight', '600');
      const align = getString(child, values, traces, 'align', 'center');
      const latex = readLatexMode(resolveValue(child.properties.latex, values, traces), 'auto');
      const metrics = await measureRichTextBlock(value, {
        x: 0,
        y: 0,
        maxWidth,
        fontSize,
        weight,
        anchor: alignToAnchor(align),
        latex,
        maxLines: Math.max(2, getNumber(child, values, traces, 'max_lines', 6)),
        fontFamily,
      });
      const width = Math.min(maxWidth, Math.max(24, metrics.width));
      const height = Math.max(fontSize, metrics.height);
      return {
        width,
        height,
        elements: [
          cloneElement(child, {
            x: align === 'start' ? 0 : align === 'end' ? width : width / 2,
            y: 0,
            w: width,
            h: height,
            anchor: alignToAnchor(align),
            size: fontSize,
            latex,
            font_family: fontFamily,
            math_fallback: metrics.mathFallbackCount > 0,
            normalized_value: metrics.normalizedValue,
            min_gap: CHILD_GAP_MIN,
            semantic_role: getString(child, values, traces, 'semantic_role', 'body_text'),
          }),
        ],
      };
    }
    case 'formula': {
      const fontSize = Math.max(FORMULA_TEXT_MIN, getNumber(child, values, traces, 'size', FORMULA_TEXT_MIN));
      const value = getString(child, values, traces, 'value', child.name);
      const metrics = await measureDisplayFormula(value, { fontSize });
      const constrainedWidth = Math.min(Math.max(metrics.width, 48), maxWidth);
      return {
        width: constrainedWidth,
        height: metrics.height,
        elements: [
          cloneElement(child, {
            x: constrainedWidth / 2,
            y: metrics.ascent,
            w: constrainedWidth,
            h: metrics.height,
            ascent: metrics.ascent,
            size: fontSize,
            math_fallback: metrics.fallback,
            normalized_value: metrics.normalizedValue,
            min_gap: CHILD_GAP_MIN,
            semantic_role: getString(child, values, traces, 'semantic_role', 'display_formula'),
          }),
        ],
      };
    }
    case 'image': {
      const naturalWidth = Math.max(1, getNumber(child, values, traces, 'w', Math.min(maxWidth, 180)));
      const naturalHeight = Math.max(1, getNumber(child, values, traces, 'h', 82));
      const minWidth = Math.min(maxWidth, Math.max(MIN_ASSET_WIDTH, getNumber(child, values, traces, 'min_w', MIN_ASSET_WIDTH)));
      const minHeight = Math.max(MIN_ASSET_HEIGHT, getNumber(child, values, traces, 'min_h', MIN_ASSET_HEIGHT));

      let width = clamp(naturalWidth, Math.min(minWidth, maxWidth), maxWidth);
      let height = naturalHeight * (width / naturalWidth);
      if (height < minHeight) {
        const scaledWidth = naturalWidth * (minHeight / naturalHeight);
        if (scaledWidth <= maxWidth) {
          width = Math.max(width, scaledWidth);
          height = minHeight;
        }
      }

      return {
        width,
        height,
        elements: [
          cloneElement(child, {
            x: 0,
            y: 0,
            w: width,
            h: height,
            semantic_role: getString(child, values, traces, 'semantic_role', 'asset'),
          }),
        ],
      };
    }
    case 'divider': {
      const label = getString(child, values, traces, 'label', '');
      const stroke = getString(child, values, traces, 'stroke', '#cbd5e1');
      const strokeWidth = getNumber(child, values, traces, 'strokeWidth', 1.6);
      const textSize = Math.max(BODY_TEXT_MIN, getNumber(child, values, traces, 'size', BODY_TEXT_MIN));
      let labelHeight = 0;
      const elements: DiagramElement[] = [];
      if (label) {
        const labelMetrics = await measureRichTextBlock(label, {
          x: maxWidth / 2,
          y: 0,
          maxWidth: maxWidth * 0.75,
          fontSize: textSize,
          weight: getString(child, values, traces, 'weight', '700'),
          anchor: 'middle',
          latex: readLatexMode(resolveValue(child.properties.latex, values, traces), 'auto'),
          maxLines: 2,
          fontFamily,
        });
        labelHeight = labelMetrics.height + 8;
        elements.push(element('text', `${child.name}-label`, {
          x: maxWidth / 2,
          y: 0,
          w: maxWidth * 0.75,
          h: labelMetrics.height,
          anchor: 'middle',
          value: label,
          size: textSize,
          weight: getString(child, values, traces, 'weight', '700'),
          color: getString(child, values, traces, 'color', '#64748b'),
          font_family: fontFamily,
          validation_ignore: true,
          semantic_role: 'body_text',
        }));
      }
      elements.push(element('line', `${child.name}-line`, {
        x: 0,
        y: labelHeight + strokeWidth,
        x2: maxWidth,
        y2: labelHeight + strokeWidth,
        stroke,
        strokeWidth,
        validation_ignore: true,
        semantic_role: 'decorative',
      }));
      return {
        width: maxWidth,
        height: labelHeight + strokeWidth * 2 + 6,
        elements,
      };
    }
    case 'spacer': {
      const height = Math.max(0, getNumber(child, values, traces, 'h', getNumber(child, values, traces, 'size', CHILD_GAP_MIN)));
      return { width: 0, height, elements: [] };
    }
    case 'group': {
      const padding = Math.max(0, getNumber(child, values, traces, 'padding', 0));
      const gap = Math.max(CHILD_GAP_MIN, getNumber(child, values, traces, 'gap', CHILD_GAP_MIN));
      const layout = readContainerOptions(child, values, traces, 'stack', gap);
      const hasExplicitWidth = child.properties.w != null;
      let groupWidth = Math.min(maxWidth, Math.max(80, getNumber(child, values, traces, 'w', maxWidth)));
      let innerWidth = Math.max(60, groupWidth - padding * 2);
      let content = await layoutContainerChildren(child.children ?? [], innerWidth, layout, values, traces, fontFamily);
      if (!hasExplicitWidth) {
        groupWidth = clamp(content.width + padding * 2, 80, maxWidth);
        innerWidth = Math.max(60, groupWidth - padding * 2);
        content = await layoutContainerChildren(child.children ?? [], innerWidth, layout, values, traces, fontFamily);
      }
      const fill = getString(child, values, traces, 'fill', 'none');
      const stroke = getString(child, values, traces, 'stroke', 'none');
      const visible = fill !== 'none' || stroke !== 'none' || getBoolean(child, values, traces, 'show_box', false);
      const groupHeight = Math.max(getNumber(child, values, traces, 'min_h', 0), content.height + padding * 2);
      const box = element('box', child.name, {
        x: 0,
        y: 0,
        w: groupWidth,
        h: groupHeight,
        label: '',
        fill,
        stroke,
        radius: getNumber(child, values, traces, 'radius', 12),
        shadow: false,
        strokeWidth: getNumber(child, values, traces, 'strokeWidth', 1.4),
        validation_ignore: !visible,
        min_gap: layout.gap,
        semantic_role: 'group',
      }, offsetChildren(content.elements, padding, padding));
      return {
        width: groupWidth,
        height: groupHeight,
        elements: [box],
      };
    }
    default: {
      const width = Math.min(maxWidth, getNumber(child, values, traces, 'w', maxWidth));
      const height = getNumber(child, values, traces, 'h', 40);
      return {
        width,
        height,
        elements: [cloneElement(child, { x: 0, y: 0, w: width, h: height })],
      };
    }
  }
}

function compactLaneFrames(
  lanes: LaneSpec[],
  cards: CardLayout[],
  contentX: number,
  contentWidth: number,
  laneGap: number,
): LaneSpec[] {
  if (lanes.length <= 1 && !cards.length) return lanes;

  const requiredWidths = new Map<string, number>();
  for (const lane of lanes) {
    const laneCards = cards.filter((card) => card.laneId === lane.id);
    const columnWidths = Array.from({ length: lane.columns }, () => 0);
    let required = Math.max(180, lane.padding * 2 + 120);

    for (const card of laneCards) {
      if (card.span === 1) {
        const colIndex = Math.max(0, Math.min(lane.columns - 1, card.col - 1));
        columnWidths[colIndex] = Math.max(columnWidths[colIndex], card.width);
      }
      required = Math.max(required, card.width + lane.padding * 2);
    }

    const columnPackedWidth = columnWidths.reduce((sum, value) => sum + value, 0)
      + Math.max(0, lane.columns - 1) * lane.gapX
      + lane.padding * 2;
    requiredWidths.set(lane.id, Math.max(required, columnPackedWidth));
  }

  const packedWidth = lanes.reduce((sum, lane) => sum + (requiredWidths.get(lane.id) ?? lane.frame.w), 0)
    + Math.max(0, lanes.length - 1) * laneGap;
  if (packedWidth >= contentWidth - 8) return lanes;

  let cursorX = contentX + Math.max(0, (contentWidth - packedWidth) / 2);
  return lanes.map((lane) => {
    const frameWidth = requiredWidths.get(lane.id) ?? lane.frame.w;
    const nextLane: LaneSpec = {
      ...lane,
      frame: {
        ...lane.frame,
        x: cursorX,
        w: frameWidth,
      },
    };
    cursorX += frameWidth + laneGap;
    return nextLane;
  });
}

export { isSemanticDiagramElement } from './helpers';
