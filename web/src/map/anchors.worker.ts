// Finds label anchors off the main thread; polylabel over ~3,000 counties
// takes long enough to stall the page on slower devices.

import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { MultiPolygon, Polygon } from "geojson";
import { labelAnchor, type LabelAnchor } from "./labels";
import { makeProjection } from "./projection";

export interface AnchorRequest {
  url: string;
}

export interface AnchorResult {
  layer: "states" | "counties";
  anchors: [id: string, anchor: LabelAnchor][];
}

self.onmessage = async (event: MessageEvent<AnchorRequest>) => {
  const res = await fetch(event.data.url);
  const topo = (await res.json()) as Topology<{
    counties: GeometryCollection;
    states: GeometryCollection;
    nation: GeometryCollection;
  }>;
  const projection = makeProjection(mesh(topo, topo.objects.nation, (a, b) => a === b));

  // States first: they're what shows at the initial zoom.
  for (const [layer, precision] of [
    ["states", 0.5],
    ["counties", 0.1],
  ] as const) {
    const anchors: AnchorResult["anchors"] = [];
    for (const f of feature(topo, topo.objects[layer]).features) {
      const anchor = labelAnchor(f.geometry as Polygon | MultiPolygon, projection, precision);
      if (anchor) anchors.push([String(f.id), anchor]);
    }
    self.postMessage({ layer, anchors } satisfies AnchorResult);
  }
};
