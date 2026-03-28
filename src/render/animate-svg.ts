import { getFreeDrawSvgPath } from '@excalidraw/excalidraw';

import type { SceneElement } from '../io/load-excalidraw-file.js';

export interface AnimateSvgOptions {
  startMs?: number;
  pointerImg?: string;
  pointerWidth?: string;
  pointerHeight?: string;
}

export interface AnimateSvgStep {
  order: number;
  elementIds: string[];
  durationMs?: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function findNode(element: SVGElement, name: string): SVGElement | null {
  const childNodes = element.childNodes as NodeListOf<SVGElement>;
  for (let index = 0; index < childNodes.length; index += 1) {
    if (childNodes[index]?.tagName === name) {
      return childNodes[index] ?? null;
    }
  }
  return null;
}

function hideBeforeAnimation(
  svg: SVGSVGElement,
  element: SVGElement,
  currentMs: number,
  durationMs: number,
  freeze?: boolean,
): void {
  element.setAttribute('opacity', '0');
  const animate = svg.ownerDocument.createElementNS(SVG_NS, 'animate');
  animate.setAttribute('attributeName', 'opacity');
  animate.setAttribute('from', '1');
  animate.setAttribute('to', '1');
  animate.setAttribute('begin', `${currentMs}ms`);
  animate.setAttribute('dur', `${durationMs}ms`);
  if (freeze) {
    animate.setAttribute('fill', 'freeze');
  }
  element.appendChild(animate);
}

function pickOnePathItem(path: string): string {
  const items = path.match(/(M[^C]*C[^M]*)/g);
  if (!items) {
    return path;
  }
  if (items.length <= 2) {
    return items[items.length - 1] ?? path;
  }
  const [longestIndex] = items.reduce<[number, number]>((previous, item, index) => {
    const [, x1, y1, x2, y2] = item.match(/M([\d.-]+) ([\d.-]+) C([\d.-]+) ([\d.-]+)/) || [];
    const distance = Math.hypot(Number(x2) - Number(x1), Number(y2) - Number(y1));
    if (distance > previous[1]) {
      return [index, distance];
    }
    return previous;
  }, [0, 0]);
  return items[longestIndex] ?? path;
}

function animatePointer(
  svg: SVGSVGElement,
  element: SVGElement,
  path: string,
  currentMs: number,
  durationMs: number,
  options: AnimateSvgOptions,
): void {
  if (!options.pointerImg) {
    return;
  }

  const image = svg.ownerDocument.createElementNS(SVG_NS, 'image');
  image.setAttribute('href', options.pointerImg);
  if (options.pointerWidth) {
    image.setAttribute('width', options.pointerWidth);
  }
  if (options.pointerHeight) {
    image.setAttribute('height', options.pointerHeight);
  }
  hideBeforeAnimation(svg, image, currentMs, durationMs);

  const animateMotion = svg.ownerDocument.createElementNS(SVG_NS, 'animateMotion');
  animateMotion.setAttribute('path', pickOnePathItem(path));
  animateMotion.setAttribute('begin', `${currentMs}ms`);
  animateMotion.setAttribute('dur', `${durationMs}ms`);
  image.appendChild(animateMotion);
  element.parentNode?.appendChild(image);
}

function animatePath(
  svg: SVGSVGElement,
  element: SVGElement,
  currentMs: number,
  durationMs: number,
  options: AnimateSvgOptions,
): void {
  const dTo = element.getAttribute('d') || '';
  const moveCount = dTo.match(/M/g)?.length || 0;
  const curveCount = dTo.match(/C/g)?.length || 0;
  const repeat = curveCount / Math.max(moveCount, 1);
  let dLast = dTo;

  for (let index = repeat - 1; index >= 0; index -= 1) {
    const dFrom = dTo.replace(
      new RegExp(
        ['M(\\S+) (\\S+)', '((?: C\\S+ \\S+, \\S+ \\S+, \\S+ \\S+){', `${index}`, '})', '(?: C\\S+ \\S+, \\S+ \\S+, \\S+ \\S+){1,}'].join(''),
        'g',
      ),
      (...matches: string[]) => {
        const [x, y] = matches[3]
          ? (matches[3].match(/.* (\S+) (\S+)$/)?.slice(1, 3) ?? [matches[1], matches[2]])
          : [matches[1], matches[2]];
        return `M${matches[1]} ${matches[2]}${matches[3]}` + ` C${x} ${y}, ${x} ${y}, ${x} ${y}`.repeat(repeat - index);
      },
    );

    if (index === 0) {
      element.setAttribute('d', dFrom);
    }

    const animate = svg.ownerDocument.createElementNS(SVG_NS, 'animate');
    animate.setAttribute('attributeName', 'd');
    animate.setAttribute('from', dFrom);
    animate.setAttribute('to', dLast);
    animate.setAttribute('begin', `${currentMs + index * (durationMs / repeat)}ms`);
    animate.setAttribute('dur', `${durationMs / repeat}ms`);
    animate.setAttribute('fill', 'freeze');
    element.appendChild(animate);
    dLast = dFrom;
  }

  animatePointer(svg, element, dTo, currentMs, durationMs, options);
  hideBeforeAnimation(svg, element, currentMs, durationMs, true);
}

function animateFillPath(
  svg: SVGSVGElement,
  element: SVGElement,
  currentMs: number,
  durationMs: number,
  options: AnimateSvgOptions,
): void {
  const dTo = element.getAttribute('d') || '';
  if (dTo.includes('C')) {
    animatePath(svg, element, currentMs, durationMs, options);
    return;
  }
  const dFrom = dTo.replace(/M(\S+) (\S+)((?: L\S+ \S+){1,})/, (...matches: string[]) => {
    return `M${matches[1]} ${matches[2]}` + matches[3].replace(/L\S+ \S+/g, `L${matches[1]} ${matches[2]}`);
  });
  element.setAttribute('d', dFrom);
  const animate = svg.ownerDocument.createElementNS(SVG_NS, 'animate');
  animate.setAttribute('attributeName', 'd');
  animate.setAttribute('from', dFrom);
  animate.setAttribute('to', dTo);
  animate.setAttribute('begin', `${currentMs}ms`);
  animate.setAttribute('dur', `${durationMs}ms`);
  animate.setAttribute('fill', 'freeze');
  element.appendChild(animate);
}

function animatePolygon(
  svg: SVGSVGElement,
  element: SVGElement,
  currentMs: number,
  durationMs: number,
  options: AnimateSvgOptions,
): void {
  let dTo = element.getAttribute('d') || '';
  let moveCount = dTo.match(/M/g)?.length || 0;
  let curveCount = dTo.match(/C/g)?.length || 0;
  if (moveCount === curveCount + 1) {
    dTo = dTo.replace(/^M\S+ \S+ M/, 'M');
    moveCount = dTo.match(/M/g)?.length || 0;
    curveCount = dTo.match(/C/g)?.length || 0;
  }
  if (moveCount !== curveCount) {
    throw new Error('unexpected m/c counts');
  }
  const duplicates = element.getAttribute('stroke-dasharray') ? 1 : Math.min(2, moveCount);
  const repeat = moveCount / duplicates;
  let dLast = dTo;

  for (let index = repeat - 1; index >= 0; index -= 1) {
    const dFrom = dTo.replace(
      new RegExp(
        [
          '((?:',
          'M(\\S+) (\\S+) C\\S+ \\S+, \\S+ \\S+, \\S+ \\S+ ?'.repeat(duplicates),
          '){',
          `${index}`,
          '})',
          'M(\\S+) (\\S+) C\\S+ \\S+, \\S+ \\S+, \\S+ \\S+ ?'.repeat(duplicates),
          '.*',
        ].join(''),
      ),
      (...matches: string[]) => {
        return (
          `${matches[1]}` +
          [...Array(duplicates).keys()]
            .map((duplicateIndex) => {
              const [x, y] = matches.slice(2 + duplicates * 2 + duplicateIndex * 2);
              return `M${x} ${y} C${x} ${y}, ${x} ${y}, ${x} ${y} `;
            })
            .join('')
            .repeat(repeat - index)
        );
      },
    );

    if (index === 0) {
      element.setAttribute('d', dFrom);
    }

    const animate = svg.ownerDocument.createElementNS(SVG_NS, 'animate');
    animate.setAttribute('attributeName', 'd');
    animate.setAttribute('from', dFrom);
    animate.setAttribute('to', dLast);
    animate.setAttribute('begin', `${currentMs + index * (durationMs / repeat)}ms`);
    animate.setAttribute('dur', `${durationMs / repeat}ms`);
    animate.setAttribute('fill', 'freeze');
    element.appendChild(animate);
    dLast = dFrom;

    animatePointer(
      svg,
      element,
      dTo.replace(
        new RegExp(
          ['(?:', 'M\\S+ \\S+ C\\S+ \\S+, \\S+ \\S+, \\S+ \\S+ ?'.repeat(duplicates), '){', `${index}`, '}', '(M\\S+ \\S+ C\\S+ \\S+, \\S+ \\S+, \\S+ \\S+) ?'.repeat(duplicates), '.*'].join(''),
        ),
        '$1',
      ),
      currentMs + index * (durationMs / repeat),
      durationMs / repeat,
      options,
    );
  }

  hideBeforeAnimation(svg, element, currentMs, durationMs, true);
}

let pathForTextIndex = 0;

function animateText(
  svg: SVGSVGElement,
  width: number,
  element: SVGElement,
  currentMs: number,
  durationMs: number,
  options: AnimateSvgOptions,
): void {
  const anchor = element.getAttribute('text-anchor') || 'start';
  if (anchor !== 'start') {
    const toOpacity = element.getAttribute('opacity') || '1.0';
    const animate = svg.ownerDocument.createElementNS(SVG_NS, 'animate');
    animate.setAttribute('attributeName', 'opacity');
    animate.setAttribute('from', '0.0');
    animate.setAttribute('to', toOpacity);
    animate.setAttribute('begin', `${currentMs}ms`);
    animate.setAttribute('dur', `${durationMs}ms`);
    animate.setAttribute('fill', 'freeze');
    element.appendChild(animate);
    element.setAttribute('opacity', '0.0');
    return;
  }

  const x = Number(element.getAttribute('x') || 0);
  const y = Number(element.getAttribute('y') || 0);
  pathForTextIndex += 1;
  const path = svg.ownerDocument.createElementNS(SVG_NS, 'path');
  path.setAttribute('id', `pathForText${pathForTextIndex}`);
  const animate = svg.ownerDocument.createElementNS(SVG_NS, 'animate');
  animate.setAttribute('attributeName', 'd');
  animate.setAttribute('from', `m${x} ${y} h0`);
  animate.setAttribute('to', `m${x} ${y} h${width}`);
  animate.setAttribute('begin', `${currentMs}ms`);
  animate.setAttribute('dur', `${durationMs}ms`);
  animate.setAttribute('fill', 'freeze');
  path.appendChild(animate);

  const textPath = svg.ownerDocument.createElementNS(SVG_NS, 'textPath');
  textPath.setAttribute('href', `#pathForText${pathForTextIndex}`);
  textPath.textContent = element.textContent;
  element.textContent = ' ';
  findNode(svg, 'defs')?.appendChild(path);
  element.appendChild(textPath);
  animatePointer(svg, element, `m${x} ${y} h${width}`, currentMs, durationMs, options);
}

function animateFromToPath(
  svg: SVGSVGElement,
  element: SVGElement,
  dFrom: string,
  dTo: string,
  currentMs: number,
  durationMs: number,
): void {
  const path = svg.ownerDocument.createElementNS(SVG_NS, 'path');
  const animate = svg.ownerDocument.createElementNS(SVG_NS, 'animate');
  animate.setAttribute('attributeName', 'd');
  animate.setAttribute('from', dFrom);
  animate.setAttribute('to', dTo);
  animate.setAttribute('begin', `${currentMs}ms`);
  animate.setAttribute('dur', `${durationMs}ms`);
  path.appendChild(animate);
  element.appendChild(path);
}

function patchSvgLine(
  svg: SVGSVGElement,
  element: SVGElement,
  isRounded: boolean,
  currentMs: number,
  durationMs: number,
  options: AnimateSvgOptions,
): void {
  const animateLine = isRounded ? animatePath : animatePolygon;
  const childNodes = element.childNodes as NodeListOf<SVGElement>;
  if (childNodes[0]?.getAttribute('fill-rule')) {
    animateLine(svg, childNodes[0]?.childNodes[1] as SVGElement, currentMs, durationMs * 0.75, options);
    currentMs += durationMs * 0.75;
    animateFillPath(svg, childNodes[0]?.childNodes[0] as SVGElement, currentMs, durationMs * 0.25, options);
  } else {
    animateLine(svg, childNodes[0]?.childNodes[0] as SVGElement, currentMs, durationMs, options);
  }
}

function patchSvgArrow(
  svg: SVGSVGElement,
  element: SVGElement,
  isRounded: boolean,
  currentMs: number,
  durationMs: number,
  options: AnimateSvgOptions,
): void {
  const animateLine = isRounded ? animatePath : animatePolygon;
  const partCount = element.childNodes.length;
  animateLine(svg, element.childNodes[0]?.childNodes[0] as SVGElement, currentMs, (durationMs / (partCount + 2)) * 3, options);
  currentMs += (durationMs / (partCount + 2)) * 3;

  for (let partIndex = 1; partIndex < partCount; partIndex += 1) {
    const childCount = element.childNodes[partIndex]?.childNodes.length ?? 0;
    for (let childIndex = 0; childIndex < childCount; childIndex += 1) {
      animatePath(
        svg,
        element.childNodes[partIndex]?.childNodes[childIndex] as SVGElement,
        currentMs,
        durationMs / (partCount + 2) / childCount,
        options,
      );
      currentMs += durationMs / (partCount + 2) / childCount;
    }
  }
}

function patchSvgRectangle(
  svg: SVGSVGElement,
  element: SVGElement,
  currentMs: number,
  durationMs: number,
  options: AnimateSvgOptions,
): void {
  if (element.childNodes[1]) {
    animatePolygon(svg, element.childNodes[1] as SVGElement, currentMs, durationMs * 0.75, options);
    currentMs += durationMs * 0.75;
    animateFillPath(svg, element.childNodes[0] as SVGElement, currentMs, durationMs * 0.25, options);
  } else {
    animatePolygon(svg, element.childNodes[0] as SVGElement, currentMs, durationMs, options);
  }
}

function patchSvgEllipse(
  svg: SVGSVGElement,
  element: SVGElement,
  currentMs: number,
  durationMs: number,
  options: AnimateSvgOptions,
): void {
  if (element.childNodes[1]) {
    animatePath(svg, element.childNodes[1] as SVGElement, currentMs, durationMs * 0.75, options);
    currentMs += durationMs * 0.75;
    animateFillPath(svg, element.childNodes[0] as SVGElement, currentMs, durationMs * 0.25, options);
  } else {
    animatePath(svg, element.childNodes[0] as SVGElement, currentMs, durationMs, options);
  }
}

function patchSvgText(
  svg: SVGSVGElement,
  element: SVGElement,
  width: number,
  currentMs: number,
  durationMs: number,
  options: AnimateSvgOptions,
): void {
  const childNodes = element.childNodes as NodeListOf<SVGElement>;
  const length = childNodes.length;
  childNodes.forEach((child) => {
    animateText(svg, width, child, currentMs, durationMs / length, options);
    currentMs += durationMs / length;
  });
}

function patchSvgFreedraw(
  svg: SVGSVGElement,
  element: SVGElement,
  freeDrawElement: SceneElement,
  currentMs: number,
  durationMs: number,
  options: AnimateSvgOptions,
): void {
  const childNode = element.childNodes[0] as SVGPathElement;
  childNode.setAttribute('opacity', '0');
  const animate = svg.ownerDocument.createElementNS(SVG_NS, 'animate');
  animate.setAttribute('attributeName', 'opacity');
  animate.setAttribute('from', '0');
  animate.setAttribute('to', '1');
  animate.setAttribute('calcMode', 'discrete');
  animate.setAttribute('begin', `${currentMs + durationMs - 1}ms`);
  animate.setAttribute('dur', '1ms');
  animate.setAttribute('fill', 'freeze');
  childNode.appendChild(animate);

  const points = Array.isArray(freeDrawElement.points) ? (freeDrawElement.points as Array<[number, number]>) : [];
  animatePointer(
    svg,
    childNode,
    points.reduce((path, [x, y]) => (path ? `${path} T ${x} ${y}` : `M ${x} ${y}`), ''),
    currentMs,
    durationMs,
    options,
  );

  const repeat = points.length;
  let dTo = childNode.getAttribute('d') as string;
  for (let index = repeat - 1; index >= 0; index -= 1) {
    const dFrom =
      index > 0
        ? getFreeDrawSvgPath({
            ...(freeDrawElement as unknown as Parameters<typeof getFreeDrawSvgPath>[0]),
            points: points.slice(0, index),
          })
        : 'M 0 0';
    animateFromToPath(svg, element, dFrom, dTo, currentMs + index * (durationMs / repeat), durationMs / repeat);
    dTo = dFrom;
  }
}

function patchSvgImage(
  svg: SVGSVGElement,
  element: SVGElement,
  currentMs: number,
  durationMs: number,
): void {
  const toOpacity = element.getAttribute('opacity') || '1.0';
  const animate = svg.ownerDocument.createElementNS(SVG_NS, 'animate');
  animate.setAttribute('attributeName', 'opacity');
  animate.setAttribute('from', '0.0');
  animate.setAttribute('to', toOpacity);
  animate.setAttribute('begin', `${currentMs}ms`);
  animate.setAttribute('dur', `${durationMs}ms`);
  animate.setAttribute('fill', 'freeze');
  element.appendChild(animate);
  element.setAttribute('opacity', '0.0');
}

function patchSvgElement(
  svg: SVGSVGElement,
  element: SVGElement,
  excalidrawElement: SceneElement,
  currentMs: number,
  durationMs: number,
  options: AnimateSvgOptions,
): void {
  const { type, roundness } = excalidrawElement;
  const width = typeof excalidrawElement.width === 'number' ? excalidrawElement.width : 0;

  if (type === 'line') {
    patchSvgLine(svg, element, !!roundness, currentMs, durationMs, options);
  } else if (type === 'arrow') {
    patchSvgArrow(svg, element, !!roundness, currentMs, durationMs, options);
  } else if (type === 'rectangle' || type === 'diamond') {
    patchSvgRectangle(svg, element, currentMs, durationMs, options);
  } else if (type === 'ellipse') {
    patchSvgEllipse(svg, element, currentMs, durationMs, options);
  } else if (type === 'text') {
    patchSvgText(svg, element, width, currentMs, durationMs, options);
  } else if (type === 'freedraw') {
    patchSvgFreedraw(svg, element, excalidrawElement, currentMs, durationMs, options);
  } else if (type === 'image') {
    patchSvgImage(svg, element, currentMs, durationMs);
  }
}

function filterGroupNodes(nodes: NodeListOf<SVGElement>): SVGElement[] {
  return [...nodes].filter((node) => node.tagName === 'g' || node.tagName === 'use');
}

function extractNumberFromElement(element: SceneElement, key: string): number {
  const match = element.id.match(new RegExp(`${key}:(-?\\d+)`));
  return (match && Number(match[1])) || 0;
}

function sortSvgNodes(nodes: SVGElement[], elements: readonly SceneElement[], stepByElementId: Map<string, AnimateSvgStep>): SVGElement[] {
  return [...nodes].sort((left, right) => {
    const leftIndex = nodes.indexOf(left);
    const rightIndex = nodes.indexOf(right);
    const leftElement = elements[leftIndex];
    const rightElement = elements[rightIndex];
    if (!leftElement || !rightElement) {
      return leftIndex - rightIndex;
    }
    const leftExplicitOrder = stepByElementId.get(leftElement.id)?.order;
    const rightExplicitOrder = stepByElementId.get(rightElement.id)?.order;
    const leftOrder = leftExplicitOrder ?? extractNumberFromElement(leftElement, 'animateOrder') ?? leftIndex;
    const rightOrder = rightExplicitOrder ?? extractNumberFromElement(rightElement, 'animateOrder') ?? rightIndex;
    return leftOrder - rightOrder || leftIndex - rightIndex;
  });
}

function createStepByElementId(steps: AnimateSvgStep[]): Map<string, AnimateSvgStep> {
  const mapping = new Map<string, AnimateSvgStep>();
  for (const step of steps) {
    for (const elementId of step.elementIds) {
      mapping.set(elementId, step);
    }
  }
  return mapping;
}

export function animateSvg(
  svg: SVGSVGElement,
  elements: readonly SceneElement[],
  steps: readonly AnimateSvgStep[],
  options: AnimateSvgOptions = {},
): { finishedMs: number } {
  const groupNodes = filterGroupNodes(svg.childNodes as NodeListOf<SVGElement>);
  if (groupNodes.length !== elements.length) {
    throw new Error('element length mismatch');
  }

  const stepByElementId = createStepByElementId([...steps]);
  const nodeByElementId = new Map<string, SVGElement>();
  elements.forEach((element, index) => {
    const node = groupNodes[index];
    if (node) {
      nodeByElementId.set(element.id, node);
    }
  });

  sortSvgNodes(groupNodes, elements, stepByElementId);

  let current = options.startMs ?? 1000;
  const defaultIndividualDuration = 500;

  const seen = new Set<string>();
  for (const step of [...steps].sort((left, right) => left.order - right.order)) {
    const stepElements = step.elementIds
      .map((elementId) => elements.find((element) => element.id === elementId))
      .filter((element): element is SceneElement => element != null);
    const durationMs =
      step.durationMs ??
      Math.max(
        ...stepElements.map((element) => extractNumberFromElement(element, 'animateDuration')),
        defaultIndividualDuration,
      );

    for (const element of stepElements) {
      if (seen.has(element.id)) {
        continue;
      }
      const node = nodeByElementId.get(element.id);
      if (!node) {
        continue;
      }
      patchSvgElement(svg, node, element, current, durationMs, options);
      seen.add(element.id);
    }

    current += durationMs;
  }

  return { finishedMs: current + 1000 };
}

export function getBeginTimeList(svg: SVGSVGElement): number[] {
  const beginTimeList: number[] = [];
  const tmpTimeList: number[] = [];

  const findAnimate = (element: SVGElement): void => {
    if (element.tagName === 'animate') {
      const match = /([0-9.]+)ms/.exec(element.getAttribute('begin') || '');
      if (match) {
        tmpTimeList.push(Number(match[1]));
      }
    }
    (element.childNodes as NodeListOf<SVGElement>).forEach((child) => {
      findAnimate(child);
    });
  };

  (svg.childNodes as NodeListOf<SVGElement>).forEach((element) => {
    if (element.tagName === 'g') {
      findAnimate(element);
      if (tmpTimeList.length > 0) {
        beginTimeList.push(Math.min(...tmpTimeList));
        tmpTimeList.splice(0);
      }
    } else if (element.tagName === 'defs') {
      (element.childNodes as NodeListOf<SVGElement>).forEach((child) => {
        findAnimate(child);
        if (tmpTimeList.length > 0) {
          beginTimeList.push(Math.min(...tmpTimeList));
          tmpTimeList.splice(0);
        }
      });
    }
  });

  return beginTimeList;
}
