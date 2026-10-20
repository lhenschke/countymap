import type { GeoProjection } from "d3-geo";
import type { MultiPolygon, Polygon } from "geojson";
import { polylabel, type Point, type PolygonRings } from "./polylabel";

/** On-screen label sizes in CSS pixels; they stay constant while zooming. */
export const LABEL_PX = {
  county: 11,
  state: 12,
  /** State names once county labels are showing. */
  stateWatermark: 17,
  callout: 11,
  halo: 3,
};
export const STATE_LETTER_SPACING_EM = 0.08;
/** County labels only appear past this zoom factor. */
export const COUNTY_LABEL_MIN_K = 2;

export interface LabelAnchor {
  /** Label position in map units. */
  x: number;
  y: number;
  /** Radius of the largest circle around the anchor that fits in the shape. */
  radius: number;
  /** Bounding-box width of the labeled polygon. */
  width: number;
  /** Area of the labeled polygon, used to give big shapes label priority. */
  area: number;
}

/**
 * Anchors a label in the largest polygon of a (multi)polygon, at its pole of
 * inaccessibility, in projected map units.
 */
export function labelAnchor(
  geometry: Polygon | MultiPolygon,
  projection: GeoProjection,
  precision: number,
): LabelAnchor | null {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let best: { rings: PolygonRings; area: number } | null = null;
  for (const polygon of polygons) {
    const rings = polygon
      .map((ring) => ring.map((p) => projection(p as [number, number])).filter((p): p is Point => p !== null))
      .filter((ring) => ring.length >= 3);
    if (rings.length === 0) continue;
    const area = Math.abs(ringArea(rings[0]));
    if (!best || area > best.area) best = { rings, area };
  }
  if (!best) return null;

  const { x, y, distance } = polylabel(best.rings, precision);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [px] of best.rings[0]) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
  }
  return { x, y, radius: distance, width: maxX - minX, area: best.area };
}

function ringArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

/**
 * Whether text of the given on-screen size fits inside the shape around its
 * anchor, where `scale` is screen pixels per map unit.
 */
export function fits(anchor: LabelAnchor, textWidthPx: number, textHeightPx: number, scale: number): boolean {
  return textWidthPx <= anchor.width * scale * 0.92 && textHeightPx <= anchor.radius * 2 * scale;
}

/** Rejects screen rectangles that overlap one already placed. */
export class CollisionGrid {
  private cells = new Map<number, number[][]>();
  constructor(private cellSize = 48) {}

  tryInsert(x0: number, y0: number, x1: number, y1: number): boolean {
    const c = this.cellSize;
    const cx0 = Math.floor(x0 / c);
    const cx1 = Math.floor(x1 / c);
    const cy0 = Math.floor(y0 / c);
    const cy1 = Math.floor(y1 / c);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (const r of this.cells.get(key(cx, cy)) ?? []) {
          if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return false;
        }
      }
    }
    const rect = [x0, y0, x1, y1];
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = key(cx, cy);
        const list = this.cells.get(k);
        if (list) list.push(rect);
        else this.cells.set(k, [rect]);
      }
    }
    return true;
  }
}

function key(cx: number, cy: number): number {
  return (cx + 0x8000) * 0x10000 + (cy + 0x8000);
}
