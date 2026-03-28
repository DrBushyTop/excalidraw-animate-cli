import { loadExcalidrawFile } from '../io/load-excalidraw-file.js';
import { loadManifestFile } from '../manifest/load-manifest-file.js';
import { captureSvgScreenshot } from '../media/capture-svg-screenshot.js';
import { validateCaptureTimeMs } from '../media/svg-capture-browser.js';
import { renderTargetToSvg } from '../render/render-target-to-svg.js';

interface ScreenshotOptions {
  manifestPath: string;
  targetName: string;
  outputPath: string;
  theme: 'light' | 'dark';
  atMs?: number;
}

function parseAtMs(value: string | undefined): number {
  if (!value) {
    throw new Error('Missing value for --at-ms.');
  }

  return validateCaptureTimeMs(Number(value), '--at-ms');
}

function parseScreenshotArgs(args: string[]): ScreenshotOptions {
  let manifestPath: string | undefined;
  let targetName: string | undefined;
  let outputPath: string | undefined;
  let theme: 'light' | 'dark' | undefined;
  let atMs: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--manifest') {
      manifestPath = args[index + 1];
      if (!manifestPath) {
        throw new Error('Missing value for --manifest.');
      }
      index += 1;
      continue;
    }

    if (arg === '--target') {
      targetName = args[index + 1];
      if (!targetName) {
        throw new Error('Missing value for --target.');
      }
      index += 1;
      continue;
    }

    if (arg === '--output') {
      outputPath = args[index + 1];
      if (!outputPath) {
        throw new Error('Missing value for --output.');
      }
      index += 1;
      continue;
    }

    if (arg === '--theme') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('Missing value for --theme.');
      }
      if (value !== 'light' && value !== 'dark') {
        throw new Error(`Unsupported theme: ${value}`);
      }
      theme = value;
      index += 1;
      continue;
    }

    if (arg === '--at-ms') {
      atMs = parseAtMs(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unsupported flag: ${arg}`);
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!manifestPath) {
    throw new Error('Missing value for --manifest.');
  }

  if (!targetName) {
    throw new Error('Missing value for --target.');
  }

  if (!outputPath) {
    throw new Error('Missing value for --output.');
  }

  if (!theme) {
    throw new Error('Missing value for --theme.');
  }

  return {
    manifestPath,
    targetName,
    outputPath,
    theme,
    atMs,
  };
}

export async function runScreenshot(args: string[]): Promise<void> {
  const options = parseScreenshotArgs(args);
  const manifest = await loadManifestFile(options.manifestPath);
  const scene = await loadExcalidrawFile(manifest.sourceFile);
  const matches = manifest.targets.filter((target) => target.name === options.targetName);

  if (matches.length === 0) {
    throw new Error(`No manifest target found with name: ${options.targetName}`);
  }

  if (matches.length > 1) {
    throw new Error(`Multiple manifest targets found with name: ${options.targetName}`);
  }

  const renderResult = await renderTargetToSvg(scene, matches[0], { theme: options.theme });
  const atMs = options.atMs ?? renderResult.finishedMs;

  await captureSvgScreenshot(renderResult.svgText, {
    outputPath: options.outputPath,
    atMs,
  });

  process.stdout.write(`screenshot: ${options.outputPath}\n`);
}
