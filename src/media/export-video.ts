import { access, unlink } from 'node:fs/promises';
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

async function canRun(command: string, args: string[]): Promise<boolean> {
  try {
    await runCommand(command, args);
    return true;
  } catch {
    return false;
  }
}

export async function resolveFfmpegPath(ffmpegPath?: string): Promise<string> {
  if (ffmpegPath) {
    if (isAbsoluteExecutablePath(ffmpegPath)) {
      await ensureExecutable(ffmpegPath);
      return ffmpegPath;
    }

    if (await canRun(ffmpegPath, ['-version'])) {
      return ffmpegPath;
    }

    throw new Error(`ffmpeg is not available at ${ffmpegPath}`);
  }

  if (await canRun('ffmpeg', ['-version'])) {
    return 'ffmpeg';
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
  const fps = String(options.fps ?? 30);

  await runCommand(ffmpegPath, [
    '-y',
    '-framerate',
    fps,
    '-i',
    framePattern,
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v',
    'libx264',
    '-crf',
    '18',
    '-preset',
    'slow',
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
  const fps = String(options.fps ?? 30);

  // Two-pass approach: first generate an optimized palette, then use it for the GIF.
  // This produces dramatically better color quality than ffmpeg's default GIF encoding.
  const palettePath = outputPath.replace(/\.gif$/i, '-palette.png');

  try {
    // Pass 1: generate palette
    await runCommand(ffmpegPath, [
      '-y',
      '-framerate',
      fps,
      '-i',
      framePattern,
      '-vf',
      'palettegen=max_colors=256:stats_mode=diff',
      palettePath,
    ]);

    // Pass 2: encode GIF using the palette
    await runCommand(ffmpegPath, [
      '-y',
      '-framerate',
      fps,
      '-i',
      framePattern,
      '-i',
      palettePath,
      '-lavfi',
      'paletteuse=dither=sierra2_4a',
      outputPath,
    ]);
  } finally {
    // Clean up temporary palette file
    try {
      await unlink(palettePath);
    } catch {
      // Palette file may not exist if pass 1 failed.
    }
  }
}
