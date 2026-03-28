import { readFile } from 'node:fs/promises';

export interface SceneElement {
  id: string;
  type: string;
  isDeleted?: boolean;
  frameId?: string | null;
  groupIds?: string[];
  name?: string | null;
  customData?: Record<string, unknown>;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface LoadedScene {
  elements: SceneElement[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

interface RawScene {
  elements?: unknown;
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function normalizeSceneElement(value: unknown): SceneElement | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id);
  const type = normalizeString(value.type);

  if (!id || !type) {
    return null;
  }

  const normalized: SceneElement = {
    ...value,
    id,
    type,
    groupIds: normalizeStringArray(value.groupIds),
    name: normalizeString(value.name),
  };

  if (value.frameId !== null) {
    normalized.frameId = normalizeString(value.frameId);
  }

  if (!isRecord(value.customData)) {
    delete normalized.customData;
  }

  return normalized;
}

export async function loadExcalidrawFile(filePath: string): Promise<LoadedScene> {
  const raw = JSON.parse(await readFile(filePath, 'utf8')) as RawScene;

  if (!isRecord(raw)) {
    throw new Error('Invalid scene: expected a top-level object.');
  }

  const { elements } = raw;

  if (elements != null && !Array.isArray(elements)) {
    throw new Error('Invalid scene: elements must be an array.');
  }

  return {
    elements: (elements ?? [])
      .map(normalizeSceneElement)
      .filter((element): element is SceneElement => element != null && !element.isDeleted),
    appState: isRecord(raw.appState) ? raw.appState : {},
    files: isRecord(raw.files) ? raw.files : {},
  };
}
