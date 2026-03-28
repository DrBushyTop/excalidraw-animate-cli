import type { InspectionResult } from '../inspect/build-inspection.js';

export interface ManifestTarget {
  kind: 'frame' | 'canvas';
  name: string;
  frameId?: string;
  elementIds?: string[];
}

export interface FrameManifestTarget {
  kind: 'frame';
  name: string;
  frameId: string;
  elementIds?: string[];
}

export interface CanvasManifestTarget {
  kind: 'canvas';
  name: string;
  elementIds?: string[];
}

export type StrictManifestTarget = FrameManifestTarget | CanvasManifestTarget;

export interface AnimationManifest {
  version: 1;
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
): AnimationManifest {
  if (inspection.frames.length === 0) {
    return {
      version: 1,
      targets: [{ kind: 'canvas', name: 'full-canvas' }],
    };
  }

  return {
    version: 1,
    targets: inspection.frames.map((frame) => ({
      kind: 'frame',
      frameId: frame.id,
      name: getTargetName(frame.name, frame.id),
    })),
  };
}
