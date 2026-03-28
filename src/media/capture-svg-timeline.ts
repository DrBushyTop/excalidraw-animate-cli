import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

export interface CaptureSvgTimelineOptions {
  finishedMs: number;
  outputDir?: string;
  fps?: number;
}

export interface CaptureSvgTimelineResult {
  frameDir: string;
  framePattern: string;
  frameCount: number;
}

function buildHtml(svgText: string): string {
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

export async function captureSvgTimeline(
  svgText: string,
  options: CaptureSvgTimelineOptions,
): Promise<CaptureSvgTimelineResult> {
  const fps = options.fps ?? 12;
  const frameDir = options.outputDir ?? (await mkdtemp(path.join(os.tmpdir(), 'excalidraw-animate-frames-')));
  await mkdir(frameDir, { recursive: true });

  const htmlPath = path.join(frameDir, 'capture.html');
  await writeFile(htmlPath, buildHtml(svgText), 'utf8');

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href);

    const dimensions = await page.evaluate(() => {
      const svg = document.querySelector('svg');
      if (!svg) {
        throw new Error('Missing svg root.');
      }
      const width = Number(svg.getAttribute('width') || 0);
      const height = Number(svg.getAttribute('height') || 0);
      return {
        width: Math.max(Math.ceil(width), 1),
        height: Math.max(Math.ceil(height), 1),
      };
    });

    await page.setViewportSize(dimensions);

    const durationSeconds = Math.max(options.finishedMs / 1000, 0.001);
    const frameCount = Math.max(Math.ceil(durationSeconds * fps), 1);

    for (let index = 0; index < frameCount; index += 1) {
      const timeSeconds = Math.min(index / fps, durationSeconds);
      await page.evaluate((value) => {
        const svg = document.querySelector('svg');
        if (!svg) {
          throw new Error('Missing svg root.');
        }
        svg.pauseAnimations();
        svg.setCurrentTime(value);
      }, timeSeconds);

      const framePath = path.join(frameDir, `frame-${String(index + 1).padStart(5, '0')}.png`);
      await page.screenshot({ path: framePath });
    }

    return {
      frameDir,
      framePattern: path.join(frameDir, 'frame-%05d.png'),
      frameCount,
    };
  } catch (error) {
    if (!options.outputDir) {
      await rm(frameDir, { recursive: true, force: true });
    }
    throw error;
  } finally {
    await browser.close();
  }
}
