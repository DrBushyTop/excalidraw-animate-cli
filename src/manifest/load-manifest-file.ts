import path from 'node:path';
import { readFile } from 'node:fs/promises';

import type {
  AnimationManifest,
  ElementSequenceItem,
  GroupSequenceItem,
  SequenceItem,
  StrictManifestTarget,
} from './schema.js';

export interface LoadedManifest extends AnimationManifest {
  sourceFile: string;
  targets: StrictManifestTarget[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isElementSequenceItem(value: unknown): value is ElementSequenceItem {
  return (
    isRecord(value) &&
    typeof value.elementId === 'string' &&
    !('groupId' in value) &&
    typeof value.order === 'number' &&
    (value.durationMs == null || typeof value.durationMs === 'number')
  );
}

function isGroupSequenceItem(value: unknown): value is GroupSequenceItem {
  return (
    isRecord(value) &&
    typeof value.groupId === 'string' &&
    !('elementId' in value) &&
    typeof value.order === 'number' &&
    (value.durationMs == null || typeof value.durationMs === 'number')
  );
}

function isSequenceItem(value: unknown): value is SequenceItem {
  return isElementSequenceItem(value) || isGroupSequenceItem(value);
}

function validateTarget(target: unknown): target is StrictManifestTarget {
  if (!isRecord(target) || typeof target.kind !== 'string' || typeof target.name !== 'string') {
    return false;
  }

  if (target.kind === 'frame') {
    if (typeof target.frameId !== 'string') {
      return false;
    }
  } else if (target.kind !== 'canvas') {
    return false;
  }

  if (target.elementIds != null && !isStringArray(target.elementIds)) {
    return false;
  }

  if (target.sequence != null && (!Array.isArray(target.sequence) || !target.sequence.every(isSequenceItem))) {
    return false;
  }

  return true;
}

export async function loadManifestFile(filePath: string): Promise<LoadedManifest> {
  const raw = JSON.parse(await readFile(filePath, 'utf8')) as unknown;

  if (!isRecord(raw)) {
    throw new Error('Invalid manifest: expected a top-level object.');
  }

  if (raw.version !== 1) {
    throw new Error('Invalid manifest: only version 1 is supported.');
  }

  if (typeof raw.sourceFile !== 'string' || raw.sourceFile.trim() === '') {
    throw new Error('Invalid manifest: source file path is required.');
  }

  if (!Array.isArray(raw.targets) || !raw.targets.every(validateTarget)) {
    throw new Error('Invalid manifest: targets must be valid frame or canvas targets.');
  }

  return {
    version: 1,
    sourceFile: path.resolve(path.dirname(filePath), raw.sourceFile),
    targets: raw.targets,
  };
}
