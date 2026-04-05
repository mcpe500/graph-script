import { getPlatform } from '../platform/global';
import { NodePlatform } from '../platform/node';
import {
  ChartDeclaration,
  DiagramDeclaration,
  ErdDeclaration,
  FlowDeclaration,
  InfraDeclaration,
  PageDeclaration,
  Plot3dDeclaration,
  PseudoDeclaration,
  Scene3dDeclaration,
  TableDeclaration,
} from '../ast/types';
import { GSValue, Trace } from '../runtime/values';
import { buildChartSeries, extractChartConfig, renderChart } from './chart';
import { renderDiagram } from './diagram';
import { renderErd } from './erd';
import { layoutFlow, renderFlow } from './flow';
import { renderInfra } from './infra';
import { renderPage } from './page';
import { buildPlot3d, renderPlot3d } from './plot3d';
import { renderPseudoBlock } from './pseudo';
import { renderScene3d } from './scene3d';
import { planTableLayout, renderTable } from './table';
import { isValidatableDeclaration, validateAndAdjust, writeValidationReport, ValidationReport } from './validator';

export interface RenderOptions {
  outputDir?: string;
  format?: 'svg' | 'png' | 'jpg';
  scale?: number;
  quality?: number;
  fontScale?: number;
  imageScale?: number;
  fillImages?: boolean;
  baseDir?: string;
  skipValidation?: boolean;
  validationReport?: boolean;
}

export interface RenderResult {
  svg: string;
  name: string;
  type: string;
  validation?: ValidationReport;
}

export class Renderer {
  constructor(private options: RenderOptions = {}) {}

  async renderToString(
    values: Record<string, GSValue>,
    traces: Map<string, Trace>,
    options: RenderOptions = {},
  ): Promise<RenderResult[]> {
    const baseDir = options.baseDir || this.options.baseDir || getPlatform().joinPath('.', '');
    const skipValidation = options.skipValidation ?? this.options.skipValidation ?? false;
    const generateReport = options.validationReport ?? this.options.validationReport ?? false;
    const fontScale = options.fontScale ?? this.options.fontScale ?? 1;
    const imageScale = options.imageScale ?? this.options.imageScale ?? 1;
    const fillImages = options.fillImages ?? this.options.fillImages ?? false;

    const results: RenderResult[] = [];

    for (const [name, value] of Object.entries(values)) {
      if (!value || typeof value !== 'object') continue;
      const decl = value as any;

      let declToRender = decl;
      let report: ValidationReport | null = null;

      if (!skipValidation && isValidatableDeclaration(decl.type)) {
        const result = await validateAndAdjust(decl, values, traces);
        declToRender = result.adjustedDecl;
        report = result.report;

        if (!result.validation.valid || generateReport) {
          if (generateReport) {
            console.warn(`Validation issues in "${decl.name || name}": ${report?.issues?.length ?? 0} issue(s)`);
          }

          if (!result.validation.valid) {
            console.warn(`Warning: Validation issues in "${decl.name || name}".`);
          }
        }
      }

      const svg = await this.renderDeclaration(name, declToRender, values, traces, baseDir, { fontScale, imageScale, fillImages });
      if (!svg) continue;

      results.push({
        svg,
        name: declToRender.name || name,
        type: declToRender.type.replace('Declaration', '').toLowerCase(),
        validation: report ?? undefined,
      });
    }

    return results;
  }

  async render(values: Record<string, GSValue>, traces: Map<string, Trace>, options: RenderOptions = {}): Promise<void> {
    const platform = getPlatform();
    if (!(platform instanceof NodePlatform)) {
      throw new Error('Renderer.render() (file output) is only available in Node.js. Use renderToString() for browser.');
    }

    const outputDir = options.outputDir || this.options.outputDir || './output';
    const format = options.format ?? this.options.format ?? 'svg';
    const scale = options.scale ?? this.options.scale ?? 1;
    const quality = options.quality ?? this.options.quality ?? 90;

    platform.ensureDir(outputDir);

    const results = await this.renderToString(values, traces, options);

    for (const result of results) {
      const baseName = sanitizeFileName(result.name);
      const outputPath = platform.joinPath(outputDir, `${baseName}.svg`);

      if (format === 'svg') {
        platform.writeFile(outputPath, result.svg);
        console.log(`Rendered ${result.type}: ${outputPath}`);
        continue;
      }

      try {
        const sharp = await import('sharp');
        const width = this.extractSvgWidth(result.svg);
        const height = this.extractSvgHeight(result.svg);
        const scaledWidth = Math.round(width * scale);
        const scaledHeight = Math.round(height * scale);
        let sharpInstance = sharp.default(Buffer.from(result.svg)).resize(scaledWidth, scaledHeight);

        if (format === 'png') {
          const pngPath = platform.joinPath(outputDir, `${baseName}.png`);
          await sharpInstance.png().toFile(pngPath);
          console.log(`Rendered ${result.type}: ${pngPath}`);
        } else if (format === 'jpg') {
          const jpgPath = platform.joinPath(outputDir, `${baseName}.jpg`);
          await sharpInstance.jpeg({ quality }).toFile(jpgPath);
          console.log(`Rendered ${result.type}: ${jpgPath}`);
        }
      } catch (error) {
        console.error(`Error converting to ${format}:`, error);
        platform.writeFile(outputPath, result.svg);
        console.log(`Fallback to SVG: ${outputPath}`);
      }
    }
  }

  async renderDeclaration(name: string, decl: any, values: Record<string, GSValue>, traces: Map<string, Trace>, baseDir: string = getPlatform().joinPath('.', ''), renderOptions: { fontScale?: number; imageScale?: number; fillImages?: boolean } = {}): Promise<string | null> {
    if (!decl || typeof decl !== 'object') return null;
    switch (decl.type) {
      case 'ChartDeclaration': {
        const series = buildChartSeries(decl as ChartDeclaration, values, traces);
        const config = extractChartConfig(decl as ChartDeclaration, values, traces, series);
        return series.length ? renderChart(config, series) : null;
      }
      case 'FlowDeclaration':
        return renderFlow(layoutFlow(decl as FlowDeclaration), (decl as FlowDeclaration).name || name);
      case 'TableDeclaration':
        return renderTable(planTableLayout(decl as TableDeclaration, values, traces));
      case 'Plot3dDeclaration': {
        const { config, series } = buildPlot3d(decl as Plot3dDeclaration, values, traces);
        return series ? renderPlot3d(config, series) : null;
      }
      case 'PseudoDeclaration':
        return renderPseudoBlock(decl as PseudoDeclaration);
      case 'DiagramDeclaration':
        return await renderDiagram(
          decl as DiagramDeclaration,
          values,
          traces,
          async (target) => this.findAndRenderTarget(target, values, traces, baseDir, renderOptions),
          baseDir,
          renderOptions,
        );
      case 'Scene3dDeclaration':
        return renderScene3d(decl as Scene3dDeclaration, values, traces);
      case 'ErdDeclaration':
        return renderErd(decl as ErdDeclaration, values, traces);
      case 'InfraDeclaration':
        return renderInfra(decl as InfraDeclaration, values, traces);
      case 'PageDeclaration':
        return await renderPage(decl as PageDeclaration, values, traces, async (target) => this.findAndRenderTarget(target, values, traces, baseDir, renderOptions), renderOptions);
      default:
        return null;
    }
  }

  private async findAndRenderTarget(target: string, values: Record<string, GSValue>, traces: Map<string, Trace>, baseDir: string, renderOptions: { fontScale?: number; imageScale?: number; fillImages?: boolean } = {}): Promise<string | null> {
    const direct = values[target];
    if (direct && typeof direct === 'object') {
      return this.renderDeclaration(target, direct, values, traces, baseDir, renderOptions);
    }

    for (const [name, value] of Object.entries(values)) {
      if (value && typeof value === 'object' && (value as any).name === target) {
        return this.renderDeclaration(name, value, values, traces, baseDir, renderOptions);
      }
    }
    return null;
  }

  private extractSvgWidth(svg: string): number {
    const match = svg.match(/<svg\b[^>]*\bwidth="([0-9.]+)"/i);
    return match ? Math.max(1, Math.round(Number(match[1]) || 0)) : 800;
  }

  private extractSvgHeight(svg: string): number {
    const match = svg.match(/<svg\b[^>]*\bheight="([0-9.]+)"/i);
    return match ? Math.max(1, Math.round(Number(match[1]) || 0)) : 600;
  }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'output';
}
