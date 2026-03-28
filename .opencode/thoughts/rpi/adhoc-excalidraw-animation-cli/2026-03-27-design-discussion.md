---
date: "2026-03-27T23:54:23Z"
author: opencode
type: design-discussion
topic: "Implement a root-level CLI based on reference-repo for animating individual Excalidraw files with controllable frame export, reordering, and multiple output formats"
status: draft
git_commit: "3e51bae627462f59da2d3a9d8e3e2a9fb1af39d3"
git_branch: "master"
related_research: ".opencode/thoughts/rpi/adhoc-excalidraw-animation-cli/2026-03-27-research.md"
last_updated: "2026-03-28T00:25:20Z"
last_updated_by: opencode
---

# Root-level Excalidraw Animation CLI Design Discussion

## Summary of change request

Add a repository-root CLI that reuses the reference animation approach without modifying `reference-repo/`, accepts individual `.excalidraw` inputs, allows selecting only some frames/content, supports custom animation ordering and sequencing, and exports at least GIF, MP4, and PowerPoint deliverables.

## Current State

- The only implementation is the browser-first app under `reference-repo/`.
- Animation order and duration are currently encoded into Excalidraw element IDs and parsed during SVG animation patching.
- Export support currently covers SVG and browser-captured WebM only.
- The current repository code does not contain any frame-selection logic or PowerPoint generation code.
- The repository root has no package manifest or CLI scaffold yet; the only package manifest is `reference-repo/package.json`.
- Local file evidence from `General.excalidraw` shows first-class Excalidraw frame usage: elements carry `frameId`, frame elements are `type: "frame"`, and frames may also have a `name` plus project-specific `customData` such as `slidesOrder`.
- No root-level CLI, no non-browser render pipeline, and no PowerPoint export path exist today.

## Desired End State

- A root-level CLI can load an individual `.excalidraw` file without depending on the browser UI shell.
- Users can choose which frame-scoped content to export and animate.
- Users can override draw order with explicit sequencing metadata.
- The same core animation pipeline can feed SVG preview/export plus rasterized outputs such as GIF and MP4.
- PowerPoint export can generate slides that include the animated result for the selected frame/content.

## What we're not doing

- Editing `reference-repo/` in place.
- Recreating the full React editor/configuration UI at the repository root.
- Implementing native PowerPoint object-by-object animation timelines in a first pass.
- Solving every browser-only feature from the reference app, such as toolbar stepping UX or `getDisplayMedia` capture flows.

## Patterns to follow

### Keep the SVG animation core as the reusable center

The reference implementation already has a stable separation where scene loading produces SVG and `animateSvg()` applies timing. The CLI should preserve that seam instead of redesigning animation semantics from scratch.

    const dur =
      extractNumberFromElement(element, 'animateDuration') || individualDur;
    patchSvgEle(svg, ele, element, current, dur, options);
    current += dur;

From `reference-repo/src/animate.ts:694-697`.

### Preserve explicit ordering metadata, but decouple it from editor-only mutation flows

The current app writes sequencing metadata into element IDs. The CLI should continue to consume explicit order/duration metadata, but avoid making source-file mutation the only control surface.

    const match = id.match(new RegExp(`${key}:(-?\\d+)`));
    if (match) {
      newId = id.replace(new RegExp(`${key}:(-?\\d+)`), `${key}:${value}`);
    } else {
      newId = id + `-${key}:${value}`;
    }

From `reference-repo/src/AnimateConfig.tsx:57-62`.

### Replace browser capture with deterministic offline rendering

The current WebM export relies on `navigator.mediaDevices.getDisplayMedia()` and `MediaRecorder`, which are not CLI-friendly. The CLI should keep SVG timing semantics but swap capture for an offline renderer.

    navigator.mediaDevices
      .getDisplayMedia({ video: { cursor: 'never', displaySurface: 'browser' } })

From `reference-repo/src/export.ts:28-35`.

### Use first-class Excalidraw frame membership before any geometry heuristics

Research plus local file inspection indicate that saved `.excalidraw` files represent membership directly: child elements carry a `frameId`, while frame elements themselves are stored as `type: "frame"` with their own `id` and often a `name`.

    {
      "id": "AID-kV87HzNPeQ2wtkSfY",
      "type": "frame",
      "frameId": null,
      "name": "PRBOT 1"
    }

    {
      "id": "PBDaFnPghLm_ohwL5B8tg",
      "type": "rectangle",
      "frameId": "AID-kV87HzNPeQ2wtkSfY"
    }

From `General.excalidraw:8486-8515` and `General.excalidraw:354-390`.

## Design Questions

### 24. How should the manifest model treat non-frame targets in relation to v1 scope?

You want future support for non-frame targets, but we should still keep v1 focused. The schema should therefore leave room for later expansion without requiring the runtime to implement arbitrary subset targets now.

- Option A: Support only frame targets plus `full-canvas` in v1, but shape the manifest so other target kinds can be added later

  ```json
  {
    "targets": [
      { "kind": "frame", "frameId": "frame-a", "name": "intro" },
      { "kind": "canvas", "name": "full-canvas" }
    ]
  }
  ```

  - Pros: Keeps v1 scope tight while making future non-frame target support a schema extension rather than a redesign.
  - Cons: Slightly more schema ceremony up front.

- Option B: Support arbitrary named element-subset targets in v1

  ```json
  {
    "targets": [
      { "kind": "subset", "name": "intro", "elementIds": ["rect-1", "arrow-2"] }
    ]
  }
  ```

  - Pros: Maximum flexibility immediately.
  - Cons: Broadens implementation scope significantly.

- Option C: Design only for current frame targets and revisit the schema later
  - Pros: Smallest short-term design surface.
  - Cons: Risks a schema break when non-frame targeting is added later.

- Recommendation: Option A. Keep runtime scope to frame/canvas in v1, but make the manifest extensible via a target `kind` discriminator.
- Decision status: accepted

### 18. How should grouped selectors behave when expanded into element-level animation?

Since `groupId` is accepted, we need to define whether a group animates as one simultaneous step or as a shorthand that expands into ordered child steps.

- Option A: All elements matched by a `groupId` animate simultaneously as one step

  ```json
  { "groupId": "TAAy_4aef_kVecrO-TzJ_", "order": 2, "durationMs": 1200 }
  ```

  - Pros: Best match for the idea of a logical grouped reveal.
  - Cons: Less granular control inside the group unless authors break it apart.

- Option B: `groupId` expands into one step per matched element using source order

  ```json
  { "groupId": "TAAy_4aef_kVecrO-TzJ_", "order": 2 }
  ```

  - Pros: More detail without enumerating all elements.
  - Cons: Harder to predict and less aligned with “group” as a unit.

- Option C: Make group behavior configurable per sequence item
  - Pros: Maximum flexibility.
  - Cons: More schema complexity in v1.

- Recommendation: Option A. Treat `groupId` as a simultaneous group step by default; users who want internal staggering can list individual elements explicitly.
- Decision status: accepted

### 19. How should `inspect --json` represent groups for LLM callers?

Now that grouped selectors are part of the manifest model, `inspect` should expose enough group structure for an LLM to use them intentionally.

- Option A: Include `groupIds` only on each element record

  ```json
  {
    "elements": [{ "id": "rect-1", "groupIds": ["group-a"] }]
  }
  ```

  - Pros: Minimal extra structure.
  - Cons: LLMs must reconstruct groups themselves.

- Option B: Include both per-element `groupIds` and a top-level `groups` summary per frame

  ```json
  {
    "frames": [
      {
        "id": "frame-a",
        "groups": [
          { "id": "group-a", "elementIds": ["rect-1", "text-2"] }
        ]
      }
    ]
  }
  ```

  - Pros: Best fit for LLM manifest authoring and clear discovery UX.
  - Cons: Slightly larger inspect output.

- Option C: Omit group information entirely from `inspect`
  - Pros: Simplest implementation.
  - Cons: Conflicts with supporting group-based sequence items.

- Recommendation: Option B. If grouped selectors are supported, `inspect` should expose them directly rather than forcing reconstruction.
- Decision status: accepted

### 20. How should animation defaults work when a target omits `sequence` entirely?

You chose to preserve reference-style default ordering when no explicit sequence is provided. We should pin whether that means “use frame-filtered source elements as-is” or “derive a normalized implicit sequence record internally.”

- Option A: Treat missing `sequence` as “use the frame-filtered elements in their existing reference/runtime order”

  ```json
  {
    "targets": [{ "frameId": "frame-a" }]
  }
  ```

  - Pros: Smallest manifests and closest to current behavior.
  - Cons: Less explicit for debugging.

- Option B: During load, synthesize an internal implicit sequence from discovered elements and pass that forward

  ```ts
  const sequence = explicitSequence ?? synthesizeDefaultSequence(elements)
  ```

  - Pros: Creates a single normalized execution model internally.
  - Cons: Slightly more implementation work.

- Option C: Require `manifest init` to always write explicit sequence records
  - Pros: Highly inspectable manifests.
  - Cons: Very noisy output and bad UX for large frames.

- Recommendation: Option B. Keep manifests short for humans/LLMs, but normalize everything into one internal execution structure.
- Decision status: accepted

### 21. What should happen when a manifest mixes `groupId` and `elementId` selectors that overlap?

Since v1 supports both grouped and per-element targeting, we need a precedence rule that allows refinement without making the manifest invalid too easily.

- Option A: Explicit `elementId` entries override group-derived behavior for overlapping elements

  ```json
  [
    { "groupId": "group-a", "order": 2, "durationMs": 1000 },
    { "elementId": "rect-1", "order": 5, "durationMs": 300 }
  ]
  ```

  - Pros: Intuitive refinement model and good authoring flexibility.
  - Cons: Requires de-duplication during normalization.

- Option B: Reject overlapping selectors as invalid
  - Pros: Simpler runtime behavior.
  - Cons: Too rigid for practical use.

- Option C: First matching entry wins
  - Pros: Easy to implement.
  - Cons: Brittle and order-sensitive.

- Recommendation: Option A. Let explicit per-element entries override group-derived defaults.
- Decision status: accepted

### 22. Should sequence items be allowed to reference elements outside the target frame?

Because target selection is frame-based in v1, cross-frame selectors would make render behavior much harder to reason about.

- Option A: Reject cross-frame references with a validation error

  ```json
  {
    "frameId": "frame-a",
    "sequence": [{ "elementId": "rect-from-frame-b", "order": 1 }]
  }
  ```

  - Pros: Safest and most predictable model.
  - Cons: Less flexible for unusual layouts.

- Option B: Allow cross-frame references
  - Pros: More expressive.
  - Cons: Breaks the frame-target mental model.

- Option C: Allow them only behind an explicit escape hatch
  - Pros: Flexible.
  - Cons: More schema and validation complexity.

- Recommendation: Option A. Keep v1 frame targets closed over their own membership.
- Decision status: accepted

### 23. If a frame target also lists explicit `elementIds`, what should that mean?

We need a refinement rule that works with the accepted future-friendly target schema.

- Option A: `elementIds` narrows the frame selection to a subset of frame members

  ```json
  {
    "kind": "frame",
    "frameId": "frame-a",
    "elementIds": ["rect-1", "text-2"]
  }
  ```

  - Pros: Useful refinement model without opening the door to arbitrary non-frame targeting in v1.
  - Cons: Adds one more selection rule to validate.

- Option B: Invalid; use either frame selection or element selection, not both
  - Pros: Simpler schema semantics.
  - Cons: Removes a practical narrowing capability.

- Option C: `elementIds` are additive to frame selection
  - Pros: Flexible.
  - Cons: Confusing and easy to misuse.

- Recommendation: Option A. Allow frame targets to narrow down to a subset of their own members.
- Decision status: accepted

### 8. What runtime dependency model is acceptable for the CLI?

The codebase already includes Playwright as a dev dependency, but there is no existing ffmpeg or PPTX dependency. We should decide whether external binaries are acceptable or whether everything must be npm-managed.

- Option A: Require Playwright/headless Chromium plus an installed `ffmpeg`, and add a JS PPTX library

  ```bash
  excalidraw-animate render animation.json --format mp4 --ffmpeg /usr/local/bin/ffmpeg
  ```

  - Pros: Practical, robust media pipeline, and easiest path to MP4/GIF quality.
  - Cons: More environment setup.

- Option B: Depend only on npm packages, avoiding external binaries where possible

  ```bash
  excalidraw-animate render animation.json --format gif
  ```

  - Pros: Simpler installation story in theory.
  - Cons: Likely weaker media quality or much more implementation work.

- Option C: Split rendering into pluggable backends and postpone picking a default
  - Pros: Flexible architecture.
  - Cons: Adds design complexity before the first working path exists.

- Recommendation: Option A. Pick one high-confidence pipeline first, and make dependency checks explicit in CLI diagnostics.
- Decision status: accepted

### 11. How should the LLM-facing workflow be packaged?

You asked for the design to include an LLM skill with CLI usage instructions. The question is whether that lives as documentation only or as a first-class workflow artifact alongside the CLI.

- Option A: Add an agent skill/document that teaches the CLI workflow, manifest authoring, `inspect`, and `render` usage

  ```md
  1. Run `excalidraw-animate inspect input.excalidraw --json`
  2. Create or update a manifest with selected frame targets
  3. Run `excalidraw-animate render manifest.json --format mp4`
  ```

  - Pros: Best fit for your intended LLM caller and keeps prompting conventions explicit.
  - Cons: Another artifact to maintain when CLI flags evolve.

- Option B: Rely on `--help` output plus README only
  - Pros: Less surface area.
  - Cons: Weaker orchestration guidance for agent callers.

- Option C: Put usage instructions only into manifest comments/examples
  - Pros: Keeps the workflow close to authoring.
  - Cons: Does not help with command discovery or agent sequencing.

- Recommendation: Option A. Treat the LLM skill as part of the user-facing design, not an afterthought.
- Decision status: accepted

### 12. How should target ordering be determined when exporting multiple selected frames?

Your local `General.excalidraw` file includes frame `customData.slidesOrder`, which suggests some drawings may already carry project-specific ordering hints. We should decide whether CLI ordering is manifest-owned, file-hint-aware, or both.

- Option A: Manifest target order is authoritative; frame metadata like `customData.slidesOrder` is only used by `inspect` as a hint

  ```json
  {
    "targets": [
      { "frameId": "af8ZT1J20rfKfOnyLTsyN", "name": "runner" },
      { "frameId": "AID-kV87HzNPeQ2wtkSfY", "name": "overview" }
    ]
  }
  ```

  - Pros: Deterministic and easy for LLMs to control.
  - Cons: Existing file hints are not automatically respected.

- Option B: Default to frame `customData.slidesOrder` when present, unless manifest order overrides it

  ```json
  {
    "targets": [
      { "frameId": "AID-kV87HzNPeQ2wtkSfY" }
    ]
  }
  ```

  - Pros: Can align with author intent in files that already carry ordering metadata.
  - Cons: Introduces hidden behavior from project-specific custom data.

- Option C: Ignore file hints entirely and sort frames by canvas position or source order
  - Pros: Simple implementation.
  - Cons: Least expressive and can fight user intent.

- Recommendation: Option A. Let `inspect` surface discovered hints such as `customData.slidesOrder`, but keep manifest target order as the only execution authority.
- Decision status: accepted

### 13. What should `inspect --json` return for each frame?

We have enough local evidence to know frames may have useful metadata such as `name`, bounds, and custom project metadata like `customData.slidesOrder`. The output should help an LLM decide what to animate without needing to reopen the source file.

- Option A: Minimal but useful

  ```json
  {
    "frames": [
      {
        "id": "AID-kV87HzNPeQ2wtkSfY",
        "name": "PRBOT 1",
        "elementIds": ["PBDaFnPghLm_ohwL5B8tg", "OYTybKyQ6ILSb5BP58qfa"]
      }
    ]
  }
  ```

  - Pros: Small and sufficient for basic manifest generation.
  - Cons: Less useful for previewing/planning.

- Option B: Rich inspection payload

  ```json
  {
    "frames": [
      {
        "id": "AID-kV87HzNPeQ2wtkSfY",
        "name": "PRBOT 1",
        "bounds": { "x": -676.6, "y": 324.1, "width": 1734.8, "height": 679.2 },
        "elementIds": ["PBDaFnPghLm_ohwL5B8tg"],
        "elementCount": 42,
        "customData": { "slidesOrder": 6 }
      }
    ]
  }
  ```

  - Pros: Best support for LLM decision-making and richer downstream tooling.
  - Cons: Larger output contract.

- Option C: IDs only
  - Pros: Smallest output.
  - Cons: Too weak for the intended workflow.

- Recommendation: Option B. Prefer a richer, stable JSON contract for agent callers.
- Decision status: accepted

### 14. What should `manifest init` do by default when frames exist?

You chose to make `manifest init` part of the v1 CLI surface. The default behavior should be opinionated enough that an LLM can use it directly without extra prompting.

- Option A: Create one target per frame in discovered order

  ```json
  {
    "targets": [
      { "frameId": "frame-1", "name": "Frame 1" },
      { "frameId": "frame-2", "name": "Frame 2" }
    ]
  }
  ```

  - Pros: Best first-run workflow and lowest friction for automation.
  - Cons: Can generate more targets than needed.

- Option B: Create an empty manifest plus discovered frame examples
  - Pros: More conservative.
  - Cons: Adds extra authoring work.

- Option C: Require explicit frame-selection flags during init
  - Pros: More controlled output.
  - Cons: Worse bootstrap UX.

- Recommendation: Option A. Let callers prune later rather than forcing more setup work up front.
- Decision status: accepted

### 15. What should the default animation order be when a target does not declare a sequence?

The reference implementation already has a runtime ordering behavior, so we need the CLI default to stay compatible unless the manifest says otherwise.

- Option A: Preserve the frame-filtered source/reference runtime order

  ```json
  {
    "targets": [{ "frameId": "frame-a" }]
  }
  ```

  - Pros: Closest to reference behavior and requires the least authoring.
  - Cons: Can feel opaque without inspection output.

- Option B: Re-sort by explicit file index only
  - Pros: Deterministic.
  - Cons: May drift from current runtime expectations.

- Option C: Require explicit sequence for every target
  - Pros: Maximum clarity.
  - Cons: High friction for common cases.

- Recommendation: Option A. Preserve reference behavior unless the manifest overrides it.
- Decision status: accepted

## Resolved Design Questions

- CLI source of truth for sequencing overrides - Accepted Option B because a sidecar manifest is non-destructive, automation-friendly, and still allows optional compatibility reads of legacy ID-embedded metadata.
- Interpretation of “export only specific frames” - Accepted Option A because Excalidraw Frame elements are the clearest user-facing target model, with explicit full-canvas fallback when no frames are used.
- Output pipeline for GIF / MP4 / PPTX - Accepted Option A because reusing animated SVG semantics in a headless browser minimizes drift from the reference implementation while enabling offline media export.
- Sidecar manifest shape - Accepted Option A because frame-centric target blocks are easiest for LLMs and humans to inspect, generate, and revise.
- Frame membership rule - Accepted Option A because research and local file evidence show first-class `frameId` membership; the CLI should use `element.frameId === selectedFrameId` as the primary rule, include the frame element itself by `id`, and treat geometry only as optional diagnostics rather than selection truth.
- ID discovery workflow - Accepted Option A because `inspect --json` is the most stable primitive for LLM orchestration, and a later `manifest init` can be layered on top.
- PowerPoint v1 export payload - Accepted Option A because embedded MP4 best preserves animation fidelity within the chosen render pipeline; native PowerPoint animation is deferred to v2.
- Runtime dependency model - Accepted Option A because headless browser plus external `ffmpeg` is the highest-confidence media pipeline for a first implementation.
- CLI surface for v1 - Accepted Option B because `inspect`, `manifest init`, and `render` form an explicit workflow that is easy for LLMs to automate.
- No-frame fallback - Accepted Option C because `inspect` should report the absence of frames and `manifest init` should create a `full-canvas` target that can later be refined.
- LLM workflow packaging - Accepted Option A because a dedicated skill/instructions artifact is the clearest way to teach an agent to inspect, author manifests, and render outputs consistently.
- Multi-target ordering - Accepted Option A because manifest target order should be the only execution authority, while discovered `customData.slidesOrder` remains an inspection hint only.
- Inspect payload richness - Accepted Option B because agent callers benefit from frame bounds, counts, and discovered metadata in addition to IDs.
- Manifest init default - Accepted Option A because generating one target per discovered frame is the best zero-to-one workflow for automation.
- Default animation order - Accepted Option A because the CLI should preserve reference/runtime ordering unless the manifest overrides it.
- Selector support in sequence items - Accepted Option B because group-level targeting is useful in real Excalidraw drawings and can be normalized before execution.
- Non-frame target extensibility - Accepted Option A because v1 should stay focused on frame/canvas targets while the manifest uses a `kind` discriminator so future subset targets can be added without redesign.
- Group selector execution semantics - Accepted Option A because a `groupId` should represent one simultaneous reveal step, with explicit element entries used for finer staggering.
- Group visibility in inspect output - Accepted Option B because callers should not need to reconstruct groups from raw element records.
- Internal normalization for missing sequences - Accepted Option B because the runtime should execute one normalized sequence model even when manifests omit explicit sequencing.
- Overlap precedence - Accepted Option A because explicit `elementId` entries should override group-derived defaults for overlapping elements.
- Cross-frame selector validation - Accepted Option A because frame targets should not silently reach outside their own membership in v1.
- Frame target subset narrowing - Accepted Option A because `elementIds` should be able to narrow a frame target to a subset of its own members without broadening v1 scope to arbitrary subsets.

## Alternatives Rejected

- Sidecar manifest shape / Option B - Not using indirection-heavy sequence references in the initial design because LLM-oriented workflows benefit from self-contained target blocks.
- Sidecar manifest shape / Option C - Not using a flat element-order map because it weakens the multi-target model.
- Frame membership rule / Option B - Not using geometry as the primary rule because Excalidraw already persists first-class `frameId` membership, and geometry can drift from membership semantics.
- Frame membership rule / Option C - Not requiring explicit `elementIds` for all frame targets because that adds too much authoring overhead for the common case.
- ID discovery workflow / Option B - Not using `manifest init` as the only primitive because callers also need pure inspection.
- ID discovery workflow / Option C - Not requiring raw `.excalidraw` inspection because it is a poor fit for LLM callers.
- PowerPoint v1 export payload / Option B - Not using GIF as the primary slide payload because MP4 better preserves quality and timing.
- PowerPoint v1 export payload / Option C - Not attempting native PowerPoint animation in v1 because it is too large a scope increase for the initial deliverable.
- CLI source of truth for sequencing overrides / Option A - Not using source-file ID mutation as the primary workflow because it is brittle for automation and hard to review.
- CLI source of truth for sequencing overrides / Option C - Not using CLI flags as the only sequencing surface because they do not scale for multi-element scenes.
- Interpretation of “export only specific frames” / Option B - Not using arbitrary element subsets as the primary framing model because they are harder to author and reason about.
- Interpretation of “export only specific frames” / Option C - Not using full-canvas-only export because it misses a core ticket requirement.
- Output pipeline for GIF / MP4 / PPTX / Option B - Not reimplementing playback server-side because it adds the most risk and drift.
- Output pipeline for GIF / MP4 / PPTX / Option C - Not postponing the requested formats because the ticket explicitly asks for them.
- Runtime dependency model / Option B - Not constraining v1 to npm-only rendering because it reduces confidence in media output quality.
- Runtime dependency model / Option C - Not designing a pluggable render backend system up front because it adds premature complexity.
- LLM workflow packaging / Option B - Not relying on README alone because agent callers need more explicit workflow guidance.
- LLM workflow packaging / Option C - Not relying on `--help` text alone because it is too shallow for the intended orchestration flow.
- Multi-target ordering / Option B - Not executing based on `customData.slidesOrder` because project-specific metadata should not silently override manifest intent.
- Multi-target ordering / Option C - Not using canvas/source order as execution authority because it is less explicit than manifest order.
- Inspect payload richness / Option A - Not using a minimal payload because richer frame metadata improves automated decision-making.
- Inspect payload richness / Option C - Not using IDs-only output because it is too weak for good LLM UX.
- Manifest init default / Option B - Not generating an empty shell because it adds unnecessary setup work.
- Manifest init default / Option C - Not requiring frame flags during init because it weakens the default bootstrap workflow.
- Default animation order / Option B - Not redefining the default as file-index sorting because the CLI should stay aligned with the reference behavior.
- Default animation order / Option C - Not requiring explicit sequences everywhere because that would make common cases too verbose.
- Selector support in sequence items / Option A - Not limiting selectors to individual elements because group-level control is useful and expected.
- Selector support in sequence items / Option C - Not postponing selectors because grouped control is already valuable for v1.
- Non-frame target extensibility / Option B - Not implementing arbitrary subset targets in v1 because it broadens scope too much.
- Non-frame target extensibility / Option C - Not deferring schema extensibility entirely because future non-frame targets should not require a breaking redesign.
- Group selector execution semantics / Option B - Not expanding groups into ordered child steps automatically because that weakens the meaning of a group as one logical unit.
- Group selector execution semantics / Option C - Not making group behavior configurable per item in v1 because it adds avoidable schema complexity.
- Group visibility in inspect output / Option A - Not forcing callers to reconstruct groups because grouped selectors are part of the supported workflow.
- Group visibility in inspect output / Option C - Not omitting groups from inspect because that would undercut discoverability.
- Internal normalization for missing sequences / Option A - Not special-casing missing sequences all the way through execution because a single normalized model is cleaner internally.
- Internal normalization for missing sequences / Option C - Not requiring explicit sequence materialization in manifests because it would make init output too noisy.
- Overlap precedence / Option B - Not rejecting overlapping selectors because authors need a practical refinement path.
- Overlap precedence / Option C - Not making selector order decide overlap semantics because that is brittle.
- Cross-frame selector validation / Option B - Not allowing cross-frame selectors in v1 because it breaks target clarity.
- Cross-frame selector validation / Option C - Not adding an escape hatch yet because the base model should remain strict.
- Frame target subset narrowing / Option B - Not forbidding `elementIds` narrowing because it is a useful refinement primitive.
- Frame target subset narrowing / Option C - Not making `elementIds` additive because that would blur the frame-target model.

## Risks or unknowns

- Excalidraw files may not consistently use Frame elements, so the fallback UX for unframed drawings must stay explicit.
- Some Excalidraw edge cases keep `frameId` even when geometry looks outside the frame, so the CLI should document that frame membership follows saved data, not canvas bounds.
- Group-level selectors add normalization complexity, especially when mixed with explicit element overrides targeting members of the same group.
- Future non-frame target support is planned for at the schema level, but the exact runtime semantics for `kind: "subset"` remain intentionally out of scope for v1.
- Headless browser SVG animation playback may expose fidelity differences versus the interactive browser app and will need early validation.
- The repository currently has Playwright but no established `ffmpeg` or PPTX dependency, so installation and packaging expectations remain open.
- Native PowerPoint shape animation is explicitly deferred to v2.
