import type { LoadedScene, SceneElement } from '../io/load-excalidraw-file.js';
import type { ElementSequenceItem } from './schema.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getBindingElementId(binding: unknown): string | null {
  if (!isRecord(binding)) {
    return null;
  }

  return typeof binding.elementId === 'string' ? binding.elementId : null;
}

function getContainerTextId(element: SceneElement, allElements: SceneElement[]): string | null {
  const boundElements = element.boundElements;

  if (!Array.isArray(boundElements)) {
    return null;
  }

  for (const bound of boundElements) {
    if (isRecord(bound) && bound.type === 'text' && typeof bound.id === 'string') {
      const textElement = allElements.find((el) => el.id === bound.id);

      if (textElement) {
        return textElement.id;
      }
    }
  }

  return null;
}

interface GraphEdge {
  arrowId: string;
  targetId: string;
}

interface ArrowInfo {
  arrowId: string;
  startElementId: string | null;
  endElementId: string | null;
}

function isBoxElement(element: SceneElement): boolean {
  return element.type !== 'arrow' && element.type !== 'text' && element.type !== 'frame' && element.type !== 'line';
}

/**
 * Find connected components in the undirected version of the graph.
 * Returns arrays of box IDs grouped by component, sorted so that the
 * component whose root has the smallest x comes first.
 */
function findConnectedComponents(
  roots: string[],
  adjacency: Map<string, GraphEdge[]>,
  reverseAdjacency: Map<string, string[]>,
  frameElements: SceneElement[],
): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const root of roots) {
    if (visited.has(root)) {
      continue;
    }

    const component: string[] = [];
    const stack = [root];

    while (stack.length > 0) {
      const nodeId = stack.pop()!;

      if (visited.has(nodeId)) {
        continue;
      }

      visited.add(nodeId);
      component.push(nodeId);

      // Forward edges
      for (const edge of adjacency.get(nodeId) ?? []) {
        if (!visited.has(edge.targetId)) {
          stack.push(edge.targetId);
        }
      }

      // Reverse edges (undirected traversal)
      for (const sourceId of reverseAdjacency.get(nodeId) ?? []) {
        if (!visited.has(sourceId)) {
          stack.push(sourceId);
        }
      }
    }

    components.push(component);
  }

  // Sort components by the x position of their leftmost root
  components.sort((left, right) => {
    const leftRoot = left.find((id) => roots.includes(id)) ?? left[0];
    const rightRoot = right.find((id) => roots.includes(id)) ?? right[0];
    const leftElement = frameElements.find((el) => el.id === leftRoot);
    const rightElement = frameElements.find((el) => el.id === rightRoot);
    return (leftElement?.x ?? 0) - (rightElement?.x ?? 0);
  });

  return components;
}

/**
 * Build a topological animation sequence from arrow connections within a frame.
 *
 * The algorithm:
 * 1. Find all arrows connecting boxes in the frame.
 * 2. Build a directed graph of box-to-box connections.
 * 3. Find root nodes (no incoming arrows) and group into connected components.
 * 4. Process each component sequentially via BFS, assigning increasing order numbers.
 * 5. Each step: box+text appear, then outgoing arrows, then target boxes.
 * 6. Dangling arrows and unconnected elements get trailing steps.
 */
export function buildSequenceFromArrows(
  scene: LoadedScene,
  frameId: string,
): ElementSequenceItem[] {
  const frameElements = scene.elements.filter(
    (element) => element.id === frameId || element.frameId === frameId,
  );

  const frameElementIds = new Set(frameElements.map((element) => element.id));
  const arrows: ArrowInfo[] = frameElements
    .filter((element) => element.type === 'arrow')
    .map((arrow) => ({
      arrowId: arrow.id,
      startElementId: getBindingElementId(arrow.startBinding),
      endElementId: getBindingElementId(arrow.endBinding),
    }));

  // Build adjacency: source box -> [{ arrow, target box }]
  const adjacency = new Map<string, GraphEdge[]>();
  const reverseAdjacency = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  const connectedBoxIds = new Set<string>();

  for (const arrow of arrows) {
    if (!arrow.startElementId || !arrow.endElementId) {
      continue;
    }

    if (!frameElementIds.has(arrow.startElementId) || !frameElementIds.has(arrow.endElementId)) {
      continue;
    }

    const sourceElement = frameElements.find((el) => el.id === arrow.startElementId);
    const targetElement = frameElements.find((el) => el.id === arrow.endElementId);

    if (!sourceElement || !targetElement || !isBoxElement(sourceElement) || !isBoxElement(targetElement)) {
      continue;
    }

    connectedBoxIds.add(arrow.startElementId);
    connectedBoxIds.add(arrow.endElementId);

    const edges = adjacency.get(arrow.startElementId) ?? [];
    edges.push({ arrowId: arrow.arrowId, targetId: arrow.endElementId });
    adjacency.set(arrow.startElementId, edges);

    const reverse = reverseAdjacency.get(arrow.endElementId) ?? [];
    reverse.push(arrow.startElementId);
    reverseAdjacency.set(arrow.endElementId, reverse);

    incomingCount.set(arrow.endElementId, (incomingCount.get(arrow.endElementId) ?? 0) + 1);

    if (!incomingCount.has(arrow.startElementId)) {
      incomingCount.set(arrow.startElementId, 0);
    }
  }

  // Find root nodes (no incoming edges)
  const roots: string[] = [];

  for (const boxId of connectedBoxIds) {
    if ((incomingCount.get(boxId) ?? 0) === 0) {
      roots.push(boxId);
    }
  }

  // Sort roots by x position (left to right)
  roots.sort((left, right) => {
    const leftElement = frameElements.find((el) => el.id === left);
    const rightElement = frameElements.find((el) => el.id === right);
    return (leftElement?.x ?? 0) - (rightElement?.x ?? 0);
  });

  if (roots.length === 0) {
    return [];
  }

  // Group into connected components and process each sequentially
  const components = findConnectedComponents(roots, adjacency, reverseAdjacency, frameElements);

  const boxOrder = new Map<string, number>();
  const arrowOrder = new Map<string, number>();
  let currentOrder = 1; // 0 is reserved for the frame element

  const sequence: ElementSequenceItem[] = [
    { elementId: frameId, order: 0, durationMs: 400 },
  ];

  for (const component of components) {
    // Find roots within this component
    const componentRoots = component.filter((id) => roots.includes(id));

    // BFS from the component's roots
    const queue = [...componentRoots];

    while (queue.length > 0) {
      const levelNodes = [...queue];
      queue.length = 0;

      // Filter to only nodes not yet ordered
      const newNodes = levelNodes.filter((id) => !boxOrder.has(id));

      if (newNodes.length === 0) {
        break;
      }

      // Boxes at this level
      const boxStep = currentOrder;
      currentOrder++;

      for (const nodeId of newNodes) {
        boxOrder.set(nodeId, boxStep);
      }

      // Outgoing arrows from this level
      const arrowStep = currentOrder;
      currentOrder++;

      const nextLevelNodes: string[] = [];

      for (const nodeId of newNodes) {
        const edges = adjacency.get(nodeId) ?? [];

        for (const edge of edges) {
          if (!arrowOrder.has(edge.arrowId)) {
            arrowOrder.set(edge.arrowId, arrowStep);
          }

          if (!boxOrder.has(edge.targetId)) {
            nextLevelNodes.push(edge.targetId);
          }
        }
      }

      // Deduplicate and sort by x position
      const uniqueNext = [...new Set(nextLevelNodes)];
      uniqueNext.sort((left, right) => {
        const leftElement = frameElements.find((el) => el.id === left);
        const rightElement = frameElements.find((el) => el.id === right);
        return (leftElement?.x ?? 0) - (rightElement?.x ?? 0);
      });

      queue.push(...uniqueNext);
    }
  }

  // Handle dangling arrows (not connected to two boxes)
  const danglingArrows = arrows.filter((arrow) => !arrowOrder.has(arrow.arrowId));

  if (danglingArrows.length > 0) {
    for (const arrow of danglingArrows) {
      arrowOrder.set(arrow.arrowId, currentOrder);
    }

    currentOrder++;
  }

  // Build final sequence: boxes with text labels
  for (const [boxId, order] of boxOrder) {
    const boxElement = frameElements.find((el) => el.id === boxId)!;
    const textId = getContainerTextId(boxElement, frameElements);

    sequence.push({ elementId: boxId, order, durationMs: 800 });

    if (textId) {
      sequence.push({ elementId: textId, order });
    }
  }

  // Add arrows
  for (const [arrowId, order] of arrowOrder) {
    sequence.push({ elementId: arrowId, order, durationMs: 600 });
  }

  // Handle unconnected non-arrow, non-text, non-frame elements
  const sequencedIds = new Set(sequence.map((item) => item.elementId));

  const unsequenced = frameElements.filter(
    (element) =>
      !sequencedIds.has(element.id) &&
      element.type !== 'text' &&
      element.type !== 'frame',
  );

  if (unsequenced.length > 0) {
    for (const element of unsequenced) {
      sequence.push({ elementId: element.id, order: currentOrder });
      const textId = getContainerTextId(element, frameElements);

      if (textId && !sequencedIds.has(textId)) {
        sequence.push({ elementId: textId, order: currentOrder });
        sequencedIds.add(textId);
      }

      sequencedIds.add(element.id);
    }

    currentOrder++;
  }

  // Handle remaining orphan text elements
  const finalSequencedIds = new Set(sequence.map((item) => item.elementId));
  const remainingText = frameElements.filter(
    (element) => element.type === 'text' && !finalSequencedIds.has(element.id),
  );

  for (const textElement of remainingText) {
    const containerId = textElement.containerId as string | undefined;

    if (containerId && boxOrder.has(containerId)) {
      sequence.push({ elementId: textElement.id, order: boxOrder.get(containerId)! });
    } else {
      sequence.push({ elementId: textElement.id, order: currentOrder });
    }
  }

  // Sort by order then elementId for deterministic output
  sequence.sort((left, right) => left.order - right.order || left.elementId.localeCompare(right.elementId));

  return sequence;
}
