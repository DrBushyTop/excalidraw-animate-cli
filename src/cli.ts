#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { runInspect } from './commands/inspect.js';
import { runManifestInit } from './commands/manifest-init.js';
import { runRender } from './commands/render.js';

export interface CliCommandHandlers {
  runInspect: typeof runInspect;
  runManifestInit: typeof runManifestInit;
  runRender: typeof runRender;
}

export async function routeCli(
  argv: string[],
  handlers: CliCommandHandlers = { runInspect, runManifestInit, runRender },
): Promise<number> {
  const [command, ...args] = argv;

  if (command === 'inspect') {
    await handlers.runInspect(args);
    return 0;
  }

  if (command === 'manifest' && args[0] === 'init') {
    await handlers.runManifestInit(args.slice(1));
    return 0;
  }

  if (command === 'render') {
    await handlers.runRender(args);
    return 0;
  }

  const label = command ?? '<none>';
  process.stderr.write(`Unknown command: ${label}\n`);
  return 1;
}

const entrypoint = process.argv[1];

if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  const exitCode = await routeCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
