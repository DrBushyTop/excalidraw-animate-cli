import { describe, expect, it } from 'vitest';

import type { LoadedScene } from '../src/io/load-excalidraw-file.ts';

function createScene(): LoadedScene {
  return {
    elements: [
      { id: 'frame-a', type: 'frame', frameId: null, groupIds: [] },
      { id: 'text-a', type: 'text', frameId: 'frame-a', groupIds: ['group-1'] },
      { id: 'rect-a', type: 'rectangle', frameId: 'frame-a', groupIds: ['group-1'] },
      { id: 'ellipse-a', type: 'ellipse', frameId: 'frame-a', groupIds: [] },
      { id: 'frame-b', type: 'frame', frameId: null, groupIds: [] },
      { id: 'rect-b', type: 'rectangle', frameId: 'frame-b', groupIds: ['group-b'] },
    ],
    appState: {},
    files: {},
  };
}

describe('normalizeTarget', () => {
  it('synthesizes default steps in source order for frame targets', async () => {
    const { normalizeTarget } = await import('../src/render/normalize-target.ts');

    const plan = normalizeTarget(
      {
        kind: 'frame',
        frameId: 'frame-a',
        name: 'Frame A',
      },
      createScene(),
    );

    expect(plan.elementIds).toEqual(['frame-a', 'text-a', 'rect-a', 'ellipse-a']);
    expect(plan.steps).toEqual([
      { order: 0, elementIds: ['frame-a'] },
      { order: 1, elementIds: ['text-a'] },
      { order: 2, elementIds: ['rect-a'] },
      { order: 3, elementIds: ['ellipse-a'] },
    ]);
  });

  it('narrows frame targets to an explicit subset while preserving source order', async () => {
    const { normalizeTarget } = await import('../src/render/normalize-target.ts');

    const plan = normalizeTarget(
      {
        kind: 'frame',
        frameId: 'frame-a',
        name: 'Frame A',
        elementIds: ['ellipse-a', 'rect-a'],
      },
      createScene(),
    );

    expect(plan.elementIds).toEqual(['rect-a', 'ellipse-a']);
    expect(plan.steps).toEqual([
      { order: 0, elementIds: ['rect-a'] },
      { order: 1, elementIds: ['ellipse-a'] },
    ]);
  });

  it('expands group selectors into one simultaneous step', async () => {
    const { normalizeTarget } = await import('../src/render/normalize-target.ts');

    const plan = normalizeTarget(
      {
        kind: 'frame',
        frameId: 'frame-a',
        name: 'Frame A',
        sequence: [{ groupId: 'group-1', order: 1, durationMs: 1200 }],
      },
      createScene(),
    );

    expect(plan.steps).toEqual([
      { order: 0, elementIds: ['frame-a'] },
      { order: 1, elementIds: ['text-a', 'rect-a'], durationMs: 1200 },
      { order: 3, elementIds: ['ellipse-a'] },
    ]);
  });

  it('lets explicit element overrides win over group-derived behavior', async () => {
    const { normalizeTarget } = await import('../src/render/normalize-target.ts');

    const plan = normalizeTarget(
      {
        kind: 'frame',
        frameId: 'frame-a',
        name: 'Frame A',
        sequence: [
          { groupId: 'group-1', order: 1, durationMs: 1200 },
          { elementId: 'rect-a', order: 6, durationMs: 300 },
        ],
      },
      createScene(),
    );

    expect(plan.steps).toEqual([
      { order: 0, elementIds: ['frame-a'] },
      { order: 1, elementIds: ['text-a'], durationMs: 1200 },
      { order: 3, elementIds: ['ellipse-a'] },
      { order: 6, elementIds: ['rect-a'], durationMs: 300 },
    ]);
  });

  it('lets explicit element overrides win regardless of sequence item order', async () => {
    const { normalizeTarget } = await import('../src/render/normalize-target.ts');

    const plan = normalizeTarget(
      {
        kind: 'frame',
        frameId: 'frame-a',
        name: 'Frame A',
        sequence: [
          { elementId: 'rect-a', order: 6, durationMs: 300 },
          { groupId: 'group-1', order: 1, durationMs: 1200 },
        ],
      },
      createScene(),
    );

    expect(plan.steps).toEqual([
      { order: 0, elementIds: ['frame-a'] },
      { order: 1, elementIds: ['text-a'], durationMs: 1200 },
      { order: 3, elementIds: ['ellipse-a'] },
      { order: 6, elementIds: ['rect-a'], durationMs: 300 },
    ]);
  });

  it('rejects target element narrowing outside the selected frame', async () => {
    const { normalizeTarget } = await import('../src/render/normalize-target.ts');

    expect(() =>
      normalizeTarget(
        {
          kind: 'frame',
          frameId: 'frame-a',
          name: 'Frame A',
          elementIds: ['rect-b'],
        },
        createScene(),
      ),
    ).toThrow(/outside target frame/i);
  });

  it('rejects sequence selectors outside the selected frame', async () => {
    const { normalizeTarget } = await import('../src/render/normalize-target.ts');

    expect(() =>
      normalizeTarget(
        {
          kind: 'frame',
          frameId: 'frame-a',
          name: 'Frame A',
          sequence: [{ elementId: 'rect-b', order: 1 }],
        },
        createScene(),
      ),
    ).toThrow(/outside target frame/i);
  });

  it('rejects group selectors outside the selected frame', async () => {
    const { normalizeTarget } = await import('../src/render/normalize-target.ts');

    expect(() =>
      normalizeTarget(
        {
          kind: 'frame',
          frameId: 'frame-a',
          name: 'Frame A',
          sequence: [{ groupId: 'group-b', order: 1 }],
        },
        createScene(),
      ),
    ).toThrow(/outside target frame/i);
  });

  it('rejects missing frame targets', async () => {
    const { normalizeTarget } = await import('../src/render/normalize-target.ts');

    expect(() =>
      normalizeTarget(
        {
          kind: 'frame',
          frameId: 'missing-frame',
          name: 'Missing Frame',
        },
        createScene(),
      ),
    ).toThrow(/does not match a frame element/i);
  });

  it('rejects non-frame target ids for frame targets', async () => {
    const { normalizeTarget } = await import('../src/render/normalize-target.ts');

    expect(() =>
      normalizeTarget(
        {
          kind: 'frame',
          frameId: 'rect-a',
          name: 'Bad Frame',
        },
        createScene(),
      ),
    ).toThrow(/does not match a frame element/i);
  });
});
