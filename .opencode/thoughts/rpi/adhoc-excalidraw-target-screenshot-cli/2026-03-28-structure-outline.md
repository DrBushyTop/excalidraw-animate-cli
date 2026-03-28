---
date: "2026-03-28T04:52:03Z"
author: opencode
type: structure-outline
topic: "Implement a root-level Excalidraw target screenshot CLI for LLM callers"
status: draft
git_commit: "f78743d3a561481ef355a731fa2cd53282ef7fe3"
git_branch: "master"
related_research: ".opencode/thoughts/rpi/adhoc-excalidraw-target-screenshot-cli/2026-03-28-research.md"
related_design: ".opencode/thoughts/rpi/adhoc-excalidraw-target-screenshot-cli/2026-03-28-design-discussion.md"
last_updated: "2026-03-28T04:52:03Z"
last_updated_by: opencode
---

# Implement a root-level Excalidraw target screenshot CLI for LLM callers Structure Outline

## Design Summary

- Add a dedicated top-level `screenshot` CLI command rather than extending `render`.
- Keep target selection manifest-backed so screenshot uses the same frame/canvas, `elementIds`, and `sequence` contract as inspect/init/render.
- Reuse `renderTargetToSvg()` and capture the rendered SVG through Playwright, defaulting to the finished frame with an optional `--at-ms` override.
- Extend README-based caller guidance; current research does not justify adding a separate checked-in skill file.

## Patterns To Follow

- `src/cli.ts`: top-level commands are routed through dedicated `run*` handlers.
- `src/commands/render.ts`: command modules parse args, load the manifest/scene, then orchestrate render and output writing.
- `src/render/render-target-to-svg.ts`: one normalized target-to-SVG seam should stay the source of screenshot content.
- `src/media/capture-svg-timeline.ts`: Playwright Chromium capture is the existing browser rasterization pattern to stay aligned with.
- `README.md`: caller guidance is documented as an inspect → manifest → command workflow with concrete shell examples.

## Phase Outline

### Phase 1: End-to-end screenshot command slice

- Goal: Prove an LLM caller can request one PNG screenshot for one manifest target from the root CLI.
- Summary: Add the new command, route it through the CLI, and implement a single-image Playwright capture path on top of existing manifest loading and target-to-SVG rendering.
- Why this phase exists now: It delivers the ticket's primary capability first and validates the chosen command surface before refactoring or documentation follow-up.

#### File Changes

- `src/cli.ts`: add `runScreenshot` to the handler interface, import the new command module, and route `screenshot` argv to it.
- `src/commands/screenshot.ts`: parse `--manifest`, `--target`, `--output`, and `--theme`; load the manifest and scene; resolve exactly one target by manifest name; render the target to SVG; capture one PNG at the default finished time.
- `src/media/capture-svg-screenshot.ts`: add a focused single-frame Playwright capture helper that writes a PNG from rendered SVG content.
- `tests/cli.spec.ts`: cover routing for the new `screenshot` command.
- `tests/screenshot.spec.ts`: cover successful PNG output plus target-selection failures for missing or unknown target names.

#### Validation

- Running `node dist/cli.js screenshot --manifest manifest.json --target "PRBOT 1" --output prbot-1.png` writes a non-empty PNG file.
- CLI routing tests show `routeCli()` dispatches `screenshot` like the existing root commands.
- Screenshot command errors are clear when the requested manifest target cannot be resolved to exactly one entry.

#### Phase Boundary

- Do not add direct selector flags such as `--frame-id` or `--element-id` in this phase.
- Do not expand README guidance yet beyond the minimum needed to unblock command development.

### Phase 2: Timing override and capture-path alignment

- Goal: Make screenshot timing explicit and keep screenshot capture behavior aligned with the existing raster export path.
- Summary: Add `--at-ms` support and align the new single-frame capture helper with the current timeline-capture HTML, viewport, and SVG time-control behavior.
- Why this phase exists now: Once the basic command works, this phase hardens the accepted design choice for finished-frame defaults without leaving two diverging browser-capture implementations.

#### File Changes

- `src/commands/screenshot.ts`: add `--at-ms` parsing and validation, defaulting to `renderResult.finishedMs` when the flag is omitted.
- `src/media/capture-svg-screenshot.ts`: support an explicit capture timestamp and clamp or reject invalid timing inputs consistently.
- `src/media/capture-svg-timeline.ts`: extract or reuse shared browser-capture setup so screenshot and timeline export stay visually consistent.
- `tests/screenshot.spec.ts`: add coverage for default finished-frame capture and explicit `--at-ms` overrides.
- `tests/render.spec.ts`: keep regression coverage around media capture and cleanup after any shared-capture refactor.

#### Validation

- Without `--at-ms`, screenshots are taken at the fully composed target state represented by `finishedMs`.
- With `--at-ms`, the command captures the requested timeline moment or fails clearly for invalid values.
- Existing render media tests still pass after the screenshot/timeline capture logic is aligned.

#### Phase Boundary

- Do not change manifest schema or target normalization rules in this phase.
- Do not add alternate output formats; this phase is only about PNG timing behavior and capture reuse.

### Phase 3: Caller guidance update

- Goal: Document the screenshot workflow in the same LLM-friendly guidance surface already used for the CLI.
- Summary: Extend README command documentation and examples so callers follow inspect → manifest init → screenshot, with clear notes on manifest-backed selection and default timing behavior.
- Why this phase exists now: Documentation should reflect the implemented command surface and timing semantics rather than getting ahead of them.

#### File Changes

- `README.md`: add a `screenshot` command section, required flags, example usage, default finished-frame behavior, optional `--at-ms`, and an updated workflow example that includes screenshoting.
- `File to confirm during implementation`: only if another checked-in caller-instruction surface is discovered; current research supports README updates but not a new repository skill file.

#### Validation

- README shows a concrete inspect → manifest init → screenshot flow that matches the implemented CLI flags.
- Documentation keeps one selector model and explains that screenshots default to the finished frame unless `--at-ms` is provided.

#### Phase Boundary

- Do not invent a new repository-wide skill system in this phase.
- Do not document an ad hoc selector grammar that the implementation does not support.

## Risks Or Ordering Notes

- Manifest target lookup by `name` is caller-friendly, but duplicate target names would make `--target` ambiguous; implementation should fail clearly rather than guessing.
- The screenshot helper should share browser-capture behavior with `src/media/capture-svg-timeline.ts` carefully so media export regressions stay isolated and testable.
- README is the current confirmed caller-guidance surface; if another checked-in instruction file appears during implementation, update scope should be revisited rather than assumed now.
