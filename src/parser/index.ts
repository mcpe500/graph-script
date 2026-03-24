import {
  AlgoDeclaration,
  Binding,
  ChartDeclaration,
  ComponentDeclaration,
  ConstDeclaration,
  DataDeclaration,
  DiagramDeclaration,
  DiagramElement,
  ErdDeclaration,
  ErdField,
  ErdRelationship,
  ErdTable,
  Expression,
  FlowDeclaration,
  FlowEdge,
  FlowNode,
  FuncDeclaration,
  IfStatement,
  ImportStatement,
  InfraConnection,
  InfraDeclaration,
  InfraElement,
  PageDeclaration,
  PagePlacement,
  Plot3dDeclaration,
  Position,
  Program,
  PseudoDeclaration,
  RenderDeclaration,
  RenderTarget,
  Scene3dDeclaration,
  Scene3dElement,
  SourceLocation,
  Statement,
  StyleDeclaration,
  SubDeclaration,
  TableDeclaration,
  ThemeDeclaration,
  TopLevelNode,
  UseStatement,
} from '../ast/types';
import { Tokenizer } from '../tokenizer';
import { ExpressionParser } from './expressions';

interface LineInfo {
  raw: string;
  text: string;
  indent: number;
  line: number;
}

export class Parser {
  private lines: LineInfo[] = [];
  private index = 0;

  parse(source: string): Program {
    this.lines = source.replace(/\r\n/g, '\n').split('\n').map((raw, idx) => ({
      raw,
      text: raw.trim(),
      indent: raw.match(/^ */)?.[0].length ?? 0,
      line: idx + 1,
    }));
    this.index = 0;

    const start = this.makePos(1, 1, 0);
    const body = this.parseTopLevelBlock(0);
    const endLine = this.lines[this.lines.length - 1]?.line ?? 1;
    return { type: 'Program', body, location: { start, end: this.makePos(endLine, 1, 0) } };
  }

  private parseTopLevelBlock(indent: number): TopLevelNode[] {
    const nodes: TopLevelNode[] = [];
    while (!this.eof()) {
      const line = this.peekMeaningful();
      if (!line) break;
      if (line.indent < indent) break;
      if (line.indent > indent) {
        this.index += 1;
        continue;
      }
      nodes.push(this.parseTopLevel(line));
    }
    return nodes;
  }

  private parseTopLevel(line: LineInfo): TopLevelNode {
    const text = line.text;

    if (text.startsWith('use ')) return this.parseUse(line);
    if (text.startsWith('import ')) return this.parseImport(line);
    if (text.startsWith('const ')) return this.parseConst(line);
    if (text === 'data:') return this.parseData(line);
    if (text.startsWith('func ')) return this.parseFunc(line);
    if (text.startsWith('theme ')) return this.parseTheme(line);
    if (text.startsWith('style ')) return this.parseStyle(line);
    if (text.startsWith('sub ')) return this.parseSub(line);
    if (text.startsWith('component ')) return this.parseComponent(line);
    if (text.startsWith('algo ')) return this.parseAlgo(line);
    if (text.startsWith('pseudo ')) return this.parsePseudo(line);
    if (text.startsWith('chart ')) return this.parseChart(line);
    if (text.startsWith('flow ')) return this.parseFlow(line);
    if (text.startsWith('diagram ')) return this.parseDiagram(line);
    if (text.startsWith('table ')) return this.parseTable(line);
    if (text.startsWith('plot3d ')) return this.parsePlot3d(line);
    if (text.startsWith('scene3d ')) return this.parseScene3d(line);
    if (text.startsWith('erd ')) return this.parseErd(line);
    if (text.startsWith('infra ')) return this.parseInfra(line);
    if (text.startsWith('page ')) return this.parsePage(line);
    if (text === 'render:') return this.parseRender(line);

    throw new Error(`Unsupported top-level declaration at line ${line.line}: ${line.text}`);
  }

  private parseUse(line: LineInfo): UseStatement {
    this.index += 1;
    return { type: 'UseStatement', module: line.text.slice(4).trim(), location: this.lineLoc(line) };
  }

  private parseImport(line: LineInfo): ImportStatement {
    this.index += 1;
    const m = line.text.match(/^import\s+['"](.+?)['"]$/);
    if (!m) throw new Error(`Invalid import at line ${line.line}`);
    return { type: 'ImportStatement', path: m[1], location: this.lineLoc(line) };
  }

  private parseConst(line: LineInfo): ConstDeclaration {
    this.index += 1;
    const m = line.text.match(/^const\s+([A-Za-z_][\w]*)\s*=\s*(.+)$/);
    if (!m) throw new Error(`Invalid const declaration at line ${line.line}`);
    return {
      type: 'ConstDeclaration',
      name: m[1],
      value: this.parseExpressionText(m[2], line.line),
      location: this.lineLoc(line),
    };
  }

  private parseData(line: LineInfo): DataDeclaration {
    this.index += 1;
    const childIndent = this.nextChildIndent(line.indent);
    const bindings: Binding[] = [];
    if (childIndent === null) {
      return { type: 'DataDeclaration', bindings, location: this.lineLoc(line) };
    }

    while (!this.eof()) {
      const current = this.peekMeaningful();
      if (!current || current.indent < childIndent) break;
      if (current.indent > childIndent) {
        this.index += 1;
        continue;
      }
      const m = current.text.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
      if (!m) throw new Error(`Invalid data binding at line ${current.line}`);
      bindings.push({ name: m[1], value: this.parseExpressionText(m[2], current.line) });
      this.index += 1;
    }

    return { type: 'DataDeclaration', bindings, location: this.lineLoc(line) };
  }

  private parseFunc(line: LineInfo): FuncDeclaration {
    const { name, params } = this.parseHeaderWithParams(line, 'func');
    this.index += 1;
    const body = this.parseStatementSuite(line.indent);
    return { type: 'FuncDeclaration', name, params, body, location: this.lineLoc(line) };
  }

  private parseAlgo(line: LineInfo): AlgoDeclaration {
    const { name, params } = this.parseHeaderWithParams(line, 'algo');
    this.index += 1;
    const body = this.parseStatementSuite(line.indent);
    return { type: 'AlgoDeclaration', name, params, body, location: this.lineLoc(line) };
  }

  private parseTheme(line: LineInfo): ThemeDeclaration {
    this.index += 1;
    const name = line.text.slice(6, -1).trim();
    return { type: 'ThemeDeclaration', name, properties: this.parsePropertyBlock(line.indent), location: this.lineLoc(line) };
  }

  private parseStyle(line: LineInfo): StyleDeclaration {
    this.index += 1;
    const name = line.text.slice(6, -1).trim();
    return { type: 'StyleDeclaration', name, properties: this.parsePropertyBlock(line.indent), location: this.lineLoc(line) };
  }

  private parseSub(line: LineInfo): SubDeclaration {
    const { name, params } = this.parseHeaderWithParams(line, 'sub');
    this.index += 1;
    const childIndent = this.nextChildIndent(line.indent);
    const body = childIndent === null ? [] : this.parseTopLevelBlock(childIndent);
    return { type: 'SubDeclaration', name, params, body, location: this.lineLoc(line) };
  }

  private parseComponent(line: LineInfo): ComponentDeclaration {
    this.index += 1;
    const m = line.text.match(/^component\s+([A-Za-z_][\w]*)\s*=\s*([A-Za-z_][\w]*)\((.*)\)$/);
    if (!m) throw new Error(`Invalid component declaration at line ${line.line}`);
    const [, name, module, rawArgs] = m;
    const args: Record<string, Expression> = {};
    for (const part of this.splitCommaArgs(rawArgs)) {
      if (!part.trim()) continue;
      const argMatch = part.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
      if (!argMatch) continue;
      args[argMatch[1]] = this.parseExpressionText(argMatch[2], line.line);
    }
    return { type: 'ComponentDeclaration', name, module, args, location: this.lineLoc(line) };
  }

  private parsePseudo(line: LineInfo): PseudoDeclaration {
    this.index += 1;
    const name = this.parseTitledBlockName(line.text.slice('pseudo'.length).trim(), line.line);
    const childIndent = this.nextChildIndent(line.indent);
    const lines: string[] = [];
    if (childIndent !== null) {
      while (!this.eof()) {
        const current = this.peekMeaningful();
        if (!current || current.indent < childIndent) break;
        lines.push(current.raw.slice(childIndent));
        this.index += 1;
      }
    }
    return { type: 'PseudoDeclaration', name, lines, location: this.lineLoc(line) };
  }

  private parseChart(line: LineInfo): ChartDeclaration {
    this.index += 1;
    const name = this.parseTitledBlockName(line.text.slice('chart'.length).trim(), line.line);
    return { type: 'ChartDeclaration', name, properties: this.parsePropertyBlock(line.indent), location: this.lineLoc(line) };
  }

  private parseFlow(line: LineInfo): FlowDeclaration {
    this.index += 1;
    const name = this.parseTitledBlockName(line.text.slice('flow'.length).trim(), line.line);
    const childIndent = this.nextChildIndent(line.indent);
    const properties: Record<string, Expression> = {};
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];

    if (childIndent !== null) {
      while (!this.eof()) {
        const current = this.peekMeaningful();
        if (!current || current.indent < childIndent) break;
        if (current.indent > childIndent) {
          this.index += 1;
          continue;
        }

        if (current.text.startsWith('node ')) {
          const m = current.text.match(/^node\s+([A-Za-z_][\w]*)\s*(.*)$/);
          if (!m) throw new Error(`Invalid flow node at line ${current.line}`);
          const attrs = this.parseSimpleAttributes(m[2]);
          nodes.push({
            type: 'FlowNode',
            id: m[1],
            nodeType: attrs.type,
            label: attrs.label,
          });
          this.index += 1;
          continue;
        }

        if (current.text.includes('->')) {
          const m = current.text.match(/^([A-Za-z_][\w]*)\s*->\s*([A-Za-z_][\w]*)(?:\s+label\s*=\s*(.+))?$/);
          if (!m) throw new Error(`Invalid flow edge at line ${current.line}`);
          edges.push({
            type: 'FlowEdge',
            from: m[1],
            to: m[2],
            label: m[3] ? this.parseInlineString(m[3].trim()) : undefined,
          });
          this.index += 1;
          continue;
        }

        const prop = current.text.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
        if (prop) {
          properties[prop[1]] = this.parseExpressionText(prop[2], current.line);
        }
        this.index += 1;
      }
    }

    return { type: 'FlowDeclaration', name, properties, nodes, edges, location: this.lineLoc(line) };
  }

  private parseDiagram(line: LineInfo): DiagramDeclaration {
    this.index += 1;
    const name = this.parseTitledBlockName(line.text.slice('diagram'.length).trim(), line.line);
    const childIndent = this.nextChildIndent(line.indent);
    const properties: Record<string, Expression> = {};
    let elements: DiagramElement[] = [];

    if (childIndent !== null) {
      while (!this.eof()) {
        const current = this.peekMeaningful();
        if (!current || current.indent < childIndent) break;
        if (current.indent > childIndent) {
          this.index += 1;
          continue;
        }

        if (this.isPropertyLine(current.text)) {
          const match = current.text.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
          if (match) properties[match[1]] = this.parseExpressionText(match[2], current.line);
          this.index += 1;
          continue;
        }

        elements = this.parseDiagramElements(childIndent);
        break;
      }
    }

    return { type: 'DiagramDeclaration', name, properties, elements, location: this.lineLoc(line) };
  }

  private parseDiagramElements(indent: number): DiagramElement[] {
    const elements: DiagramElement[] = [];
    while (!this.eof()) {
      const line = this.peekMeaningful();
      if (!line || line.indent < indent) break;
      if (line.indent > indent) {
        this.index += 1;
        continue;
      }
      elements.push(this.parseDiagramElement(line, indent));
    }
    return elements;
  }

  private parseDiagramElement(line: LineInfo, indent: number): DiagramElement {
    const { header, hasChildren } = this.splitHeaderAndChildren(line.text);
    const match = header.match(/^([A-Za-z_][\w]*)\s+([A-Za-z_][\w-]*|"[^"]+"|'[^']+')\s*(.*)$/);
    if (!match) throw new Error(`Invalid diagram element at line ${line.line}`);
    const [, type, rawName, rawAttrs] = match;
    const properties = this.parseAttributeExpressions(rawAttrs, line.line);
    const element: DiagramElement = {
      type,
      name: this.parseInlineString(rawName),
      properties,
    };
    this.index += 1;

    if (hasChildren) {
      const childIndent = this.nextChildIndent(indent);
      if (childIndent !== null) element.children = this.parseDiagramElements(childIndent);
    }

    return element;
  }

  private parseTable(line: LineInfo): TableDeclaration {
    this.index += 1;
    const name = this.parseTitledBlockName(line.text.slice('table'.length).trim(), line.line);
    return { type: 'TableDeclaration', name, properties: this.parsePropertyBlock(line.indent), location: this.lineLoc(line) };
  }

  private parsePlot3d(line: LineInfo): Plot3dDeclaration {
    this.index += 1;
    const name = this.parseTitledBlockName(line.text.slice('plot3d'.length).trim(), line.line);
    return { type: 'Plot3dDeclaration', name, properties: this.parsePropertyBlock(line.indent), location: this.lineLoc(line) };
  }

  private parseScene3d(line: LineInfo): Scene3dDeclaration {
    this.index += 1;
    const name = this.parseTitledBlockName(line.text.slice('scene3d'.length).trim(), line.line);
    const childIndent = this.nextChildIndent(line.indent);
    const properties: Record<string, Expression> = {};
    const elements: Scene3dElement[] = [];

    if (childIndent !== null) {
      while (!this.eof()) {
        const current = this.peekMeaningful();
        if (!current || current.indent < childIndent) break;
        if (current.indent > childIndent) {
          this.index += 1;
          continue;
        }

        if (this.isPropertyLine(current.text)) {
          const match = current.text.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
          if (match) properties[match[1]] = this.parseExpressionText(match[2], current.line);
          this.index += 1;
          continue;
        }

        const elemMatch = current.text.match(/^([A-Za-z_][\w]*)\s+([A-Za-z_][\w-]*|"[^"]+"|'[^']+')\s*(.*)$/);
        if (!elemMatch) throw new Error(`Invalid scene3d element at line ${current.line}`);
        elements.push({
          type: elemMatch[1],
          name: this.parseInlineString(elemMatch[2]),
          properties: this.parseAttributeExpressions(elemMatch[3], current.line),
        });
        this.index += 1;
      }
    }

    return { type: 'Scene3dDeclaration', name, properties, elements, location: this.lineLoc(line) };
  }

  private parseErd(line: LineInfo): ErdDeclaration {
    this.index += 1;
    const name = this.parseTitledBlockName(line.text.slice('erd'.length).trim(), line.line);
    const childIndent = this.nextChildIndent(line.indent);
    const tables: ErdTable[] = [];
    const relationships: ErdRelationship[] = [];

    if (childIndent !== null) {
      while (!this.eof()) {
        const current = this.peekMeaningful();
        if (!current || current.indent < childIndent) break;
        if (current.indent > childIndent) {
          this.index += 1;
          continue;
        }

        if (current.text.startsWith('table ')) {
          const tableMatch = current.text.match(/^table\s+([A-Za-z_][\w]*)\s*:$/);
          if (!tableMatch) throw new Error(`Invalid ERD table at line ${current.line}`);
          this.index += 1;
          const fieldIndent = this.nextChildIndent(current.indent);
          const fields: ErdField[] = [];
          if (fieldIndent !== null) {
            while (!this.eof()) {
              const fieldLine = this.peekMeaningful();
              if (!fieldLine || fieldLine.indent < fieldIndent) break;
              if (fieldLine.indent > fieldIndent) {
                this.index += 1;
                continue;
              }
              const fieldMatch = fieldLine.text.match(/^([A-Za-z_][\w]*)\s*:\s*([A-Za-z_][\w\[\]]*)(.*)$/);
              if (!fieldMatch) throw new Error(`Invalid ERD field at line ${fieldLine.line}`);
              const constraints = fieldMatch[3].trim() ? fieldMatch[3].trim().split(/\s+/) : [];
              fields.push({ name: fieldMatch[1], fieldType: fieldMatch[2], constraints });
              this.index += 1;
            }
          }
          tables.push({ name: tableMatch[1], fields });
          continue;
        }

        const relMatch = current.text.match(/^([A-Za-z_][\w.]+)\s*->\s*([A-Za-z_][\w.]+)(?:\s+([A-Za-z_\-]+))?$/);
        if (relMatch) {
          relationships.push({ from: relMatch[1], to: relMatch[2], cardinality: relMatch[3] ?? 'related' });
        }
        this.index += 1;
      }
    }

    return { type: 'ErdDeclaration', name, tables, relationships, location: this.lineLoc(line) };
  }

  private parseInfra(line: LineInfo): InfraDeclaration {
    this.index += 1;
    const header = line.text.match(/^infra\s+([A-Za-z_][\w.]*)\s+(.+)$/);
    if (!header) throw new Error(`Invalid infra declaration at line ${line.line}`);
    const provider = header[1];
    const name = this.parseTitledBlockName(header[2].trim(), line.line);
    const childIndent = this.nextChildIndent(line.indent);
    const properties: Record<string, Expression> = {};
    const elements: InfraElement[] = [];
    const connections: InfraConnection[] = [];

    if (childIndent !== null) {
      while (!this.eof()) {
        const current = this.peekMeaningful();
        if (!current || current.indent < childIndent) break;
        if (current.indent > childIndent) {
          this.index += 1;
          continue;
        }

        if (this.isPropertyLine(current.text)) {
          const match = current.text.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
          if (match) properties[match[1]] = this.parseExpressionText(match[2], current.line);
          this.index += 1;
          continue;
        }

        if (current.text.includes('->')) {
          const edgeMatch = current.text.match(/^([A-Za-z_][\w-]*)\s*->\s*([A-Za-z_][\w-]*)(?:\s+label\s*=\s*(.+))?$/);
          if (!edgeMatch) throw new Error(`Invalid infra connection at line ${current.line}`);
          connections.push({ from: edgeMatch[1], to: edgeMatch[2], label: edgeMatch[3] ? this.parseInlineString(edgeMatch[3]) : undefined });
          this.index += 1;
          continue;
        }

        const elemMatch = current.text.match(/^([A-Za-z_][\w]*)\s+([A-Za-z_][\w-]*|"[^"]+"|'[^']+')\s*(.*)$/);
        if (!elemMatch) throw new Error(`Invalid infra element at line ${current.line}`);
        elements.push({
          type: elemMatch[1],
          name: this.parseInlineString(elemMatch[2]),
          properties: this.parseAttributeExpressions(elemMatch[3], current.line),
        });
        this.index += 1;
      }
    }

    return { type: 'InfraDeclaration', provider, name, properties, elements, connections, location: this.lineLoc(line) };
  }

  private parsePage(line: LineInfo): PageDeclaration {
    this.index += 1;
    const name = this.parseTitledBlockName(line.text.slice('page'.length).trim(), line.line);
    const childIndent = this.nextChildIndent(line.indent);
    const properties: Record<string, Expression> = {};
    const placements: PagePlacement[] = [];

    if (childIndent !== null) {
      while (!this.eof()) {
        const current = this.peekMeaningful();
        if (!current || current.indent < childIndent) break;
        if (current.indent > childIndent) {
          this.index += 1;
          continue;
        }

        const placeMatch = current.text.match(/^place\s+(.+?)\s+at\s+(.+)$/);
        if (placeMatch) {
          placements.push({
            target: this.parseInlineString(placeMatch[1].trim()),
            position: placeMatch[2].trim(),
          });
          this.index += 1;
          continue;
        }

        const propMatch = current.text.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
        if (propMatch) {
          properties[propMatch[1]] = this.parseExpressionText(propMatch[2], current.line);
        }
        this.index += 1;
      }
    }

    return {
      type: 'PageDeclaration',
      name,
      properties,
      placements,
      location: this.lineLoc(line),
    };
  }

  private parseRender(line: LineInfo): RenderDeclaration {
    this.index += 1;
    const childIndent = this.nextChildIndent(line.indent);
    const targets: RenderTarget[] = [];
    if (childIndent !== null) {
      while (!this.eof()) {
        const current = this.peekMeaningful();
        if (!current || current.indent < childIndent) break;
        const m = current.text.match(/^target\s+([A-Za-z_][\w]*)\s+(.+?)\s+to\s+['"](.+?)['"]$/);
        if (m) {
          targets.push({ kind: m[1], name: this.parseInlineString(m[2].trim()), output: m[3] });
        }
        this.index += 1;
      }
    }
    return { type: 'RenderDeclaration', targets, location: this.lineLoc(line) };
  }

  private parseStatementSuite(parentIndent: number): Statement[] {
    const childIndent = this.nextChildIndent(parentIndent);
    if (childIndent === null) return [];
    return this.parseStatements(childIndent);
  }

  private parseStatements(indent: number): Statement[] {
    const statements: Statement[] = [];

    while (!this.eof()) {
      const line = this.peekMeaningful();
      if (!line) break;
      if (line.indent < indent) break;
      if (line.indent > indent) {
        this.index += 1;
        continue;
      }
      if (line.text.startsWith('else')) break;
      statements.push(this.parseStatement(line, indent));
    }

    return statements;
  }

  private parseStatement(line: LineInfo, indent: number): Statement {
    const text = line.text;

    if (text.startsWith('if ') && text.endsWith(':')) return this.parseIfStatement(line, indent);
    if (text.startsWith('while ') && text.endsWith(':')) return this.parseWhileStatement(line);
    if (text.startsWith('for ') && text.endsWith(':')) return this.parseForStatement(line);
    if (text === 'emit:') return this.parseEmitStatement(line);
    if (text === 'break') {
      this.index += 1;
      return { type: 'BreakStatement', location: this.lineLoc(line) };
    }
    if (text === 'continue') {
      this.index += 1;
      return { type: 'ContinueStatement', location: this.lineLoc(line) };
    }
    if (text.startsWith('return')) {
      this.index += 1;
      const rest = text.slice('return'.length).trim();
      return {
        type: 'ReturnStatement',
        value: rest ? this.parseExpressionText(rest, line.line) : undefined,
        location: this.lineLoc(line),
      };
    }

    const assign = text.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
    if (assign) {
      this.index += 1;
      return {
        type: 'AssignmentStatement',
        target: assign[1],
        value: this.parseExpressionText(assign[2], line.line),
        location: this.lineLoc(line),
      };
    }

    this.index += 1;
    const expression = this.parseExpressionText(text, line.line);
    return { type: 'ExpressionStatement', expression, location: this.lineLoc(line) };
  }

  private parseIfStatement(line: LineInfo, indent: number): IfStatement {
    const conditionText = line.text.slice(2, -1).trim();
    this.index += 1;
    const thenBranch = this.parseStatementSuite(indent);
    const elseIfBranches: { condition: Expression; body: Statement[] }[] = [];
    let elseBranch: Statement[] | undefined;

    while (!this.eof()) {
      const current = this.peekMeaningful();
      if (!current || current.indent !== indent) break;
      if (current.text.startsWith('else if ') && current.text.endsWith(':')) {
        const condText = current.text.slice('else if'.length, -1).trim();
        this.index += 1;
        elseIfBranches.push({
          condition: this.parseExpressionText(condText, current.line),
          body: this.parseStatementSuite(indent),
        });
        continue;
      }
      if (current.text === 'else:') {
        this.index += 1;
        elseBranch = this.parseStatementSuite(indent);
      }
      break;
    }

    return {
      type: 'IfStatement',
      condition: this.parseExpressionText(conditionText, line.line),
      thenBranch,
      elseIfBranches,
      elseBranch,
      location: this.lineLoc(line),
    };
  }

  private parseWhileStatement(line: LineInfo): Statement {
    const conditionText = line.text.slice('while'.length, -1).trim();
    this.index += 1;
    return {
      type: 'WhileStatement',
      condition: this.parseExpressionText(conditionText, line.line),
      body: this.parseStatementSuite(line.indent),
      location: this.lineLoc(line),
    };
  }

  private parseForStatement(line: LineInfo): Statement {
    const m = line.text.match(/^for\s+([A-Za-z_][\w]*)\s+in\s+(.+):$/);
    if (!m) throw new Error(`Invalid for statement at line ${line.line}`);
    this.index += 1;
    return {
      type: 'ForStatement',
      variable: m[1],
      iterable: this.parseExpressionText(m[2], line.line),
      body: this.parseStatementSuite(line.indent),
      location: this.lineLoc(line),
    };
  }

  private parseEmitStatement(line: LineInfo): Statement {
    this.index += 1;
    const childIndent = this.nextChildIndent(line.indent);
    const fields: { name: string; value: Expression }[] = [];
    if (childIndent !== null) {
      while (!this.eof()) {
        const current = this.peekMeaningful();
        if (!current || current.indent < childIndent) break;
        const m = current.text.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
        if (!m) throw new Error(`Invalid emit field at line ${current.line}`);
        fields.push({ name: m[1], value: this.parseExpressionText(m[2], current.line) });
        this.index += 1;
      }
    }
    return { type: 'EmitStatement', fields, location: this.lineLoc(line) };
  }

  private parsePropertyBlock(parentIndent: number): Record<string, Expression> {
    const childIndent = this.nextChildIndent(parentIndent);
    const props: Record<string, Expression> = {};
    if (childIndent === null) return props;

    while (!this.eof()) {
      const line = this.peekMeaningful();
      if (!line || line.indent < childIndent) break;
      if (line.indent > childIndent) {
        this.index += 1;
        continue;
      }
      const m = line.text.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
      if (m) props[m[1]] = this.parseExpressionText(m[2], line.line);
      this.index += 1;
    }

    return props;
  }

  private parseHeaderWithParams(line: LineInfo, keyword: string): { name: string; params: string[] } {
    const regex = new RegExp(`^${keyword}\\s+([A-Za-z_][\\w]*)\\((.*)\\):$`);
    const m = line.text.match(regex);
    if (!m) throw new Error(`Invalid ${keyword} declaration at line ${line.line}`);
    return { name: m[1], params: this.splitCommaArgs(m[2]).map((p) => p.trim()).filter(Boolean) };
  }

  private parseExpressionText(text: string, lineNumber: number): Expression {
    const tokenizer = new Tokenizer();
    const tokens = tokenizer.tokenize(text);
    let pos = 0;
    const parser = new ExpressionParser(
      tokens,
      pos,
      () => tokens[pos] ?? tokens[tokens.length - 1],
      () => tokens[pos++] ?? tokens[tokens.length - 1],
      (type, value) => {
        const token = tokens[pos] ?? tokens[tokens.length - 1];
        return token.type === type && (value === undefined || token.value === value);
      },
      () => (tokens[pos] ?? tokens[tokens.length - 1]).location.start,
    );

    try {
      return parser.parseExpression();
    } catch (error: any) {
      throw new Error(`Expression parse error on line ${lineNumber}: ${error.message}`);
    }
  }

  private isPropertyLine(text: string): boolean {
    return /^[A-Za-z_][\w]*\s*=\s*.+$/.test(text);
  }

  private splitHeaderAndChildren(text: string): { header: string; hasChildren: boolean } {
    const trimmed = text.trim();
    if (trimmed.endsWith(':')) {
      return { header: trimmed.slice(0, -1).trim(), hasChildren: true };
    }
    return { header: trimmed, hasChildren: false };
  }

  private parseAttributeExpressions(raw: string, lineNumber: number): Record<string, Expression> {
    const attrs: Record<string, Expression> = {};
    const regex = /([A-Za-z_][\w]*)\s*=\s*("[^"]*"|'[^']*'|\[[^\]]*\]|\{[^\}]*\}|\([^\)]*\)|[^\s]+)/g;
    for (const match of raw.matchAll(regex)) {
      attrs[match[1]] = this.parseExpressionText(match[2], lineNumber);
    }
    return attrs;
  }

  private parseTitledBlockName(rest: string, lineNumber: number): string {
    const trimmed = rest.trim();
    if (!trimmed.endsWith(':')) throw new Error(`Expected ':' at line ${lineNumber}`);
    return this.parseInlineString(trimmed.slice(0, -1).trim());
  }

  private parseInlineString(text: string): string {
    const trimmed = text.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  private parseSimpleAttributes(raw: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const regex = /([A-Za-z_][\w]*)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)/g;
    for (const match of raw.matchAll(regex)) {
      attrs[match[1]] = this.parseInlineString(match[2]);
    }
    return attrs;
  }

  private splitCommaArgs(raw: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let quote: string | null = null;

    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i];
      if (quote) {
        current += ch;
        if (ch === quote && raw[i - 1] !== '\\') quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        current += ch;
        continue;
      }
      if (['(', '[', '{'].includes(ch)) depth += 1;
      if ([')', ']', '}'].includes(ch)) depth -= 1;
      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  private nextChildIndent(parentIndent: number): number | null {
    let j = this.index;
    while (j < this.lines.length) {
      const line = this.lines[j];
      if (!line.text || line.text.startsWith('#')) {
        j += 1;
        continue;
      }
      if (line.indent <= parentIndent) return null;
      return line.indent;
    }
    return null;
  }

  private peekMeaningful(): LineInfo | null {
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (!line.text || line.text.startsWith('#')) {
        this.index += 1;
        continue;
      }
      return line;
    }
    return null;
  }

  private eof(): boolean {
    return this.index >= this.lines.length;
  }

  private lineLoc(line: LineInfo): SourceLocation {
    return {
      start: this.makePos(line.line, line.indent + 1, 0),
      end: this.makePos(line.line, line.raw.length + 1, 0),
    };
  }

  private makePos(line: number, column: number, offset: number): Position {
    return { line, column, offset };
  }
}
