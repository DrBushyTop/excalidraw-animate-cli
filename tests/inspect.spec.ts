import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const workspaceRoot = path.resolve(__dirname, '..');
const generalExcalidrawPath = path.join(workspaceRoot, 'General.excalidraw');

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'excalidraw-animate-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe('loadExcalidrawFile', () => {
  it('filters deleted elements and defaults missing app state and files', async () => {
    const { loadExcalidrawFile } = await import('../src/io/load-excalidraw-file.ts');
    const dir = await createTempDir();
    const filePath = path.join(dir, 'sample.excalidraw');

    await writeFile(
      filePath,
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [
          { id: 'keep', type: 'rectangle', isDeleted: false, groupIds: [], frameId: null },
          { id: 'drop', type: 'rectangle', isDeleted: true, groupIds: [], frameId: null },
        ],
      }),
      'utf8',
    );

    const scene = await loadExcalidrawFile(filePath);

    expect(scene.elements.map((element) => element.id)).toEqual(['keep']);
    expect(scene.appState).toEqual({});
    expect(scene.files).toEqual({});
  });

  it('rejects malformed scene element payloads', async () => {
    const { loadExcalidrawFile } = await import('../src/io/load-excalidraw-file.ts');
    const dir = await createTempDir();
    const filePath = path.join(dir, 'bad.excalidraw');

    await writeFile(
      filePath,
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: 'not-an-array',
      }),
      'utf8',
    );

    await expect(loadExcalidrawFile(filePath)).rejects.toThrow(/elements/i);
  });

  it('rejects invalid top-level scene payloads', async () => {
    const { loadExcalidrawFile } = await import('../src/io/load-excalidraw-file.ts');
    const dir = await createTempDir();
    const filePath = path.join(dir, 'null-scene.excalidraw');

    await writeFile(filePath, 'null', 'utf8');

    await expect(loadExcalidrawFile(filePath)).rejects.toThrow(/scene/i);
  });

  it('normalizes malformed optional element fields', async () => {
    const { loadExcalidrawFile } = await import('../src/io/load-excalidraw-file.ts');
    const dir = await createTempDir();
    const filePath = path.join(dir, 'normalized-fields.excalidraw');

    await writeFile(
      filePath,
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [
          {
            id: 'frame-1',
            type: 'frame',
            isDeleted: false,
            frameId: null,
            groupIds: 'bad-group-ids',
            name: { bad: true },
            customData: 'bad-custom-data',
          },
        ],
      }),
      'utf8',
    );

    const scene = await loadExcalidrawFile(filePath);

    expect(scene.elements).toHaveLength(1);
    expect(scene.elements[0]?.groupIds).toEqual([]);
    expect(scene.elements[0]?.name).toBeUndefined();
    expect(scene.elements[0]?.customData).toBeUndefined();
  });
});

describe('buildInspection', () => {
  it('reports rich frame metadata and group summaries from General.excalidraw', async () => {
    const { inspectFile } = await import('../src/inspect/inspect-file.ts');

    const inspection = await inspectFile(generalExcalidrawPath);
    const prbot1 = inspection.frames.find((frame) => frame.id === 'AID-kV87HzNPeQ2wtkSfY');
    const prbot2 = inspection.frames.find((frame) => frame.id === 'af8ZT1J20rfKfOnyLTsyN');

    expect(inspection.hasFrames).toBe(true);
    expect(prbot1).toMatchObject({
      name: 'PRBOT 1',
      bounds: {
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      },
      elementCount: 39,
      customData: { slidesOrder: 6 },
    });
    expect(prbot1?.elementIds).toContain('PBDaFnPghLm_ohwL5B8tg');
    expect(prbot1?.elements).toContainEqual({
      id: 'PBDaFnPghLm_ohwL5B8tg',
      type: 'rectangle',
      groupIds: [],
    });

    expect(prbot2?.groups).toContainEqual({
      id: 'TAAy_4aef_kVecrO-TzJ_',
      elementIds: [
        'KJIke9jNIoe2LDavl7PSM',
        'PaxY-7W6iQ39dyiS-GRsK',
        'Rf-V9xGht1C5X_IKoy0yy',
        'TksEOP2RhkRaC3sgPXTZM',
        'W-6aFgptMgJFeQTajiRMV',
        'gcrYGLfPRwICpfO87RRDu',
        'j2Xr4Od64k937rcoehbh6',
        'snxg9wlK0wHofJ-DBU94h',
      ],
    });
    expect(prbot2?.elements).toContainEqual({
      id: 'W-6aFgptMgJFeQTajiRMV',
      type: 'rectangle',
      groupIds: ['TAAy_4aef_kVecrO-TzJ_'],
    });
  });

  it('reports no-frame drawings without failing', async () => {
    const { inspectFile } = await import('../src/inspect/inspect-file.ts');
    const dir = await createTempDir();
    const filePath = path.join(dir, 'no-frames.excalidraw');

    await writeFile(
      filePath,
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [
          { id: 'rect-1', type: 'rectangle', isDeleted: false, groupIds: [], frameId: null },
        ],
        appState: { theme: 'light' },
        files: {},
      }),
      'utf8',
    );

    const inspection = await inspectFile(filePath);

    expect(inspection).toEqual({ hasFrames: false, frames: [] });
  });
});

describe('runInspect', () => {
  it('prints inspection JSON for a file', async () => {
    const { runInspect } = await import('../src/commands/inspect.ts');
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runInspect([generalExcalidrawPath, '--json']);

    const output = stdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join('');
    const parsed = JSON.parse(output) as { hasFrames: boolean; frames: Array<{ id: string; name?: string | null }> };

    expect(parsed.hasFrames).toBe(true);
    expect(parsed.frames).toContainEqual(
      expect.objectContaining({ id: 'AID-kV87HzNPeQ2wtkSfY', name: 'PRBOT 1' }),
    );
  });

  it('prints a text summary by default', async () => {
    const { runInspect } = await import('../src/commands/inspect.ts');
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runInspect([generalExcalidrawPath]);

    const output = stdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(output).toContain('Frames: 14');
    expect(output).toContain('PRBOT 1');
  });

  it('sanitizes control characters in text output', async () => {
    const { runInspect } = await import('../src/commands/inspect.ts');
    const dir = await createTempDir();
    const filePath = path.join(dir, 'control-chars.excalidraw');
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await writeFile(
      filePath,
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [
          {
            id: 'frame-1',
            type: 'frame',
            isDeleted: false,
            frameId: null,
            groupIds: [],
            name: 'hello\n\u001b[31mworld',
            x: 1,
            y: 2,
            width: 3,
            height: 4,
          },
        ],
      }),
      'utf8',
    );

    await runInspect([filePath]);

    const output = stdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(output).not.toContain('\u001b');
    expect(output).not.toContain('hello\n');
    expect(output).toContain('hello world');
  });

  it('falls back to the frame id when sanitization removes the frame name', async () => {
    const { runInspect } = await import('../src/commands/inspect.ts');
    const dir = await createTempDir();
    const filePath = path.join(dir, 'empty-name.excalidraw');
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await writeFile(
      filePath,
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [
          {
            id: 'frame-1',
            type: 'frame',
            isDeleted: false,
            frameId: null,
            groupIds: [],
            name: '\u001b[31m',
          },
        ],
      }),
      'utf8',
    );

    await runInspect([filePath]);

    const output = stdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(output).toContain('- frame-1: 1 elements');
    expect(output).not.toContain(' (frame-1)');
  });

  it('rejects unsupported flags', async () => {
    const { runInspect } = await import('../src/commands/inspect.ts');

    await expect(runInspect([generalExcalidrawPath, '--wat'])).rejects.toThrow(/unsupported/i);
  });

  it('rejects multiple input paths', async () => {
    const { runInspect } = await import('../src/commands/inspect.ts');

    await expect(runInspect(['a.excalidraw', 'b.excalidraw'])).rejects.toThrow(/multiple/i);
  });
});
