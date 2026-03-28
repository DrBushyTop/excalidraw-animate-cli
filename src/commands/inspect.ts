import { inspectFile } from '../inspect/inspect-file.js';

const SUPPORTED_FLAGS = new Set(['--json']);

function sanitizeText(value: string): string {
  return value
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatFrameLabel(name: string | null | undefined, id: string): string {
  const sanitizedName = name ? sanitizeText(name) : '';
  const sanitizedId = sanitizeText(id);

  return sanitizedName ? `${sanitizedName} (${sanitizedId})` : sanitizedId;
}

function formatTextInspection(inspection: Awaited<ReturnType<typeof inspectFile>>): string {
  const lines = [`Frames: ${inspection.frames.length}`];

  for (const frame of inspection.frames) {
    lines.push(`- ${formatFrameLabel(frame.name, frame.id)}: ${frame.elementCount} elements`);
  }

  return `${lines.join('\n')}\n`;
}

export async function runInspect(args: string[]): Promise<void> {
  const flags = args.filter((arg) => arg.startsWith('-'));
  const unsupportedFlag = flags.find((flag) => !SUPPORTED_FLAGS.has(flag));

  if (unsupportedFlag) {
    throw new Error(`Unsupported flag: ${unsupportedFlag}`);
  }

  const json = flags.includes('--json');
  const filePaths = args.filter((arg) => !arg.startsWith('-'));

  if (filePaths.length > 1) {
    throw new Error('Multiple input files are not supported.');
  }

  const [filePath] = filePaths;

  if (!filePath) {
    throw new Error('Missing input .excalidraw file path.');
  }

  const inspection = await inspectFile(filePath);
  const output = json
    ? `${JSON.stringify(inspection, null, 2)}\n`
    : formatTextInspection(inspection);

  process.stdout.write(output);
}
