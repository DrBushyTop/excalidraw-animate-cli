import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const workspaceRoot = path.resolve(__dirname, '..');
const generalExcalidrawPath = path.join(workspaceRoot, 'General.excalidraw');

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'excalidraw-animate-manifest-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe('createManifestFromInspection', () => {
  it('creates one frame target per discovered frame', async () => {
    const { inspectFile } = await import('../src/inspect/inspect-file.ts');
    const { createManifestFromInspection } = await import('../src/manifest/schema.ts');

    const inspection = await inspectFile(generalExcalidrawPath);
    const manifest = createManifestFromInspection(inspection, generalExcalidrawPath);

    expect(manifest).toEqual({
      version: 1,
      sourceFile: generalExcalidrawPath,
      targets: inspection.frames.map((frame) => ({
        kind: 'frame',
        frameId: frame.id,
        name: frame.name && frame.name.trim() ? frame.name : frame.id,
      })),
    });
  });

  it('falls back to a full-canvas target when no frames exist', async () => {
    const { inspectFile } = await import('../src/inspect/inspect-file.ts');
    const { createManifestFromInspection } = await import('../src/manifest/schema.ts');
    const dir = await createTempDir();
    const filePath = path.join(dir, 'no-frames.excalidraw');

    await writeFile(
      filePath,
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [
          { id: 'rect-1', type: 'rectangle', isDeleted: false, frameId: null, groupIds: [] },
        ],
      }),
      'utf8',
    );

    const inspection = await inspectFile(filePath);
    const manifest = createManifestFromInspection(inspection, filePath);

    expect(manifest).toEqual({
      version: 1,
      sourceFile: filePath,
      targets: [{ kind: 'canvas', name: 'full-canvas' }],
    });
  });

  it('falls back to frame ids for blank frame names', async () => {
    const { createManifestFromInspection } = await import('../src/manifest/schema.ts');

    const manifest = createManifestFromInspection({
      hasFrames: true,
      frames: [
        {
          id: 'frame-1',
          name: '   ',
          bounds: { x: 0, y: 0, width: 1, height: 1 },
          elementIds: ['frame-1'],
          elementCount: 1,
          groups: [],
          elements: [],
        },
      ],
    }, 'scene.excalidraw');

    expect(manifest).toEqual({
      version: 1,
      sourceFile: 'scene.excalidraw',
      targets: [{ kind: 'frame', frameId: 'frame-1', name: 'frame-1' }],
    });
  });
});

describe('runManifestInit', () => {
  it('prints a manifest for a framed drawing', async () => {
    const { runManifestInit } = await import('../src/commands/manifest-init.ts');
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { inspectFile } = await import('../src/inspect/inspect-file.ts');

    await runManifestInit([generalExcalidrawPath]);

    const output = stdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join('');
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const inspection = await inspectFile(generalExcalidrawPath);

    expect(parsed).toEqual({
      version: 1,
      sourceFile: generalExcalidrawPath,
      targets: inspection.frames.map((frame) => ({
        kind: 'frame',
        frameId: frame.id,
        name: frame.name && frame.name.trim() ? frame.name : frame.id,
      })),
    });
  });

  it('prints a full-canvas manifest when the drawing has no frames', async () => {
    const { runManifestInit } = await import('../src/commands/manifest-init.ts');
    const dir = await createTempDir();
    const filePath = path.join(dir, 'no-frames.excalidraw');
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await writeFile(
      filePath,
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [
          { id: 'rect-1', type: 'rectangle', isDeleted: false, frameId: null, groupIds: [] },
        ],
      }),
      'utf8',
    );

    await runManifestInit([filePath]);

    const output = stdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(JSON.parse(output)).toEqual({
      version: 1,
      sourceFile: filePath,
      targets: [{ kind: 'canvas', name: 'full-canvas' }],
    });
  });

  it('rejects missing input paths', async () => {
    const { runManifestInit } = await import('../src/commands/manifest-init.ts');

    await expect(runManifestInit([])).rejects.toThrow(/missing input/i);
  });

  it('rejects unsupported flags', async () => {
    const { runManifestInit } = await import('../src/commands/manifest-init.ts');

    await expect(runManifestInit([generalExcalidrawPath, '--wat'])).rejects.toThrow(/unsupported/i);
  });

  it('rejects multiple input paths', async () => {
    const { runManifestInit } = await import('../src/commands/manifest-init.ts');

    await expect(runManifestInit(['a.excalidraw', 'b.excalidraw'])).rejects.toThrow(/multiple/i);
  });

  it('accepts dash-prefixed filenames after --', async () => {
    const { runManifestInit } = await import('../src/commands/manifest-init.ts');
    const dir = await createTempDir();
    const filePath = path.join(dir, '-scene.excalidraw');
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await writeFile(
      filePath,
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [
          { id: 'rect-1', type: 'rectangle', isDeleted: false, frameId: null, groupIds: [] },
        ],
      }),
      'utf8',
    );

    await runManifestInit(['--', filePath]);

    const output = stdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(JSON.parse(output)).toEqual({
      version: 1,
      sourceFile: filePath,
      targets: [{ kind: 'canvas', name: 'full-canvas' }],
    });
  });
});
