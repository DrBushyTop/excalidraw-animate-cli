import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const workspaceRoot = path.resolve(__dirname, '..');
const generalExcalidrawPath = path.join(workspaceRoot, 'General.excalidraw');

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'excalidraw-animate-screenshot-'));
  tempDirs.push(dir);
  return dir;
}

async function createManifestFixture(): Promise<{
  dir: string;
  manifestPath: string;
  outputPath: string;
}> {
  const dir = await createTempDir();
  const sceneCopyPath = path.join(dir, 'scene.excalidraw');
  const manifestPath = path.join(dir, 'manifest.json');
  const outputPath = path.join(dir, 'target.png');

  await writeFile(sceneCopyPath, await readFile(generalExcalidrawPath, 'utf8'), 'utf8');
  await writeFile(
    manifestPath,
    JSON.stringify({
      version: 1,
      sourceFile: './scene.excalidraw',
      targets: [{ kind: 'frame', name: 'PRBOT 1', frameId: 'AID-kV87HzNPeQ2wtkSfY' }],
    }),
    'utf8',
  );

  return { dir, manifestPath, outputPath };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe('runScreenshot', () => {
  it('writes a png screenshot for a manifest target', async () => {
    const { runScreenshot } = await import('../src/commands/screenshot.ts');
    const { manifestPath, outputPath } = await createManifestFixture();

    await runScreenshot([
      '--manifest',
      manifestPath,
      '--target',
      'PRBOT 1',
      '--output',
      outputPath,
      '--theme',
      'light',
    ]);

    const pngBytes = await readFile(outputPath);

    expect((await stat(outputPath)).size).toBeGreaterThan(0);
    expect(pngBytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }, 180000);

  it('fails clearly when the requested target name is missing', async () => {
    const { runScreenshot } = await import('../src/commands/screenshot.ts');

    await expect(
      runScreenshot(['--manifest', 'manifest.json', '--output', 'target.png', '--theme', 'light']),
    ).rejects.toThrow('Missing value for --target.');
  });

  it('fails clearly when the requested target name is unknown', async () => {
    const { runScreenshot } = await import('../src/commands/screenshot.ts');
    const { manifestPath, outputPath } = await createManifestFixture();

    await expect(
      runScreenshot([
        '--manifest',
        manifestPath,
        '--target',
        'Unknown target',
        '--output',
        outputPath,
        '--theme',
        'light',
      ]),
    ).rejects.toThrow('No manifest target found with name: Unknown target');
  });

  it('captures the finished frame by default', async () => {
    const { runScreenshot } = await import('../src/commands/screenshot.ts');
    const captureModule = await import('../src/media/capture-svg-screenshot.ts');
    const { loadManifestFile } = await import('../src/manifest/load-manifest-file.ts');
    const { loadExcalidrawFile } = await import('../src/io/load-excalidraw-file.ts');
    const { renderTargetToSvg } = await import('../src/render/render-target-to-svg.ts');
    const { manifestPath, outputPath } = await createManifestFixture();

    const captureSpy = vi.spyOn(captureModule, 'captureSvgScreenshot').mockResolvedValue();
    const manifest = await loadManifestFile(manifestPath);
    const scene = await loadExcalidrawFile(manifest.sourceFile);
    const renderResult = await renderTargetToSvg(scene, manifest.targets[0]!, { theme: 'light' });

    await runScreenshot([
      '--manifest',
      manifestPath,
      '--target',
      'PRBOT 1',
      '--output',
      outputPath,
      '--theme',
      'light',
    ]);

    expect(captureSpy).toHaveBeenCalledWith(
      expect.stringContaining('<svg'),
      expect.objectContaining({
        outputPath,
        atMs: renderResult.finishedMs,
      }),
    );
  });

  it('uses an explicit --at-ms override when provided', async () => {
    const { runScreenshot } = await import('../src/commands/screenshot.ts');
    const captureModule = await import('../src/media/capture-svg-screenshot.ts');
    const { manifestPath, outputPath } = await createManifestFixture();

    const captureSpy = vi.spyOn(captureModule, 'captureSvgScreenshot').mockResolvedValue();

    await runScreenshot([
      '--manifest',
      manifestPath,
      '--target',
      'PRBOT 1',
      '--output',
      outputPath,
      '--theme',
      'light',
      '--at-ms',
      '1200',
    ]);

    expect(captureSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        outputPath,
        atMs: 1200,
      }),
    );
  });
});
