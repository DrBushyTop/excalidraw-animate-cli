---
date: "2026-03-28T04:44:48Z"
author: opencode
type: design-discussion
topic: "Implement a root-level Excalidraw target screenshot CLI for LLM callers"
status: draft
git_commit: "f78743d3a561481ef355a731fa2cd53282ef7fe3"
git_branch: "master"
related_research: ".opencode/thoughts/rpi/adhoc-excalidraw-target-screenshot-cli/2026-03-28-research.md"
last_updated: "2026-03-28T04:49:00Z"
last_updated_by: opencode
---

# Implement a root-level Excalidraw target screenshot CLI for LLM callers Design Discussion

## Summary of change request

Add a repository-root CLI capability that lets an LLM caller capture a screenshot of a selected Excalidraw target, while staying aligned with the existing inspect/manifest-driven workflow and documenting the new caller flow in the current instruction surfaces.

## Current State

- The root CLI currently exposes `inspect`, `manifest init`, and `render`, but no dedicated screenshot command.
- Target selection is already modeled around stable frame/canvas selectors plus optional `elementIds` and `sequence` metadata.
- Selected targets already render to SVG before downstream export.
- Browser screenshot capture already exists internally through the Playwright-based media pipeline.
- Caller guidance currently lives in `README.md` and work-item artifacts; no repository-root checked-in CLI skill file was found.

## Desired End State

- An LLM caller can inspect a scene, choose a stable target, run one root-level screenshot command, and receive a raster image of that target.
- The screenshot path reuses the same target semantics as existing inspect/manifest/render flows.
- The documented caller workflow clearly explains how to pick a target and request a screenshot without inventing a second selector model.

## What we're not doing

- Building an interactive browser UI workflow for selecting targets.
- Redesigning the manifest schema beyond what the screenshot command needs.
- Replacing the existing render/media pipeline for SVG, GIF, MP4, or PPTX export.
- Inventing a new repository-wide agent skill system just for this feature.

## Patterns to follow

### Frame-first target selection

Inspection already exposes stable frame IDs, frame names, group IDs, and per-element IDs. The screenshot flow should keep using those same selectors instead of creating new targeting concepts.

```json
{
  "targets": [
    {
      "kind": "frame",
      "frameId": "frame-123",
      "name": "PRBOT 1",
      "elementIds": ["el-1", "el-2"]
    }
  ]
}
```

### Reuse selected-target SVG rendering

The repository already has a single normalized-target-to-SVG seam. Screenshotting should layer on top of that seam rather than introducing a separate rendering path.

```ts
const rendered = await renderTargetToSvg({ scene, target, theme });
const pngPath = await captureSvgScreenshot(rendered.svgText);
```

### README-first caller guidance

Current CLI guidance is documented as a stepwise workflow. Screenshot instructions should extend that same guidance style.

```sh
excalidraw-animate inspect --input scene.excalidraw --json
excalidraw-animate manifest init --input scene.excalidraw --output manifest.json
excalidraw-animate screenshot --manifest manifest.json --target "PRBOT 1" --output prbot-1.png
```

## Design Questions

### 1. How should the screenshot capability appear in the CLI surface?

This determines whether callers get a clear single-purpose entry point or must overload an existing command that currently means batch render/export.

- Option A: Add a new top-level `screenshot` command

  ```sh
  excalidraw-animate screenshot --manifest manifest.json --target "PRBOT 1" --output prbot-1.png
  ```

  - Pros: Matches the ticket, is easy for LLMs to discover, and keeps screenshot intent explicit.
  - Cons: Adds one more top-level command to document and maintain.

- Option B: Extend `render` with a PNG output mode

  ```sh
  excalidraw-animate render --manifest manifest.json --format png --output-dir out
  ```

  - Pros: Reuses an existing command family.
  - Cons: Blurs the line between batch render/export and one-off screenshot capture.

- Option C: Keep screenshoting as an internal helper only
  - Pros: Minimal CLI surface change.
  - Cons: Does not satisfy the request for an LLM-usable root-level screenshot tool.

- Recommendation: Option A, because the user asked for a dedicated CLI tool and the existing `render` command already has broader batch-export semantics.
- Decision status: accepted

### 2. How should callers specify which target to screenshot?

This is the biggest UX choice for LLM callers: reuse the current manifest-centered workflow or introduce a parallel direct-selector grammar.

- Option A: Require manifest-backed target selection

  ```json
  {
    "sourceFile": "scene.excalidraw",
    "targets": [
      { "name": "PRBOT 1", "kind": "frame", "frameId": "frame-123" }
    ]
  }
  ```

  ```sh
  excalidraw-animate screenshot --manifest manifest.json --target "PRBOT 1" --output prbot-1.png
  ```

  - Pros: Reuses the existing selector model, validation rules, and inspect → manifest workflow already documented for callers.
  - Cons: Adds an extra step for quick ad hoc screenshots.

- Option B: Add direct target flags on the screenshot command

  ```sh
  excalidraw-animate screenshot \
    --input scene.excalidraw \
    --frame-id frame-123 \
    --element-id el-1 \
    --element-id el-2 \
    --output prbot-1.png
  ```

  - Pros: Enables a one-command ad hoc flow.
  - Cons: Duplicates selector grammar, validation, and caller education that already exist in manifests.

- Option C: Support only whole-frame or full-canvas screenshots
  - Pros: Simplest possible interface.
  - Cons: Falls short of the request to support selected scopes such as grouped subsets.

- Recommendation: Option A for v1, because the repository already has a stable target contract and LLM-friendly workflow around inspection and manifests.
- Decision status: accepted

### 3. For targets that include animation/sequence metadata, what moment should the screenshot show?

The current rendering seam can produce animated SVG. The screenshot command needs a clear default for whether it captures the start, the end, or a caller-selected moment.

- Option A: Capture the initial frame at time `0`

  ```ts
  await page.evaluate(() => svg.setCurrentTime(0));
  ```

  - Pros: Simple and deterministic.
  - Cons: Sequence-based targets may appear partially hidden, which is a poor default for “what this target looks like”.

- Option B: Capture the finished frame at `finishedMs`

  ```ts
  await page.evaluate((seconds) => svg.setCurrentTime(seconds), finishedMs / 1000);
  ```

  - Pros: Best matches a human expectation of the target’s current visible state.
  - Cons: Some workflows will still need a specific intermediate moment.

- Option C: Require the caller to provide a timestamp

  ```sh
  excalidraw-animate screenshot --manifest manifest.json --target "PRBOT 1" --at-ms 1200 --output prbot-1.png
  ```

  - Pros: Fully explicit and flexible.
  - Cons: Adds friction to the most common screenshot request.

- Recommendation: Option B as the default, plus an optional `--at-ms` override for callers that need a specific timeline moment.
- Decision status: accepted

### 4. Which rendering/capture seam should produce the screenshot PNG?

This choice drives visual consistency and implementation risk.

- Option A: Reuse target-to-SVG rendering, then capture one Playwright browser screenshot

  ```ts
  const rendered = await renderTargetToSvg({ scene, target, theme });
  await captureSvgScreenshot({ svgText: rendered.svgText, atMs: rendered.finishedMs });
  ```

  - Pros: Maximizes reuse, matches existing raster capture behavior, and stays close to current rendered output.
  - Cons: Keeps Playwright as a runtime dependency for screenshots.

- Option B: Rasterize SVG directly without a browser

  ```ts
  const pngBuffer = await rasterizeSvg(rendered.svgText);
  ```

  - Pros: Potentially lighter runtime path.
  - Cons: Introduces a new rendering stack with higher parity risk.

- Option C: Capture the actual Excalidraw UI in a browser session
  - Pros: Closest to the live app UI.
  - Cons: Much larger scope and unnecessary for the current CLI’s export model.

- Recommendation: Option A, because the repository already uses this browser-capture pattern and it best preserves parity with existing outputs.
- Decision status: accepted

## Resolved Design Questions

- CLI surface - Accepted Option A (new top-level `screenshot` command) because the request is for a dedicated LLM-usable screenshot tool, not a render-mode variation.
- Target selection surface - Accepted Option A (manifest-backed target selection) because it keeps one stable selector contract across inspect, manifest, render, and screenshot flows.
- Animated target screenshot timing - Accepted Option B (default to the finished frame) with an optional `--at-ms` override because callers usually want the fully composed target, but some workflows need a specific time.
- Capture seam - Accepted Option A (render to SVG, then capture via Playwright) because it reuses the current output path with the least behavior drift.

## Alternatives Rejected

- CLI surface / Option B (`render --format png`) - Rejected for now because it muddies the purpose of `render` and makes screenshot usage less obvious to callers.
- CLI surface / Option C (internal helper only) - Rejected because it would not expose the requested root-level capability.
- Target selection surface / Option B (direct selector flags) - Rejected for v1 because it duplicates existing manifest semantics and validation.
- Target selection surface / Option C (whole-frame/full-canvas only) - Rejected because it is too restrictive for selected scopes.
- Animated target screenshot timing / Option A (always time `0`) - Rejected because it can hide the composed result that callers usually need to inspect.
- Animated target screenshot timing / Option C (timestamp required) - Rejected because explicit timing should be available as an override, not required for the common case.
- Capture seam / Option B (direct SVG rasterization) - Rejected for now because it introduces a second rendering stack.
- Capture seam / Option C (capture full Excalidraw UI) - Rejected because it expands scope far beyond the repository-root export model.

## Risks or unknowns

- Manifest-first targeting is consistent, but some callers may later want a shorter ad hoc path.
- The optional `--at-ms` behavior should be documented clearly so callers understand that the default captures the fully composed target state.
- The repository currently has README-based caller guidance rather than a checked-in CLI skill file, so implementation should stay aligned with that existing documentation pattern unless the team decides otherwise.
