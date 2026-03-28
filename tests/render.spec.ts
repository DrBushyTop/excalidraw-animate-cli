import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const workspaceRoot = path.resolve(__dirname, '..');
const generalExcalidrawPath = path.join(workspaceRoot, 'General.excalidraw');

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'excalidraw-animate-render-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe('render manifest loading', () => {
  it('requires a source file path in the manifest', async () => {
    const { loadManifestFile } = await import('../src/manifest/load-manifest-file.ts');
    const dir = await createTempDir();
    const manifestPath = path.join(dir, 'animation.json');

    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        targets: [{ kind: 'canvas', name: 'full-canvas' }],
      }),
      'utf8',
    );

    await expect(loadManifestFile(manifestPath)).rejects.toThrow(/source file/i);
  });

  it('loads and resolves a valid manifest source file', async () => {
    const { loadManifestFile } = await import('../src/manifest/load-manifest-file.ts');
    const dir = await createTempDir();
    const sceneCopyPath = path.join(dir, 'scene.excalidraw');
    const manifestPath = path.join(dir, 'animation.json');

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

    const manifest = await loadManifestFile(manifestPath);

    expect(manifest.sourceFile).toBe(sceneCopyPath);
    expect(manifest.targets).toEqual([
      { kind: 'frame', name: 'PRBOT 1', frameId: 'AID-kV87HzNPeQ2wtkSfY' },
    ]);
  });

  it('rejects invalid sequence items', async () => {
    const { loadManifestFile } = await import('../src/manifest/load-manifest-file.ts');
    const dir = await createTempDir();
    const sceneCopyPath = path.join(dir, 'scene.excalidraw');
    const manifestPath = path.join(dir, 'animation.json');

    await writeFile(sceneCopyPath, await readFile(generalExcalidrawPath, 'utf8'), 'utf8');
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        sourceFile: './scene.excalidraw',
        targets: [
          {
            kind: 'frame',
            name: 'PRBOT 1',
            frameId: 'AID-kV87HzNPeQ2wtkSfY',
            sequence: [{ elementId: 'one', groupId: 'two', order: 1 }],
          },
        ],
      }),
      'utf8',
    );

    await expect(loadManifestFile(manifestPath)).rejects.toThrow(/targets/i);
  });
});

describe('renderTargetToSvg', () => {
  it('renders an animated svg for a real frame target', async () => {
    const { loadManifestFile } = await import('../src/manifest/load-manifest-file.ts');
    const { loadExcalidrawFile } = await import('../src/io/load-excalidraw-file.ts');
    const { renderTargetToSvg } = await import('../src/render/render-target-to-svg.ts');
    const dir = await createTempDir();
    const sceneCopyPath = path.join(dir, 'scene.excalidraw');
    const manifestPath = path.join(dir, 'animation.json');

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

    const manifest = await loadManifestFile(manifestPath);
    const scene = await loadExcalidrawFile(manifest.sourceFile);
    const result = await renderTargetToSvg(scene, manifest.targets[0]!);

    expect(result.finishedMs).toBeGreaterThan(1000);
    expect(result.svgText).toContain('<svg');
    expect(result.svgText).toContain('<animate');
    expect(result.svgText).toContain('<metadata');
  });
});

describe('runRender', () => {
  it('renders svg outputs for selected targets', async () => {
    const { runRender } = await import('../src/commands/render.ts');
    const dir = await createTempDir();
    const sceneCopyPath = path.join(dir, 'scene.excalidraw');
    const manifestPath = path.join(dir, 'animation.json');
    const outputDir = path.join(dir, 'out');
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

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

    await runRender([manifestPath, '--output-dir', outputDir, '--format', 'svg']);

    const files = await readdir(outputDir);
    const svgPath = path.join(outputDir, '01-prbot-1.svg');
    const svgContent = await readFile(svgPath, 'utf8');
    const output = stdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(files).toContain('01-prbot-1.svg');
    expect(svgContent).toContain('<svg');
    expect(output).toContain('svg');
    expect(output).toContain('01-prbot-1.svg');
  });

  it('keeps multi-target output order equal to manifest order', async () => {
    const { runRender } = await import('../src/commands/render.ts');
    const dir = await createTempDir();
    const sceneCopyPath = path.join(dir, 'scene.excalidraw');
    const manifestPath = path.join(dir, 'animation.json');
    const outputDir = path.join(dir, 'out');

    await writeFile(sceneCopyPath, await readFile(generalExcalidrawPath, 'utf8'), 'utf8');
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        sourceFile: './scene.excalidraw',
        targets: [
          { kind: 'frame', name: 'Architecture', frameId: '_S6ZvKgy_mFfamfticE7e' },
          { kind: 'frame', name: 'PRBOT 1', frameId: 'AID-kV87HzNPeQ2wtkSfY' },
        ],
      }),
      'utf8',
    );

    await runRender([manifestPath, '--output-dir', outputDir, '--format', 'svg']);

    const files = await readdir(outputDir);
    expect(files).toContain('01-architecture.svg');
    expect(files).toContain('02-prbot-1.svg');
  });

  it('renders mp4, gif, and pptx outputs from the same target', async () => {
    const { runRender } = await import('../src/commands/render.ts');
    const dir = await createTempDir();
    const sceneCopyPath = path.join(dir, 'scene.excalidraw');
    const manifestPath = path.join(dir, 'animation.json');
    const outputDir = path.join(dir, 'out');

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

    await runRender([
      manifestPath,
      '--output-dir',
      outputDir,
      '--format',
      'mp4',
      '--format',
      'gif',
      '--format',
      'pptx',
    ]);

    const mp4Path = path.join(outputDir, '01-prbot-1.mp4');
    const gifPath = path.join(outputDir, '01-prbot-1.gif');
    const pptxPath = path.join(outputDir, 'animation.pptx');

    expect((await stat(mp4Path)).size).toBeGreaterThan(0);
    expect((await stat(gifPath)).size).toBeGreaterThan(0);
    expect((await stat(pptxPath)).size).toBeGreaterThan(0);
  }, 180000);

  it('fails with a clear error when ffmpeg is unavailable for video exports', async () => {
    const { runRender } = await import('../src/commands/render.ts');
    const dir = await createTempDir();
    const sceneCopyPath = path.join(dir, 'scene.excalidraw');
    const manifestPath = path.join(dir, 'animation.json');

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

    await expect(
      runRender([manifestPath, '--output-dir', path.join(dir, 'out'), '--format', 'mp4', '--ffmpeg', '/missing/ffmpeg']),
    ).rejects.toThrow(/ffmpeg/i);
  }, 180000);
});
