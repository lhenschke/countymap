import { geoPath, type GeoPath, type GeoPermissibleObjects } from "d3-geo";
import { select, type Selection } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import type { AnchorRequest, AnchorResult } from "./anchors.worker";
import type { CountyFeature, GeoData, StateFeature } from "./geo";
import {
  COUNTY_LABEL_MIN_K,
  CollisionGrid,
  LABEL_PX,
  STATE_LETTER_SPACING_EM,
  fits,
  type LabelAnchor,
} from "./labels";
import { LABEL_FONT, measureEm } from "./measure";
import { MAP_HEIGHT as H, MAP_WIDTH as W, makeProjection } from "./projection";
import { STATE_CALLOUTS } from "./stateCallouts";

const MAX_K = 32;

interface CountyLabel {
  fips: string;
  anchor: LabelAnchor;
  em: number;
  el: SVGTextElement;
  shown: boolean;
}

interface StateLabel {
  fips: string;
  anchor: LabelAnchor;
  full: string;
  fullEm: number;
  abbr: string;
  abbrEm: number;
  el: SVGTextElement;
  text: string | null;
  callout: Callout | null;
}

/** An abbreviation drawn outside a small state, with a leader line. */
interface Callout {
  el: SVGGElement;
  /** Start of the text, in map units. */
  x: number;
  y: number;
  em: number;
  shown: boolean;
}

export interface MapViewOptions {
  /** A county was clicked (or the background, with null). */
  onSelect: (fips: string | null) => void;
  onHover?: (county: CountyFeature | null, clientX: number, clientY: number) => void;
  /** A zoom or pan finished; `zoomed` is false at the full national view. */
  onZoom?: (zoomed: boolean) => void;
}

export class MapView {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private root: Selection<SVGGElement, unknown, null, undefined>;
  private zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
  private path: GeoPath<unknown, GeoPermissibleObjects>;
  private countyEls = new Map<string, SVGPathElement>();
  private hoverOutline: SVGPathElement;
  private selectedOutline: SVGPathElement;
  private countyLabelGroup: SVGGElement;
  private stateLabelGroup: SVGGElement;
  private calloutGroup: SVGGElement;
  private countyLabels: CountyLabel[] = [];
  private stateLabels: StateLabel[] = [];
  private transform: ZoomTransform = zoomIdentity;
  /** Screen pixels per map unit at zoom 1, and the letterbox offset. */
  private screen = { s: 1, ox: 0, oy: 0, width: W, height: H };
  private selected: string | null = null;
  private hovered: string | null = null;
  private labelFrame = 0;

  constructor(
    container: HTMLElement,
    private geo: GeoData,
    private options: MapViewOptions,
  ) {
    this.path = geoPath(makeProjection(geo.nationMesh));

    this.svg = select(container)
      .append("svg")
      .attr("class", "map-svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("role", "img")
      .attr("aria-label", "Map of United States counties");
    this.root = this.svg.append("g");

    this.root
      .append("g")
      .attr("class", "counties")
      .selectAll("path")
      .data(geo.counties)
      .join("path")
      .attr("class", "county")
      .attr("data-fips", (d) => d.id)
      .attr("d", (d) => this.path(d))
      .each((d, i, nodes) => this.countyEls.set(d.id, nodes[i] as SVGPathElement));

    this.root.append("path").attr("class", "county-mesh").attr("d", this.path(geo.countyMesh));
    this.root.append("path").attr("class", "state-mesh").attr("d", this.path(geo.stateMesh));
    this.root.append("path").attr("class", "nation-mesh").attr("d", this.path(geo.nationMesh));
    this.selectedOutline = this.root.append("path").attr("class", "selected-outline").node()!;
    this.hoverOutline = this.root.append("path").attr("class", "hover-outline").node()!;

    this.stateLabelGroup = this.labelGroup("state-labels");
    this.countyLabelGroup = this.labelGroup("county-labels");
    this.calloutGroup = this.labelGroup("callouts");
    this.loadLabels();

    this.zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_K])
      .translateExtent([
        [0, 0],
        [W, H],
      ])
      .on("start", () => this.setHover(null))
      .on("zoom", (event: { transform: ZoomTransform }) => {
        this.transform = event.transform;
        this.root.attr("transform", event.transform.toString());
        this.scheduleLabels();
      })
      .on("end", (event: { transform: ZoomTransform }) => this.options.onZoom?.(event.transform.k > 1.001));
    this.svg.call(this.zoomBehavior);

    this.bindPointer();
    new ResizeObserver(() => this.measure()).observe(this.svg.node()!);
    this.measure();
  }

  /** Highlights a county (or clears with null) without emitting onSelect. */
  select(fips: string | null, { zoomTo = false } = {}): void {
    if (fips !== null && !this.countyEls.has(fips)) fips = null;
    if (this.selected) this.countyEls.get(this.selected)?.classList.remove("selected");
    this.selected = fips;
    for (const label of this.countyLabels) label.el.classList.toggle("selected", label.fips === fips);
    if (fips) {
      const el = this.countyEls.get(fips)!;
      el.classList.add("selected");
      this.selectedOutline.setAttribute("d", el.getAttribute("d") ?? "");
      if (zoomTo) this.zoomToFeature(this.geo.countiesByFips.get(fips)!, 8);
    } else {
      this.selectedOutline.removeAttribute("d");
    }
    this.scheduleLabels();
  }

  zoomToState(stateFips: string): void {
    const state = this.geo.statesByFips.get(stateFips);
    if (state) this.zoomToFeature(state, 12);
  }

  zoomToFeature(feature: CountyFeature | StateFeature, maxK: number): void {
    const [[x0, y0], [x1, y1]] = this.path.bounds(feature);
    const k = Math.min(maxK, 0.9 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    const t = zoomIdentity
      .translate(W / 2, H / 2)
      .scale(k)
      .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    this.svg.transition().duration(750).call(this.zoomBehavior.transform, t);
  }

  zoomBy(factor: number): void {
    this.svg.transition().duration(250).call(this.zoomBehavior.scaleBy, factor);
  }

  reset(): void {
    this.svg.transition().duration(750).call(this.zoomBehavior.transform, zoomIdentity);
  }

  /**
   * Colors counties, e.g. by a dataset's values. Return null to keep the
   * default fill; pass null to clear.
   */
  setFill(fill: ((fips: string) => string | null) | null): void {
    for (const [fips, el] of this.countyEls) {
      el.style.fill = (fill && fill(fips)) || "";
    }
  }

  private labelGroup(className: string): SVGGElement {
    return this.root
      .append("g")
      .attr("class", `labels ${className}`)
      .attr("font-family", LABEL_FONT)
      .attr("text-anchor", "middle")
      .node()!;
  }

  /** Label anchors come from a worker; labels appear as each layer arrives. */
  private loadLabels(): void {
    const worker = new Worker(new URL("./anchors.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<AnchorResult>) => {
      const anchors = new Map(event.data.anchors);
      if (event.data.layer === "states") {
        this.addStateLabels(anchors);
      } else {
        this.addCountyLabels(anchors);
        this.countyLabels.find((l) => l.fips === this.selected)?.el.classList.add("selected");
        worker.terminate();
      }
      this.scheduleLabels();
    };
    worker.onerror = (event) => console.error("Label worker failed", event.message);
    worker.postMessage({ url: this.geo.url } satisfies AnchorRequest);
  }

  private addCountyLabels(anchors: Map<string, LabelAnchor>): void {
    for (const county of this.geo.counties) {
      const anchor = anchors.get(county.id);
      if (!anchor) continue;
      const el = svgEl("text", { x: anchor.x, y: anchor.y, dy: "0.35em" });
      el.textContent = county.properties.name;
      el.style.display = "none";
      this.countyLabelGroup.appendChild(el);
      this.countyLabels.push({ fips: county.id, anchor, em: measureEm(county.properties.name, 500), el, shown: false });
    }
    // Big counties win label collisions.
    this.countyLabels.sort((a, b) => b.anchor.area - a.anchor.area);
  }

  private addStateLabels(anchors: Map<string, LabelAnchor>): void {
    for (const state of this.geo.states) {
      const anchor = anchors.get(state.id);
      if (!anchor) continue;
      const full = state.properties.name.toUpperCase();
      const abbr = state.properties.abbr;
      const el = svgEl("text", { x: anchor.x, y: anchor.y, dy: "0.35em" });
      el.style.display = "none";
      this.stateLabelGroup.appendChild(el);

      let callout: Callout | null = null;
      const offset = STATE_CALLOUTS[abbr];
      if (offset) {
        const [dx, dy] = offset;
        const x = anchor.x + dx;
        const y = anchor.y + dy;
        const g = svgEl("g", {});
        g.style.display = "none";
        // Leader line stops just short of the text.
        const len = Math.hypot(dx, dy);
        const gap = Math.min(len * 0.25, 7);
        g.appendChild(svgEl("line", { x1: anchor.x, y1: anchor.y, x2: x - (dx / len) * gap, y2: y - (dy / len) * gap }));
        const text = svgEl("text", { x, y, dy: "0.35em" });
        text.textContent = abbr;
        g.appendChild(text);
        this.calloutGroup.appendChild(g);
        callout = { el: g, x, y, em: measureEm(abbr, 600, STATE_LETTER_SPACING_EM), shown: false };
      }

      this.stateLabels.push({
        fips: state.id,
        anchor,
        full,
        fullEm: measureEm(full, 600, STATE_LETTER_SPACING_EM),
        abbr,
        abbrEm: measureEm(abbr, 600, STATE_LETTER_SPACING_EM),
        el,
        text: null,
        callout,
      });
    }
    this.stateLabels.sort((a, b) => b.anchor.area - a.anchor.area);
  }

  private measure(): void {
    const { width, height } = this.svg.node()!.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    const s = Math.min(width / W, height / H);
    this.screen = { s, ox: (width - W * s) / 2, oy: (height - H * s) / 2, width, height };
    this.scheduleLabels();
  }

  private scheduleLabels(): void {
    if (this.labelFrame) return;
    this.labelFrame = requestAnimationFrame(() => {
      this.labelFrame = 0;
      this.updateLabels();
    });
  }

  /** Decides which labels are visible for the current zoom and viewport. */
  private updateLabels(): void {
    const t = this.transform;
    const { s, ox, oy, width, height } = this.screen;
    const scale = t.k * s; // screen px per map unit
    const countyMode = t.k >= COUNTY_LABEL_MIN_K;
    const grid = new CollisionGrid();
    // Zoomed in, state names are a faint watermark under the county names:
    // they only avoid each other, and never hide a county name.
    const stateGrid = countyMode ? new CollisionGrid() : grid;

    /**
     * Claims screen space for text whose left edge (or center) is at map
     * point (x, y). Fails if the text would be cut off by the map edge or
     * overlap a label already placed. Screen px are from the viewBox origin.
     */
    const claim = (
      x: number,
      y: number,
      textWidth: number,
      textHeight: number,
      { centered = true, pad = 3, into = grid } = {},
    ) => {
      const sx = t.applyX(x) * s - (centered ? textWidth / 2 : 0);
      const sy = t.applyY(y) * s;
      const x0 = sx - pad;
      const x1 = sx + textWidth + pad;
      const y0 = sy - textHeight / 2 - pad;
      const y1 = sy + textHeight / 2 + pad;
      if (x0 < -ox || x1 > width - ox || y0 < -oy || y1 > height - oy) return false;
      return into.tryInsert(x0, y0, x1, y1);
    };

    // The selected county is always named once county names are showing,
    // even if its name is wider than the county, and nothing may cover it.
    const countyPx = LABEL_PX.county;
    const selected = countyMode ? this.countyLabels.find((l) => l.fips === this.selected) : undefined;
    const selectedShown =
      !!selected &&
      claim(selected.anchor.x, selected.anchor.y, selected.em * countyPx, countyPx) &&
      (stateGrid === grid || claim(selected.anchor.x, selected.anchor.y, selected.em * countyPx, countyPx, { into: stateGrid }));

    const statePx = countyMode ? LABEL_PX.stateWatermark : LABEL_PX.state;
    setGroupSize(this.stateLabelGroup, statePx / scale, LABEL_PX.halo / scale);
    this.stateLabelGroup.classList.toggle("watermark", countyMode);
    setGroupSize(this.calloutGroup, LABEL_PX.callout / scale, LABEL_PX.halo / scale);

    for (const label of this.stateLabels) {
      const candidates: [string, number][] = [[label.full, label.fullEm]];
      if (!countyMode) candidates.push([label.abbr, label.abbrEm]);
      let text: string | null = null;
      for (const [candidate, em] of candidates) {
        const w = em * statePx;
        if (fits(label.anchor, w, statePx, scale) && claim(label.anchor.x, label.anchor.y, w, statePx, { into: stateGrid })) {
          text = candidate;
          break;
        }
      }
      if (text !== label.text) {
        if (text) label.el.textContent = text;
        label.el.style.display = text ? "" : "none";
        label.text = text;
      }
    }

    // Callouts for small states whose label didn't fit, once all the
    // in-state labels are placed.
    for (const { text, callout } of this.stateLabels) {
      if (!callout) continue;
      // All caps with no descenders, so these can stack tighter than other labels.
      const px = LABEL_PX.callout;
      const show =
        !text && !countyMode && claim(callout.x, callout.y, callout.em * px, px * 0.8, { centered: false, pad: 1 });
      if (show !== callout.shown) {
        callout.el.style.display = show ? "" : "none";
        callout.shown = show;
      }
    }

    setGroupSize(this.countyLabelGroup, countyPx / scale, LABEL_PX.halo / scale);
    for (const label of this.countyLabels) {
      const w = label.em * countyPx;
      const show =
        label === selected
          ? selectedShown
          : countyMode && fits(label.anchor, w, countyPx, scale) && claim(label.anchor.x, label.anchor.y, w, countyPx);
      if (show !== label.shown) {
        label.el.style.display = show ? "" : "none";
        label.shown = show;
      }
    }
  }

  private bindPointer(): void {
    const svg = this.svg.node()!;
    const countyAt = (target: EventTarget | null) =>
      (target as Element | null)?.closest?.("path.county")?.getAttribute("data-fips") ?? null;

    svg.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch" || event.buttons !== 0) return;
      const fips = countyAt(event.target);
      this.setHover(fips);
      this.options.onHover?.(fips ? this.geo.countiesByFips.get(fips)! : null, event.clientX, event.clientY);
    });
    svg.addEventListener("pointerleave", () => {
      this.setHover(null);
      this.options.onHover?.(null, 0, 0);
    });
    // d3-zoom swallows the click that ends a drag, so this only sees real clicks.
    svg.addEventListener("click", (event) => this.options.onSelect(countyAt(event.target)));
  }

  private setHover(fips: string | null): void {
    if (fips === this.hovered) return;
    this.hovered = fips;
    if (fips) this.hoverOutline.setAttribute("d", this.countyEls.get(fips)?.getAttribute("d") ?? "");
    else this.hoverOutline.removeAttribute("d");
  }
}

function setGroupSize(group: SVGGElement, fontSize: number, haloWidth: number): void {
  group.setAttribute("font-size", fontSize.toFixed(4));
  group.setAttribute("stroke-width", haloWidth.toFixed(4));
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
