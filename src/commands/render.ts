import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadExcalidrawFile } from '../io/load-excalidraw-file.js';
import { loadManifestFile } from '../manifest/load-manifest-file.js';
import { captureSvgTimeline } from '../media/capture-svg-timeline.js';
import { exportGif, exportMp4 } from '../media/export-video.js';
import { exportPptx, type PptxSlideAsset } from '../pptx/export-pptx.js';
import { renderTargetToSvg } from '../render/render-target-to-svg.js';
import { serializeSvg } from '../render/serialize-svg.js';

const SUPPORTED_FORMATS = new Set(['svg', 'mp4', 'gif', 'pptx']);

interface RenderOptions {
  manifestPath: string;
  outputDir: string;
  formats: Set<string>;
  ffmpegPath?: string;
  theme: 'light' | 'dark';
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'target';
}

function parseRenderArgs(args: string[]): RenderOptions {
  const formats = new Set<string>();
  let outputDir: string | undefined;
  let ffmpegPath: string | undefined;
  let theme: 'light' | 'dark' = 'light';
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--output-dir') {
      outputDir = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--format') {
      const format = args[index + 1];
      if (!format || !SUPPORTED_FORMATS.has(format)) {
        throw new Error(`Unsupported format: ${format ?? '<missing>'}`);
      }
      formats.add(format);
      index += 1;
      continue;
    }

    if (arg === '--ffmpeg') {
      ffmpegPath = args[index + 1];
      if (!ffmpegPath) {
        throw new Error('Missing value for --ffmpeg.');
      }
      index += 1;
      continue;
    }

    if (arg === '--theme') {
      const value = args[index + 1];
      if (value !== 'light' && value !== 'dark') {
        throw new Error(`Unsupported theme: ${value ?? '<missing>'}`);
      }
      theme = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unsupported flag: ${arg}`);
    }

    positional.push(arg);
  }

  if (positional.length > 1) {
    throw new Error('Multiple manifest files are not supported.');
  }

  const manifestPath = positional[0];
  if (!manifestPath) {
    throw new Error('Missing input manifest file path.');
  }

  const resolvedOutputDir = outputDir
    ? path.resolve(outputDir)
    : path.join(path.dirname(path.resolve(manifestPath)), `${path.basename(manifestPath, path.extname(manifestPath))}-output`);

  return {
    manifestPath,
    outputDir: resolvedOutputDir,
    formats: formats.size > 0 ? formats : new Set(['svg']),
    ffmpegPath,
    theme,
  };
}

export async function runRender(args: string[]): Promise<void> {
  const options = parseRenderArgs(args);
  const manifest = await loadManifestFile(options.manifestPath);
  const scene = await loadExcalidrawFile(manifest.sourceFile);

  await mkdir(options.outputDir, { recursive: true });

  const pptxSlides: PptxSlideAsset[] = [];
  const temporaryMp4Paths: string[] = [];

  for (const [index, target] of manifest.targets.entries()) {
    const ordinal = String(index + 1).padStart(2, '0');
    const baseName = `${ordinal}-${slugify(target.name)}`;
    const renderResult = await renderTargetToSvg(scene, target, { theme: options.theme });
    const outputPaths: string[] = [];

    if (options.formats.has('svg')) {
      const svgPath = path.join(options.outputDir, `${baseName}.svg`);
      await writeFile(svgPath, serializeSvg(renderResult.svgText), 'utf8');
      outputPaths.push(svgPath);
    }

    const needsFrames = options.formats.has('mp4') || options.formats.has('gif') || options.formats.has('pptx');
    if (needsFrames) {
      const frameDir = path.join(options.outputDir, `.frames-${baseName}`);
      const capture = await captureSvgTimeline(renderResult.svgText, {
        finishedMs: renderResult.finishedMs,
        outputDir: frameDir,
      });

      try {
        let mp4Path: string | undefined;
        if (options.formats.has('mp4') || options.formats.has('pptx')) {
          mp4Path = options.formats.has('mp4')
            ? path.join(options.outputDir, `${baseName}.mp4`)
            : path.join(options.outputDir, `.pptx-${baseName}.mp4`);
          await exportMp4(capture.framePattern, mp4Path, { ffmpegPath: options.ffmpegPath });
          outputPaths.push(mp4Path);
          if (!options.formats.has('mp4')) {
            temporaryMp4Paths.push(mp4Path);
          }
        }

        if (options.formats.has('gif')) {
          const gifPath = path.join(options.outputDir, `${baseName}.gif`);
          await exportGif(capture.framePattern, gifPath, { ffmpegPath: options.ffmpegPath });
          outputPaths.push(gifPath);
        }

        if (options.formats.has('pptx') && mp4Path) {
          pptxSlides.push({ name: target.name, mp4Path });
        }
      } finally {
        await rm(frameDir, { recursive: true, force: true });
      }
    }

    process.stdout.write(`${target.name}: ${outputPaths.map((outputPath) => path.basename(outputPath)).join(', ')}\n`);
  }

  if (options.formats.has('pptx')) {
    const pptxPath = path.join(options.outputDir, 'animation.pptx');
    try {
      await exportPptx(pptxSlides, pptxPath);
      process.stdout.write(`pptx: ${path.basename(pptxPath)}\n`);
    } finally {
      await Promise.all(temporaryMp4Paths.map((filePath) => rm(filePath, { force: true })));
    }
    return;
  }

  await Promise.all(temporaryMp4Paths.map((filePath) => rm(filePath, { force: true })));
}
