import { describe, expect, it, vi } from 'vitest';

describe('cli scaffold', () => {
  it('keeps command modules importable', async () => {
    const inspect = await import('../src/commands/inspect.ts');
    const manifestInit = await import('../src/commands/manifest-init.ts');
    const render = await import('../src/commands/render.ts');

    expect(inspect.runInspect).toBeTypeOf('function');
    expect(manifestInit.runManifestInit).toBeTypeOf('function');
    expect(render.runRender).toBeTypeOf('function');
  });

  it('routes inspect commands', async () => {
    const { routeCli } = await import('../src/cli.ts');
    const runInspect = vi.fn(async () => {});

    const exitCode = await routeCli(['inspect', 'file.excalidraw'], {
      runInspect,
      runManifestInit: vi.fn(async () => {}),
      runRender: vi.fn(async () => {}),
    });

    expect(exitCode).toBe(0);
    expect(runInspect).toHaveBeenCalledWith(['file.excalidraw']);
  });

  it('routes manifest init commands', async () => {
    const { routeCli } = await import('../src/cli.ts');
    const runManifestInit = vi.fn(async () => {});

    const exitCode = await routeCli(['manifest', 'init', 'file.excalidraw'], {
      runInspect: vi.fn(async () => {}),
      runManifestInit,
      runRender: vi.fn(async () => {}),
    });

    expect(exitCode).toBe(0);
    expect(runManifestInit).toHaveBeenCalledWith(['file.excalidraw']);
  });

  it('routes render commands', async () => {
    const { routeCli } = await import('../src/cli.ts');
    const runRender = vi.fn(async () => {});

    const exitCode = await routeCli(['render', 'manifest.json'], {
      runInspect: vi.fn(async () => {}),
      runManifestInit: vi.fn(async () => {}),
      runRender,
    });

    expect(exitCode).toBe(0);
    expect(runRender).toHaveBeenCalledWith(['manifest.json']);
  });

  it('returns a non-zero exit code for unknown commands', async () => {
    const { routeCli } = await import('../src/cli.ts');
    const stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    const exitCode = await routeCli(['wat'], {
      runInspect: vi.fn(async () => {}),
      runManifestInit: vi.fn(async () => {}),
      runRender: vi.fn(async () => {}),
    });

    expect(exitCode).toBe(1);
    expect(stderrWrite).toHaveBeenCalledWith('Unknown command: wat\n');

    stderrWrite.mockRestore();
  });
});
