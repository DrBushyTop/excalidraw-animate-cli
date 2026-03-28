import { loadExcalidrawFile } from '../io/load-excalidraw-file.js';
import { buildInspection, type InspectionResult } from './build-inspection.js';

export async function inspectFile(filePath: string): Promise<InspectionResult> {
  const scene = await loadExcalidrawFile(filePath);
  return buildInspection(scene);
}
