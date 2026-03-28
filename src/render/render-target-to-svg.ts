import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import type { LoadedScene, SceneElement } from '../io/load-excalidraw-file.js';
import type { StrictManifestTarget } from '../manifest/schema.js';
import { normalizeTarget } from './normalize-target.js';

export interface RenderTargetToSvgOptions {
  theme?: 'light' | 'dark';
}

export interface RenderTargetToSvgResult {
  svgText: string;
  finishedMs: number;
  width: number;
  height: number;
}

interface SerializedRenderPayload {
  elements: SceneElement[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  steps: ReturnType<typeof normalizeTarget>['steps'];
}

function filterRenderableElements(elements: SceneElement[], files: Record<string, unknown>): SceneElement[] {
  return elements.filter((element) => {
    if (element.type !== 'image') {
      return true;
    }
    const fileId = typeof element.fileId === 'string' ? element.fileId : null;
    return fileId != null && files[fileId] != null;
  });
}

function buildRendererScript(payloadPath: string, theme: 'light' | 'dark'): string {
  const rootDir = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const animateSvgModulePath = existsSync(path.join(rootDir, 'dist/render/animate-svg.js'))
    ? path.join(rootDir, 'dist/render/animate-svg.js')
    : path.join(rootDir, 'src/render/animate-svg.ts');
  const themeModulePath = existsSync(path.join(rootDir, 'dist/render/theme.js'))
    ? path.join(rootDir, 'dist/render/theme.js')
    : path.join(rootDir, 'src/render/theme.ts');
  const excalidrawModulePath = path.join(rootDir, 'node_modules/@excalidraw/excalidraw/dist/prod/index.js');
  const jsdomModulePath = path.join(rootDir, 'node_modules/jsdom/lib/api.js');
  const canvasModulePath = path.join(rootDir, 'node_modules/canvas/index.js');

  return `
import { readFile } from 'node:fs/promises';
import { JSDOM } from ${JSON.stringify(jsdomModulePath)};
import canvas from ${JSON.stringify(canvasModulePath)};

const payload = JSON.parse(await readFile(${JSON.stringify(payloadPath)}, 'utf8'));
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'https://example.test/' });
const { window } = dom;

class StubFontFace {
  constructor(family, source, descriptors = {}) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
    this.status = 'loaded';
  }

  load() {
    return Promise.resolve(this);
  }
}

const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define('window', window);
define('document', window.document);
define('navigator', window.navigator);
define('Node', window.Node);
define('Element', window.Element);
define('HTMLElement', window.HTMLElement);
define('SVGElement', window.SVGElement);
define('SVGSVGElement', window.SVGSVGElement);
define('SVGPathElement', window.SVGPathElement);
define('SVGImageElement', window.SVGImageElement);
define('HTMLCanvasElement', window.HTMLCanvasElement);
define('CanvasRenderingContext2D', canvas.CanvasRenderingContext2D);
define('Image', canvas.Image);
define('ImageData', canvas.ImageData);
define('FontFace', StubFontFace);
define('DOMParser', window.DOMParser);
define('XMLSerializer', window.XMLSerializer);
define('MutationObserver', window.MutationObserver);
define('getComputedStyle', window.getComputedStyle.bind(window));
define('requestAnimationFrame', window.requestAnimationFrame.bind(window));
define('cancelAnimationFrame', window.cancelAnimationFrame.bind(window));
define('performance', window.performance);
define('self', window);
define('top', window);
define('devicePixelRatio', 1);
define('localStorage', window.localStorage);
define('sessionStorage', window.sessionStorage);
define('atob', window.atob.bind(window));
define('btoa', window.btoa.bind(window));
define('matchMedia', (query) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));

window.HTMLCanvasElement.prototype.getContext = function(kind) {
  if (kind === '2d') {
    if (!this.__canvas) {
      this.__canvas = canvas.createCanvas(this.width || 300, this.height || 150);
    }
    return this.__canvas.getContext('2d');
  }
  return null;
};

window.HTMLCanvasElement.prototype.toDataURL = function(...args) {
  if (!this.__canvas) {
    this.__canvas = canvas.createCanvas(this.width || 300, this.height || 150);
  }
  return this.__canvas.toDataURL(...args);
};

Object.defineProperty(document, 'fonts', {
  value: {
    ready: Promise.resolve(),
    add() {},
    delete() { return false; },
    clear() {},
    load: async () => [],
    check: () => true,
  },
  configurable: true,
});

const { restore, exportToSvg } = await import(${JSON.stringify(excalidrawModulePath)});
const { animateSvg } = await import(${JSON.stringify(animateSvgModulePath)});
const { applyThemeToSvg } = await import(${JSON.stringify(themeModulePath)});

const restored = restore(payload, null, null);
const svg = await exportToSvg({
  elements: restored.elements.filter((element) => !element.isDeleted),
  files: restored.files,
  appState: restored.appState,
  exportPadding: 30,
  skipInliningFonts: true,
});

const themedSvg = applyThemeToSvg(svg, ${JSON.stringify(theme)});
const animation = animateSvg(themedSvg, payload.elements, payload.steps);
const svgText = new XMLSerializer().serializeToString(themedSvg);

process.stdout.write(JSON.stringify({
  svgText,
  finishedMs: animation.finishedMs,
  width: Number(themedSvg.getAttribute('width') || 0),
  height: Number(themedSvg.getAttribute('height') || 0),
}));
`;
}

function runBunScript(scriptPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', [scriptPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `bun render helper failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

export async function renderTargetToSvg(
  scene: LoadedScene,
  target: StrictManifestTarget,
  options: RenderTargetToSvgOptions = {},
): Promise<RenderTargetToSvgResult> {
  const normalized = normalizeTarget(target, scene);
  const elements = filterRenderableElements(normalized.elements, scene.files);
  const actualTempDir = await mkdtemp(path.join(os.tmpdir(), 'excalidraw-render-'));

  const payloadPath = path.join(actualTempDir, 'payload.json');
  const scriptPath = path.join(actualTempDir, 'render.mjs');

  const payload: SerializedRenderPayload = {
    elements,
    appState: scene.appState,
    files: scene.files,
    steps: normalized.steps,
  };

  await writeFile(payloadPath, JSON.stringify(payload), 'utf8');
  await writeFile(scriptPath, buildRendererScript(payloadPath, options.theme ?? 'light'), 'utf8');

  try {
    const stdout = await runBunScript(scriptPath);
    return JSON.parse(stdout) as RenderTargetToSvgResult;
  } finally {
    await rm(actualTempDir, { recursive: true, force: true });
  }
}
