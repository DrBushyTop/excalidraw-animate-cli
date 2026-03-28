import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { setSvgTimeSeconds, validateCaptureTimeMs, withSvgCapturePage } from './svg-capture-browser.js';

export interface CaptureSvgScreenshotOptions {
  outputPath: string;
  atMs: number;
}

export async function captureSvgScreenshot(
  svgText: string,
  options: CaptureSvgScreenshotOptions,
): Promise<void> {
  const atMs = validateCaptureTimeMs(options.atMs, '--at-ms');
  await mkdir(path.dirname(path.resolve(options.outputPath)), { recursive: true });

  await withSvgCapturePage(svgText, async (page) => {
    await setSvgTimeSeconds(page, atMs / 1000);
    await page.screenshot({ path: options.outputPath });
  });
}
