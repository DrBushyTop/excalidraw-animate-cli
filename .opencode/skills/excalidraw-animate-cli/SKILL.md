---
name: excalidraw-animate-cli
description: Use the repository-root Excalidraw Animate CLI to inspect `.excalidraw` scenes, create or refine manifests, capture manifest-backed PNG screenshots, and render SVG, MP4, GIF, or PPTX outputs. Use this when a user wants command-line automation for Excalidraw target selection and export workflows.
---

# Excalidraw Animate CLI

Use this skill when the task is to operate the repository-root Excalidraw animation CLI rather than the reference browser app. The CLI workflow is manifest-backed and is designed for both humans and LLM callers.

## Core Workflow

Follow this sequence unless the user already has one of the intermediate artifacts:

1. Inspect the `.excalidraw` file to discover frames, groups, and element IDs.
2. Create a starter manifest with one target per frame.
3. Edit the manifest when the user needs narrowed targets or animation sequencing.
4. Run `screenshot` for one PNG or `render` for batch export formats.

```bash
node dist/cli.js inspect General.excalidraw --json
node dist/cli.js manifest init General.excalidraw > animation.json
node dist/cli.js screenshot --manifest animation.json --target "Architecture" --output architecture.png --theme light
node dist/cli.js render animation.json --output-dir out --format svg --format mp4 --format gif --format pptx
```

## Command Guide

### Inspect

Run `inspect` first when you need stable selectors.

```bash
node dist/cli.js inspect file.excalidraw --json
```

- Use `--json` when another step will consume the output.
- Frame names, frame IDs, group IDs, and element IDs are the stable selector surface.

### Manifest Init

Bootstrap a manifest from the inspected scene.

```bash
node dist/cli.js manifest init file.excalidraw > animation.json
```

- The generated manifest includes `version`, `sourceFile`, and one target per frame.
- If the scene has no frames, the manifest uses a single `canvas` target named `full-canvas`.

### Screenshot

Capture one PNG for exactly one manifest target.

```bash
node dist/cli.js screenshot --manifest animation.json --target "Architecture" --output architecture.png --theme light
```

- Required flags: `--manifest`, `--target`, `--output`, `--theme`.
- `--target` must match a manifest target `name` exactly.
- The default capture time is the target's finished frame.
- Use `--at-ms <number>` to capture a specific animation moment.

```bash
node dist/cli.js screenshot --manifest animation.json --target "Architecture" --output architecture-step.png --theme light --at-ms 1200
```

### Render

Render one or more batch outputs from all manifest targets.

```bash
node dist/cli.js render animation.json --format svg
node dist/cli.js render animation.json --output-dir out --format svg --format mp4 --format gif --format pptx
```

- Default format is `svg`.
- Default theme is `light`.
- Default output directory is `<manifest-name>-output`.
- Use `--ffmpeg /path/to/ffmpeg` when `ffmpeg` is not on `PATH`.

## Manifest Rules

Keep callers on the manifest contract instead of inventing ad hoc selectors.

```json
{
  "version": 1,
  "sourceFile": "./General.excalidraw",
  "targets": [
    {
      "kind": "frame",
      "name": "Architecture",
      "frameId": "_S6ZvKgy_mFfamfticE7e"
    }
  ]
}
```

- Supported target kinds: `frame`, `canvas`.
- Use `frameId` to target a frame.
- Use `elementIds` only to narrow within the selected frame or canvas target.
- Use `sequence` items with `groupId` or `elementId` to control animation order.
- Explicit `elementId` sequence entries override overlapping group-derived behavior.
- Selectors outside the selected frame are rejected.
- Manifest target order is authoritative for batch render output ordering.

## Operational Guidance

- Prefer frame targets in v1 because they are the clearest caller-facing unit.
- Run `inspect --json` again after major scene edits so frame and element references stay current.
- Use `screenshot` when the user wants a single target preview; use `render` when they want full export sets.
- Do not use `reference-repo/` for CLI behavior changes; the repository-root CLI is the source of truth.

## Requirements And Verification

Before relying on media output, make sure the local environment is ready:

```bash
bun install
bun x playwright install chromium
bun run build
```

- `ffmpeg` is required for `mp4` and `gif` output.
- Playwright Chromium is required for screenshot and timeline capture.
- Useful checks after changes: `bun run typecheck`, `bun run test`, `bun run build`.
