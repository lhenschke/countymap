import type { Feature, MultiLineString, MultiPolygon, Polygon } from "geojson";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

export interface CountyProps {
  name: string;
  fullName: string;
  /** USPS state abbreviation */
  state: string;
}

export interface StateProps {
  name: string;
  abbr: string;
}

export type CountyFeature = Feature<Polygon | MultiPolygon, CountyProps> & { id: string };
export type StateFeature = Feature<Polygon | MultiPolygon, StateProps> & { id: string };

export interface GeoData {
  /** Where the TopoJSON came from; the label worker loads it again (from cache). */
  url: string;
  counties: CountyFeature[];
  states: StateFeature[];
  /** County borders inside a state (state borders are drawn separately). */
  countyMesh: MultiLineString;
  stateMesh: MultiLineString;
  /** Outer coastline and national border. */
  nationMesh: MultiLineString;
  countiesByFips: Map<string, CountyFeature>;
  statesByFips: Map<string, StateFeature>;
}

type Objects = {
  counties: GeometryCollection<CountyProps>;
  states: GeometryCollection<StateProps>;
  nation: GeometryCollection;
};

export async function loadGeo(url: string): Promise<GeoData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load map geometry (${res.status})`);
  const topo = (await res.json()) as Topology<Objects>;

  const counties = feature(topo, topo.objects.counties).features as CountyFeature[];
  const states = feature(topo, topo.objects.states).features as StateFeature[];
  const sameState = (a: { id?: string | number }, b: { id?: string | number }) =>
    String(a.id).slice(0, 2) === String(b.id).slice(0, 2);

  return {
    url,
    counties,
    states,
    countyMesh: mesh(topo, topo.objects.counties, (a, b) => a !== b && sameState(a, b)),
    stateMesh: mesh(topo, topo.objects.states, (a, b) => a !== b),
    nationMesh: mesh(topo, topo.objects.nation, (a, b) => a === b),
    countiesByFips: new Map(counties.map((c) => [c.id, c])),
    statesByFips: new Map(states.map((s) => [s.id, s])),
  };
}
