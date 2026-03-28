import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, type Page } from 'playwright';

export interface SvgCaptureViewport {
  width: number;
  height: number;
}

function buildCaptureHtml(svgText: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: white;
      }
      body {
        display: inline-block;
      }
      svg {
        display: block;
      }
    </style>
  </head>
  <body>
    ${svgText}
    <script>
      const svg = document.querySelector('svg');
      if (!svg) {
        throw new Error('Missing svg root.');
      }
      svg.pauseAnimations();
      svg.setCurrentTime(0);
    </script>
  </body>
</html>`;
}

export function validateCaptureTimeMs(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid value for ${label}: expected a non-negative finite number.`);
  }

  return value;
}

export async function setSvgTimeSeconds(page: Page, value: number): Promise<void> {
  await page.evaluate((currentTime) => {
    const svg = document.querySelector('svg');
    if (!svg) {
      throw new Error('Missing svg root.');
    }
    svg.pauseAnimations();
    svg.setCurrentTime(currentTime);
  }, value);
}

export async function withSvgCapturePage<T>(
  svgText: string,
  callback: (page: Page, viewport: SvgCaptureViewport) => Promise<T>,
  options: { htmlDir?: string; deviceScaleFactor?: number } = {},
): Promise<T> {
  const deviceScaleFactor = options.deviceScaleFactor ?? 2;
  const temporaryHtmlDir = options.htmlDir == null
    ? await mkdtemp(path.join(os.tmpdir(), 'excalidraw-svg-capture-'))
    : undefined;
  const htmlDir = options.htmlDir ?? temporaryHtmlDir;

  if (!htmlDir) {
    throw new Error('Missing HTML capture directory.');
  }

  const htmlPath = path.join(htmlDir, 'capture.html');
  await writeFile(htmlPath, buildCaptureHtml(svgText), 'utf8');

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ deviceScaleFactor });
    const page = await context.newPage();
    await page.goto(pathToFileURL(htmlPath).href);

    const viewport = await page.evaluate(() => {
      function parseDimension(value: string | null): number | null {
        if (!value) {
          return null;
        }

        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
      }

      const svg = document.querySelector('svg');
      if (!svg) {
        throw new Error('Missing svg root.');
      }

      const rect = svg.getBoundingClientRect();
      const viewBox = svg.viewBox?.baseVal;
      const width = parseDimension(svg.getAttribute('width')) ?? viewBox?.width ?? rect.width;
      const height = parseDimension(svg.getAttribute('height')) ?? viewBox?.height ?? rect.height;

      return {
        width: Math.max(Math.ceil(width), 1),
        height: Math.max(Math.ceil(height), 1),
      };
    });

    await page.setViewportSize(viewport);
    return await callback(page, viewport);
  } finally {
    await browser.close();
    if (temporaryHtmlDir) {
      await rm(temporaryHtmlDir, { recursive: true, force: true });
    }
  }
}
