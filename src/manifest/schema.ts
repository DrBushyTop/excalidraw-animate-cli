import type { InspectionResult } from '../inspect/build-inspection.js';

export interface ManifestTarget {
  kind: 'frame' | 'canvas';
  name: string;
  frameId?: string;
  elementIds?: string[];
  sequence?: SequenceItem[];
}

export interface ElementSequenceItem {
  elementId: string;
  groupId?: never;
  order: number;
  durationMs?: number;
}

export interface GroupSequenceItem {
  elementId?: never;
  groupId: string;
  order: number;
  durationMs?: number;
}

export type SequenceItem = ElementSequenceItem | GroupSequenceItem;

export interface FrameManifestTarget {
  kind: 'frame';
  name: string;
  frameId: string;
  elementIds?: string[];
  sequence?: SequenceItem[];
}

export interface CanvasManifestTarget {
  kind: 'canvas';
  name: string;
  elementIds?: string[];
  sequence?: SequenceItem[];
}

export type StrictManifestTarget = FrameManifestTarget | CanvasManifestTarget;

export interface AnimationManifest {
  version: 1;
  sourceFile: string;
  targets: StrictManifestTarget[];
}

function getTargetName(name: string | null | undefined, frameId: string): string {
  if (name && name.trim()) {
    return name;
  }

  return frameId;
}

export function createManifestFromInspection(
  inspection: InspectionResult,
  sourceFile: string,
): AnimationManifest {
  if (inspection.frames.length === 0) {
    return {
      version: 1,
      sourceFile,
      targets: [{ kind: 'canvas', name: 'full-canvas' }],
    };
  }

  return {
    version: 1,
    sourceFile,
    targets: inspection.frames.map((frame) => ({
      kind: 'frame',
      frameId: frame.id,
      name: getTargetName(frame.name, frame.id),
    })),
  };
}
