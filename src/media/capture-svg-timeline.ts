import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { setSvgTimeSeconds, validateCaptureTimeMs, withSvgCapturePage } from './svg-capture-browser.js';

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

export async function captureSvgTimeline(
  svgText: string,
  options: CaptureSvgTimelineOptions,
): Promise<CaptureSvgTimelineResult> {
  const fps = options.fps ?? 30;
  const finishedMs = validateCaptureTimeMs(options.finishedMs, 'finishedMs');
  const frameDir = options.outputDir ?? (await mkdtemp(path.join(os.tmpdir(), 'excalidraw-animate-frames-')));
  await mkdir(frameDir, { recursive: true });

  try {
    const durationSeconds = Math.max(finishedMs / 1000, 0.001);
    const frameCount = Math.max(Math.ceil(durationSeconds * fps), 1);

    await withSvgCapturePage(svgText, async (page) => {
      for (let index = 0; index < frameCount; index += 1) {
        const timeSeconds = frameCount === 1
          ? durationSeconds
          : (index / (frameCount - 1)) * durationSeconds;
        await setSvgTimeSeconds(page, timeSeconds);

        const framePath = path.join(frameDir, `frame-${String(index + 1).padStart(5, '0')}.png`);
        await page.screenshot({ path: framePath });
      }
    }, { htmlDir: frameDir });

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
  }
}
