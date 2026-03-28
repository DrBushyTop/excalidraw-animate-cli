import type { LoadedScene, SceneElement } from '../io/load-excalidraw-file.js';
import type {
  ElementSequenceItem,
  GroupSequenceItem,
  SequenceItem,
  StrictManifestTarget,
} from '../manifest/schema.js';

export interface NormalizedTargetStep {
  order: number;
  elementIds: string[];
  durationMs?: number;
}

export interface NormalizedTargetPlan {
  target: StrictManifestTarget;
  elementIds: string[];
  elements: SceneElement[];
  steps: NormalizedTargetStep[];
}

function isElementSequenceItem(item: SequenceItem): item is ElementSequenceItem {
  return 'elementId' in item;
}

function isGroupSequenceItem(item: SequenceItem): item is GroupSequenceItem {
  return 'groupId' in item;
}

function getTargetElements(target: StrictManifestTarget, scene: LoadedScene): SceneElement[] {
  if (target.kind === 'canvas') {
    return [...scene.elements];
  }

  const frame = scene.elements.find(
    (element) => element.id === target.frameId && element.type === 'frame',
  );

  if (!frame) {
    throw new Error(`Frame target ${target.frameId} does not match a frame element.`);
  }

  return scene.elements.filter((element) => element.id === target.frameId || element.frameId === target.frameId);
}

function getNarrowedElements(target: StrictManifestTarget, sceneElements: SceneElement[]): SceneElement[] {
  if (!target.elementIds || target.elementIds.length === 0) {
    return sceneElements;
  }

  const allowedIds = new Set(sceneElements.map((element) => element.id));

  for (const elementId of target.elementIds) {
    if (!allowedIds.has(elementId)) {
      throw new Error(`Element ${elementId} is outside target frame.`);
    }
  }

  const narrowedIds = new Set(target.elementIds);
  return sceneElements.filter((element) => narrowedIds.has(element.id));
}

function buildDefaultSteps(elements: SceneElement[]): NormalizedTargetStep[] {
  return elements.map((element, index) => ({ order: index, elementIds: [element.id] }));
}

function buildOverrideByElementId(
  sequence: SequenceItem[],
  targetElements: SceneElement[],
): Map<string, { order: number; durationMs?: number }> {
  const allowedIds = new Set(targetElements.map((element) => element.id));
  const overrides = new Map<string, { order: number; durationMs?: number }>();
  const groups = new Map<string, string[]>();

  for (const element of targetElements) {
    for (const groupId of element.groupIds ?? []) {
      const group = groups.get(groupId) ?? [];
      group.push(element.id);
      groups.set(groupId, group);
    }
  }

  for (const item of sequence) {
    if (isElementSequenceItem(item)) {
      if (!allowedIds.has(item.elementId)) {
        throw new Error(`Element ${item.elementId} is outside target frame.`);
      }

      overrides.set(item.elementId, { order: item.order, durationMs: item.durationMs });
      continue;
    }

    if (isGroupSequenceItem(item)) {
      const groupMembers = groups.get(item.groupId) ?? [];

      if (groupMembers.length === 0) {
        throw new Error(`Group ${item.groupId} is outside target frame.`);
      }

      for (const elementId of groupMembers) {
        if (!overrides.has(elementId)) {
          overrides.set(elementId, { order: item.order, durationMs: item.durationMs });
        }
      }
    }
  }

  return overrides;
}

function buildStepsFromSequence(
  targetElements: SceneElement[],
  sequence: SequenceItem[],
): NormalizedTargetStep[] {
  const defaultSteps = buildDefaultSteps(targetElements);
  const overrides = buildOverrideByElementId(sequence, targetElements);
  const buckets = new Map<number, { elementIds: string[]; durationMs?: number }>();

  for (const [index, element] of targetElements.entries()) {
    const override = overrides.get(element.id);
    const order = override?.order ?? index;
    const bucket = buckets.get(order) ?? { elementIds: [], durationMs: override?.durationMs };

    bucket.elementIds.push(element.id);
    if (override?.durationMs != null) {
      bucket.durationMs = override.durationMs;
    }

    buckets.set(order, bucket);
  }

  if (sequence.length === 0) {
    return defaultSteps;
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([order, bucket]) => {
      const step: NormalizedTargetStep = {
        order,
        elementIds: bucket.elementIds,
      };

      if (bucket.durationMs != null) {
        step.durationMs = bucket.durationMs;
      }

      return step;
    });
}

export function normalizeTarget(target: StrictManifestTarget, scene: LoadedScene): NormalizedTargetPlan {
  const targetElements = getTargetElements(target, scene);
  const elements = getNarrowedElements(target, targetElements);
  const steps = buildStepsFromSequence(elements, target.sequence ?? []);

  return {
    target,
    elementIds: elements.map((element) => element.id),
    elements,
    steps,
  };
}
