import { inspectFile } from '../inspect/inspect-file.js';
import { createManifestFromInspection } from '../manifest/schema.js';

const SUPPORTED_FLAGS = new Set<string>();

export async function runManifestInit(args: string[]): Promise<void> {
  const separatorIndex = args.indexOf('--');
  const optionArgs = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args;
  const positionalArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];

  const flags = optionArgs.filter((arg) => arg.startsWith('-'));
  const unsupportedFlag = flags.find((flag) => !SUPPORTED_FLAGS.has(flag));

  if (unsupportedFlag) {
    throw new Error(`Unsupported flag: ${unsupportedFlag}`);
  }

  const filePaths = [
    ...optionArgs.filter((arg) => !arg.startsWith('-')),
    ...positionalArgs,
  ];

  if (filePaths.length > 1) {
    throw new Error('Multiple input files are not supported.');
  }

  const [filePath] = filePaths;

  if (!filePath) {
    throw new Error('Missing input .excalidraw file path.');
  }

  const inspection = await inspectFile(filePath);
  const manifest = createManifestFromInspection(inspection);

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
