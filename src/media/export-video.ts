import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

export interface VideoExportOptions {
  ffmpegPath?: string;
  fps?: number;
}

async function ensureExecutable(filePath: string): Promise<void> {
  try {
    await access(filePath, constants.X_OK);
  } catch {
    throw new Error(`ffmpeg is not available at ${filePath}`);
  }
}

function isAbsoluteExecutablePath(filePath: string): boolean {
  return path.isAbsolute(filePath);
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe' });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `Command failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

export async function resolveFfmpegPath(ffmpegPath?: string): Promise<string> {
  if (ffmpegPath) {
    if (isAbsoluteExecutablePath(ffmpegPath)) {
      await ensureExecutable(ffmpegPath);
      return ffmpegPath;
    }

    await runCommand(ffmpegPath, ['-version']);
    return ffmpegPath;
  }

  const candidates = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
  for (const candidate of candidates) {
    try {
      await ensureExecutable(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('ffmpeg is required for mp4 and gif export. Install ffmpeg or pass --ffmpeg.');
}

export async function exportMp4(
  framePattern: string,
  outputPath: string,
  options: VideoExportOptions = {},
): Promise<void> {
  const ffmpegPath = await resolveFfmpegPath(options.ffmpegPath);
  const fps = String(options.fps ?? 12);

  await runCommand(ffmpegPath, [
    '-y',
    '-framerate',
    fps,
    '-i',
    framePattern,
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}

export async function exportGif(
  framePattern: string,
  outputPath: string,
  options: VideoExportOptions = {},
): Promise<void> {
  const ffmpegPath = await resolveFfmpegPath(options.ffmpegPath);
  const fps = String(options.fps ?? 12);

  await runCommand(ffmpegPath, [
    '-y',
    '-framerate',
    fps,
    '-i',
    framePattern,
    outputPath,
  ]);
}
