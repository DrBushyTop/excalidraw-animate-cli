# Excalidraw Animate CLI

Repository-root CLI for inspecting `.excalidraw` files, generating animation manifests, and rendering animated outputs.

## Requirements

- Bun `1.3.x`
- `ffmpeg` on `PATH` for `mp4` and `gif`
- Playwright Chromium installed for timeline capture

Install dependencies:

```bash
bun install
bun x playwright install chromium
```

Build the CLI:

```bash
bun run build
```

## Commands

### Inspect

Inspect frames, groups, and frame membership:

```bash
node dist/cli.js inspect General.excalidraw --json
```

Text mode is also available:

```bash
node dist/cli.js inspect General.excalidraw
```

### Manifest Init

Create a starter manifest with one target per discovered frame:

```bash
node dist/cli.js manifest init General.excalidraw > animation.json
```

The generated manifest includes:

- `version: 1`
- `sourceFile`
- one `frame` target per discovered frame, or `full-canvas` when no frames exist

## Manifest Shape

Minimal example:

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

Supported target kinds:

- `frame`
- `canvas`

Optional frame narrowing:

```json
{
  "kind": "frame",
  "name": "Architecture subset",
  "frameId": "_S6ZvKgy_mFfamfticE7e",
  "elementIds": ["element-a", "element-b"]
}
```

Optional sequencing:

```json
{
  "kind": "frame",
  "name": "Architecture",
  "frameId": "_S6ZvKgy_mFfamfticE7e",
  "sequence": [
    { "groupId": "MiJNOG59DmG_ddjs_-5bt", "order": 1, "durationMs": 1200 },
    { "elementId": "specific-element", "order": 5, "durationMs": 300 }
  ]
}
```

Rules:

- frame membership uses saved `frameId`
- manifest target order is authoritative
- `groupId` animates matched elements simultaneously
- explicit `elementId` entries override overlapping group-derived behavior
- selectors outside the selected frame are rejected

## Render

Render SVG only:

```bash
node dist/cli.js render animation.json --format svg
```

Render all supported outputs:

```bash
node dist/cli.js render animation.json --format svg --format mp4 --format gif --format pptx
```

Useful flags:

```bash
node dist/cli.js render animation.json --output-dir out --theme dark --ffmpeg /opt/homebrew/bin/ffmpeg
```

Defaults:

- output directory: `<manifest-name>-output`
- format: `svg`
- theme: `light`

## Screenshot

Capture one PNG for one manifest target:

```bash
node dist/cli.js screenshot --manifest animation.json --target "Architecture" --output architecture.png --theme light
```

Required flags:

- `--manifest`: path to the manifest file
- `--target`: manifest target `name`
- `--output`: output PNG path
- `--theme`: `light` or `dark`

Optional timing override:

```bash
node dist/cli.js screenshot --manifest animation.json --target "Architecture" --output architecture-step.png --theme light --at-ms 1200
```

Notes:

- screenshot selection is manifest-backed; `--target` must match a target `name` from the manifest
- without `--at-ms`, the screenshot is captured at the target's finished frame
- `--at-ms` captures a specific timeline moment instead

## Output Behavior

- `svg`: one animated SVG per target
- `mp4`: one rendered video per target
- `gif`: one GIF per target
- `pptx`: one slide deck named `animation.pptx`, with one video slide per selected target

## Example Workflow

```bash
node dist/cli.js inspect General.excalidraw --json
node dist/cli.js manifest init General.excalidraw > animation.json
node dist/cli.js screenshot --manifest animation.json --target "Architecture" --output architecture.png --theme light
node dist/cli.js render animation.json --output-dir out --format svg --format mp4 --format gif --format pptx
```

## Notes

- `reference-repo/` stays read-only; all CLI behavior lives at the repository root
- media export depends on headless Chromium plus `ffmpeg`
- the current implementation is locally verified against `General.excalidraw`
