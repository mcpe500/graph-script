import * as fs from 'fs';
import * as path from 'path';
import { FlowDeclaration, ChartDeclaration, TableDeclaration, Plot3dDeclaration, DiagramDeclaration, Scene3dDeclaration, ErdDeclaration, InfraDeclaration, PageDeclaration, PseudoDeclaration } from '../ast/types';
import { GSValue, Trace } from '../runtime/values';
import { renderBarChart, renderLineChart, extractChartConfig, extractDataSeries } from './chart';
import { layoutFlow, renderFlow } from './flow';
import { buildTableData, renderTable } from './table';
import { buildPlot3d, renderPlot3d } from './plot3d';
import { renderDiagram } from './diagram';
import { renderScene3d } from './scene3d';
import { renderErd } from './erd';
import { renderInfra } from './infra';
import { renderPage } from './page';
import { renderPseudoBlock } from './pseudo';

export interface RenderOptions {
  outputDir?: string;
  format?: 'svg';
}

export class Renderer {
  private outputDir: string;

  constructor(options: RenderOptions = {}) {
    this.outputDir = options.outputDir || './output';
  }

  render(
    values: Record<string, GSValue>,
    traces: Map<string, Trace>,
    options: RenderOptions = {}
  ): void {
    const outputDir = options.outputDir || this.outputDir;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const [name, value] of Object.entries(values)) {
      if (value && typeof value === 'object') {
        const decl = value as any;

        if (decl.type === 'FlowDeclaration') {
          this.renderFlow(name, decl as FlowDeclaration, outputDir);
        } else if (decl.type === 'ChartDeclaration') {
          this.renderChart(name, decl as ChartDeclaration, values, traces, outputDir);
        } else if (decl.type === 'TableDeclaration') {
          this.renderTable(name, decl as TableDeclaration, values, traces, outputDir);
        } else if (decl.type === 'Plot3dDeclaration') {
          this.renderPlot3d(name, decl as Plot3dDeclaration, values, traces, outputDir);
        } else if (decl.type === 'DiagramDeclaration') {
          this.renderDiagram(name, decl as DiagramDeclaration, values, traces, outputDir);
        } else if (decl.type === 'Scene3dDeclaration') {
          this.renderScene3d(name, decl as Scene3dDeclaration, values, traces, outputDir);
        } else if (decl.type === 'ErdDeclaration') {
          this.renderErd(name, decl as ErdDeclaration, outputDir);
        } else if (decl.type === 'InfraDeclaration') {
          this.renderInfra(name, decl as InfraDeclaration, values, traces, outputDir);
        } else if (decl.type === 'PageDeclaration') {
          this.renderPage(name, decl as PageDeclaration, values, traces, outputDir);
        } else if (decl.type === 'PseudoDeclaration') {
          this.renderPseudo(name, decl as PseudoDeclaration, outputDir);
        }
      }
    }

    for (const [name, trace] of traces.entries()) {
      if (trace.rows.length > 0) {
        const chartDecl: ChartDeclaration = {
          type: 'ChartDeclaration',
          name,
          properties: {},
          location: { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } }
        };

        this.renderTraceChart(name, trace, chartDecl, outputDir);
      }
    }
  }

  private renderFlow(name: string, flow: FlowDeclaration, outputDir: string): void {
    const layout = layoutFlow(flow);
    const svg = renderFlow(layout, flow.name || name);

    const outputPath = path.join(outputDir, `${name}.svg`);
    fs.writeFileSync(outputPath, svg, 'utf-8');
    console.log(`Rendered flow: ${outputPath}`);
  }

  private renderChart(
    name: string,
    chart: ChartDeclaration,
    values: Record<string, GSValue>,
    traces: Map<string, Trace>,
    outputDir: string
  ): void {
    const config = extractChartConfig(chart, values);
    const series: { name: string; values: number[] }[] = [];

    for (const [key, value] of Object.entries(values)) {
      if (Array.isArray(value) && value.every(v => typeof v === 'number')) {
        series.push({ name: key, values: value as number[] });
      }
    }

    if (series.length === 0) return;

    let svg: string;
    if (config.type === 'line') {
      svg = renderLineChart(config, series);
    } else {
      svg = renderBarChart(config, series);
    }

    const outputPath = path.join(outputDir, `${name}.svg`);
    fs.writeFileSync(outputPath, svg, 'utf-8');
    console.log(`Rendered chart: ${outputPath}`);
  }

  private renderTraceChart(
    name: string,
    trace: Trace,
    chart: ChartDeclaration,
    outputDir: string
  ): void {
    if (trace.rows.length === 0) return;

    const columns = trace.columns;
    const series: { name: string; values: number[] }[] = [];

    for (const col of columns) {
      const values: number[] = [];
      for (const row of trace.rows) {
        const val = row[col];
        if (typeof val === 'number') {
          values.push(val);
        }
      }
      if (values.length > 0) {
        series.push({ name: col, values });
      }
    }

    if (series.length === 0) return;

    const typeProp = chart.properties['type'] as any;
    const chartType = typeProp?.name || 'bar';

    const config = {
      width: 800,
      height: 400,
      type: chartType as 'bar' | 'line' | 'scatter' | 'pie'
    };

    let svg: string;
    if (chartType === 'line') {
      svg = renderLineChart(config, series);
    } else {
      svg = renderBarChart(config, series);
    }

    const outputPath = path.join(outputDir, `${name}-trace.svg`);
    fs.writeFileSync(outputPath, svg, 'utf-8');
    console.log(`Rendered trace chart: ${outputPath}`);
  }

  private renderTable(
    name: string,
    table: TableDeclaration,
    values: Record<string, GSValue>,
    traces: Map<string, Trace>,
    outputDir: string
  ): void {
    const tableData = buildTableData(table, values, traces);
    if (tableData.columns.length === 0 && tableData.rows.length === 0) return;

    const svg = renderTable(tableData);
    const outputPath = path.join(outputDir, `${name}.svg`);
    fs.writeFileSync(outputPath, svg, 'utf-8');
    console.log(`Rendered table: ${outputPath}`);
  }

  private renderPlot3d(
    name: string,
    plot3d: Plot3dDeclaration,
    values: Record<string, GSValue>,
    traces: Map<string, Trace>,
    outputDir: string
  ): void {
    const { config, series } = buildPlot3d(plot3d, values, traces);
    if (!series) return;

    const svg = renderPlot3d(config, series);
    const outputPath = path.join(outputDir, `${name}.svg`);
    fs.writeFileSync(outputPath, svg, 'utf-8');
    console.log(`Rendered plot3d: ${outputPath}`);
  }

  private renderDiagram(
    name: string,
    diagram: DiagramDeclaration,
    values: Record<string, GSValue>,
    traces: Map<string, Trace>,
    outputDir: string
  ): void {
    const renderEmbed = (target: string): string | null => {
      const decl = values[target] as DiagramDeclaration | undefined;
      if (decl?.type === 'DiagramDeclaration') {
        return renderDiagram(decl, values, traces, renderEmbed);
      }
      return null;
    };
    const svg = renderDiagram(diagram, values, traces, renderEmbed);
    const outputPath = path.join(outputDir, `${name}.svg`);
    fs.writeFileSync(outputPath, svg, 'utf-8');
    console.log(`Rendered diagram: ${outputPath}`);
  }

  private renderScene3d(
    name: string,
    scene3d: Scene3dDeclaration,
    values: Record<string, GSValue>,
    traces: Map<string, Trace>,
    outputDir: string
  ): void {
    const svg = renderScene3d(scene3d, values, traces);
    const outputPath = path.join(outputDir, `${name}.svg`);
    fs.writeFileSync(outputPath, svg, 'utf-8');
    console.log(`Rendered scene3d: ${outputPath}`);
  }

  private renderErd(
    name: string,
    erd: ErdDeclaration,
    outputDir: string
  ): void {
    const svg = renderErd(erd);
    const outputPath = path.join(outputDir, `${name}.svg`);
    fs.writeFileSync(outputPath, svg, 'utf-8');
    console.log(`Rendered erd: ${outputPath}`);
  }

  private renderInfra(
    name: string,
    infra: InfraDeclaration,
    values: Record<string, GSValue>,
    traces: Map<string, Trace>,
    outputDir: string
  ): void {
    const svg = renderInfra(infra, values, traces);
    const outputPath = path.join(outputDir, `${name}.svg`);
    fs.writeFileSync(outputPath, svg, 'utf-8');
    console.log(`Rendered infra: ${outputPath}`);
  }

  private renderPage(
    name: string,
    page: PageDeclaration,
    values: Record<string, GSValue>,
    traces: Map<string, Trace>,
    outputDir: string
  ): void {
    const renderEmbed = (target: string): string | null => {
      const decl = values[target] as any;
      if (!decl) return null;
      switch (decl.type) {
        case 'ChartDeclaration':
          return '';
        case 'FlowDeclaration':
          return '';
        case 'TableDeclaration':
          return '';
        case 'DiagramDeclaration':
          return renderDiagram(decl as DiagramDeclaration, values, traces, renderEmbed);
        case 'Scene3dDeclaration':
          return renderScene3d(decl as Scene3dDeclaration, values, traces);
        case 'ErdDeclaration':
          return renderErd(decl as ErdDeclaration);
        case 'InfraDeclaration':
          return renderInfra(decl as InfraDeclaration, values, traces);
        case 'PseudoDeclaration':
          return renderPseudoBlock(decl as PseudoDeclaration);
        default:
          return null;
      }
    };
    const svg = renderPage(page, values, traces, renderEmbed);
    const outputPath = path.join(outputDir, `${name}.svg`);
    fs.writeFileSync(outputPath, svg, 'utf-8');
    console.log(`Rendered page: ${outputPath}`);
  }

  private renderPseudo(
    name: string,
    pseudo: PseudoDeclaration,
    outputDir: string
  ): void {
    const svg = renderPseudoBlock(pseudo);
    const outputPath = path.join(outputDir, `${name}.svg`);
    fs.writeFileSync(outputPath, svg, 'utf-8');
    console.log(`Rendered pseudo: ${outputPath}`);
  }
}
