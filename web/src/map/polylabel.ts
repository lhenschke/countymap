// Pole of inaccessibility: the interior point farthest from a polygon's edges,
// which is where a label sits most comfortably. Adapted from mapbox/polylabel
// (ISC license).

export type Point = [number, number];
/** Outer ring first, then holes. */
export type PolygonRings = Point[][];

export interface LabelPoint {
  x: number;
  y: number;
  /** Radius of the largest circle centered here that fits inside the polygon. */
  distance: number;
}

interface Cell {
  x: number;
  y: number;
  h: number;
  d: number;
  max: number;
}

export function polylabel(polygon: PolygonRings, precision = 1): LabelPoint {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon[0]) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.max(precision, Math.min(width, height));
  if (cellSize === precision) return { x: minX + width / 2, y: minY + height / 2, distance: 0 };

  const queue = new MaxHeap<Cell>((c) => c.max);
  const h = cellSize / 2;
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      queue.push(makeCell(x + h, y + h, h, polygon));
    }
  }

  let best = centroidCell(polygon);
  const bboxCell = makeCell(minX + width / 2, minY + height / 2, 0, polygon);
  if (bboxCell.d > best.d) best = bboxCell;

  let cell: Cell | undefined;
  while ((cell = queue.pop())) {
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    const ch = cell.h / 2;
    queue.push(makeCell(cell.x - ch, cell.y - ch, ch, polygon));
    queue.push(makeCell(cell.x + ch, cell.y - ch, ch, polygon));
    queue.push(makeCell(cell.x - ch, cell.y + ch, ch, polygon));
    queue.push(makeCell(cell.x + ch, cell.y + ch, ch, polygon));
  }
  return { x: best.x, y: best.y, distance: Math.max(0, best.d) };
}

function makeCell(x: number, y: number, h: number, polygon: PolygonRings): Cell {
  const d = pointToPolygonDist(x, y, polygon);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

/** Signed distance from a point to the polygon outline (negative outside). */
function pointToPolygonDist(x: number, y: number, polygon: PolygonRings): number {
  let inside = false;
  let minDistSq = Infinity;
  for (const ring of polygon) {
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      minDistSq = Math.min(minDistSq, segDistSq(x, y, a, b));
    }
  }
  return minDistSq === 0 ? 0 : (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

function centroidCell(polygon: PolygonRings): Cell {
  let area = 0;
  let x = 0;
  let y = 0;
  const ring = polygon[0];
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const f = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * f;
    y += (a[1] + b[1]) * f;
    area += f * 3;
  }
  if (area === 0) return makeCell(ring[0][0], ring[0][1], 0, polygon);
  return makeCell(x / area, y / area, 0, polygon);
}

function segDistSq(px: number, py: number, a: Point, b: Point): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

class MaxHeap<T> {
  private items: T[] = [];
  constructor(private score: (item: T) => number) {}

  push(item: T): void {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.score(items[parent]) >= this.score(items[i])) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop(): T | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.score(items[l]) > this.score(items[m])) m = l;
        if (r < items.length && this.score(items[r]) > this.score(items[m])) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top;
  }
}
