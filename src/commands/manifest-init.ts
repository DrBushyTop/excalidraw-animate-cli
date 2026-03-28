import { loadExcalidrawFile } from '../io/load-excalidraw-file.js';
import { inspectFile } from '../inspect/inspect-file.js';
import { createManifestFromInspection } from '../manifest/schema.js';
import { buildSequenceFromArrows } from '../manifest/sequence-builder.js';
import type { AnimationManifest, StrictManifestTarget } from '../manifest/schema.js';

const SUPPORTED_FLAGS = new Set<string>(['--frame', '--sequence']);

function extractNamedFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);

  if (index < 0) {
    return null;
  }

  const value = args[index + 1];

  if (value === undefined || value.startsWith('-')) {
    throw new Error(`Flag ${flag} requires a value.`);
  }

  return value;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export async function runManifestInit(args: string[]): Promise<void> {
  const separatorIndex = args.indexOf('--');
  const optionArgs = separatorIndex >= 0 ? args.slice(0, separatorIndex) : args;
  const positionalArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : [];

  const flags = optionArgs.filter((arg) => arg.startsWith('-'));
  const unsupportedFlag = flags.find((flag) => !SUPPORTED_FLAGS.has(flag));

  if (unsupportedFlag) {
    throw new Error(`Unsupported flag: ${unsupportedFlag}`);
  }

  const frameName = extractNamedFlag(optionArgs, '--frame');
  const withSequence = hasFlag(optionArgs, '--sequence');

  // Collect positional args: everything that is not a flag and not a flag value
  const flagValues = new Set<string>();

  for (let i = 0; i < optionArgs.length; i++) {
    if (SUPPORTED_FLAGS.has(optionArgs[i])) {
      // --frame takes a value, --sequence does not
      if (optionArgs[i] === '--frame') {
        flagValues.add(optionArgs[i]);

        if (i + 1 < optionArgs.length) {
          flagValues.add(optionArgs[i + 1]);
        }
      } else {
        flagValues.add(optionArgs[i]);
      }
    }
  }

  const filePaths = [
    ...optionArgs.filter((arg) => !arg.startsWith('-') && !flagValues.has(arg)),
    ...positionalArgs,
  ];

  if (filePaths.length > 1) {
    throw new Error('Multiple input files are not supported.');
  }

  const [filePath] = filePaths;

  if (!filePath) {
    throw new Error('Missing input .excalidraw file path.');
  }

  if (withSequence && !frameName) {
    throw new Error('--sequence requires --frame to specify which frame to sequence.');
  }

  const inspection = await inspectFile(filePath);

  let manifest: AnimationManifest;

  if (frameName) {
    const frame = inspection.frames.find(
      (f) => f.name === frameName || f.id === frameName,
    );

    if (!frame) {
      const available = inspection.frames
        .map((f) => f.name ?? f.id)
        .join(', ');
      throw new Error(`Frame "${frameName}" not found. Available frames: ${available}`);
    }

    const target: StrictManifestTarget = {
      kind: 'frame',
      frameId: frame.id,
      name: frame.name && frame.name.trim() ? frame.name : frame.id,
    };

    if (withSequence) {
      const scene = await loadExcalidrawFile(filePath);
      const sequence = buildSequenceFromArrows(scene, frame.id);
      target.sequence = sequence;
    }

    manifest = {
      version: 1,
      sourceFile: filePath,
      targets: [target],
    };
  } else {
    manifest = createManifestFromInspection(inspection, filePath);
  }

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
