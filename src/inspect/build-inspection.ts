import type { LoadedScene, SceneElement } from '../io/load-excalidraw-file.js';

export interface InspectElement {
  id: string;
  type: string;
  groupIds: string[];
}

export interface InspectGroup {
  id: string;
  elementIds: string[];
}

export interface InspectFrame {
  id: string;
  name?: string | null;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  elementIds: string[];
  elementCount: number;
  customData?: Record<string, unknown>;
  groups: InspectGroup[];
  elements: InspectElement[];
}

export interface InspectionResult {
  hasFrames: boolean;
  frames: InspectFrame[];
}

function byId(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function asFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toInspectElement(element: SceneElement): InspectElement {
  return {
    id: element.id,
    type: element.type,
    groupIds: [...(element.groupIds ?? [])].sort(),
  };
}

function getFrameMembers(frame: SceneElement, elements: SceneElement[]): SceneElement[] {
  return elements
    .filter((element) => element.id === frame.id || element.frameId === frame.id)
    .sort(byId);
}

function getFrameGroups(elements: SceneElement[]): InspectGroup[] {
  const groups = new Map<string, string[]>();

  for (const element of elements) {
    for (const groupId of element.groupIds ?? []) {
      const groupElements = groups.get(groupId) ?? [];
      groupElements.push(element.id);
      groups.set(groupId, groupElements);
    }
  }

  return [...groups.entries()]
    .map(([id, elementIds]) => ({ id, elementIds: [...elementIds].sort() }))
    .sort(byId);
}

function toInspectFrame(frame: SceneElement, elements: SceneElement[]): InspectFrame {
  const members = getFrameMembers(frame, elements);

  return {
    id: frame.id,
    name: frame.name,
    bounds: {
      x: asFiniteNumber(frame.x),
      y: asFiniteNumber(frame.y),
      width: asFiniteNumber(frame.width),
      height: asFiniteNumber(frame.height),
    },
    elementIds: members.map((element) => element.id),
    elementCount: members.length,
    customData: frame.customData,
    groups: getFrameGroups(members),
    elements: members.map(toInspectElement),
  };
}

export function buildInspection(scene: LoadedScene): InspectionResult {
  const frames = scene.elements.filter((element) => element.type === 'frame').sort(byId);

  return {
    hasFrames: frames.length > 0,
    frames: frames.map((frame) => toInspectFrame(frame, scene.elements)),
  };
}
