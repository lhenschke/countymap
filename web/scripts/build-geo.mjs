#!/usr/bin/env node
// Builds the map geometry and the FIPS reference index from Census
// cartographic boundary files. Outputs are committed, so this only needs to
// run when the source vintage or simplification changes.
//
//   cd web && npm run build:geo
//
// Writes:
//   web/src/assets/us-counties.topo.json  TopoJSON (counties, states, nation)
//   data/reference/counties.json          FIPS -> county and state names
//   data/reference/states.json

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mapshaper from "mapshaper";

const VINTAGE = "2025";
const RESOLUTION = "500k";
// Share of removable vertices kept by Visvalingam simplification.
const SIMPLIFY = "12%";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cacheDir = path.join(tmpdir(), "countymap-geo");
const zipName = `cb_${VINTAGE}_us_county_${RESOLUTION}.zip`;
const zipUrl = `https://www2.census.gov/geo/tiger/GENZ${VINTAGE}/shp/${zipName}`;

const topoOut = path.join(root, "web/src/assets/us-counties.topo.json");
const refDir = path.join(root, "data/reference");

async function download() {
  await mkdir(cacheDir, { recursive: true });
  const dest = path.join(cacheDir, zipName);
  if (existsSync(dest)) return dest;
  console.log(`Downloading ${zipUrl}`);
  const res = await fetch(zipUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Sanity check failed: ${msg}`);
}

async function main() {
  const zip = await download();
  await mkdir(path.dirname(topoOut), { recursive: true });
  await mkdir(refDir, { recursive: true });
  const attrsOut = path.join(cacheDir, "county-attributes.json");

  // States and the nation outline are dissolved from the counties so every
  // border shares the same simplified arcs.
  await mapshaper.runCommands(
    [
      `-i "${zip}" name=counties`,
      // 50 states + DC; drops territories (60 and up).
      `-filter "Number(STATEFP) <= 56"`,
      `-o "${attrsOut}" format=json`,
      `-simplify ${SIMPLIFY} keep-shapes`,
      `-dissolve STATEFP copy-fields=STATE_NAME,STUSPS + name=states`,
      `-dissolve target=counties + name=nation`,
      `-each target=counties "id=GEOID, name=NAME, fullName=NAMELSAD, state=STUSPS"`,
      `-filter-fields target=counties id,name,fullName,state`,
      `-each target=states "id=STATEFP, name=STATE_NAME, abbr=STUSPS"`,
      `-filter-fields target=states id,name,abbr`,
      `-o "${topoOut}" target=counties,states,nation format=topojson quantization=1e5 id-field=id`,
    ].join(" "),
  );

  const attrs = JSON.parse(await readFile(attrsOut, "utf8"));

  const counties = attrs
    .map((a) => ({
      fips: a.GEOID,
      name: a.NAME,
      fullName: a.NAMELSAD,
      stateFips: a.STATEFP,
      stateName: a.STATE_NAME,
      stateAbbr: a.STUSPS,
    }))
    .sort((a, b) => a.fips.localeCompare(b.fips));

  const stateMap = new Map();
  for (const c of counties) {
    stateMap.set(c.stateFips, { fips: c.stateFips, name: c.stateName, abbr: c.stateAbbr });
  }
  const states = [...stateMap.values()].sort((a, b) => a.fips.localeCompare(b.fips));

  assert(states.length === 51, `expected 51 states incl. DC, got ${states.length}`);
  assert(counties.length > 3100 && counties.length < 3200, `county count ${counties.length}`);
  assert(counties.every((c) => /^\d{5}$/.test(c.fips)), "every county FIPS is 5 digits");
  assert(new Set(counties.map((c) => c.fips)).size === counties.length, "county FIPS are unique");
  for (const ct of ["09110", "09120", "09130", "09140", "09150", "09160", "09170", "09180", "09190"]) {
    assert(counties.some((c) => c.fips === ct), `Connecticut planning region ${ct} present`);
  }

  // One record per line keeps diffs readable when the source vintage changes.
  const jsonLines = (rows) => `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`;
  await writeFile(path.join(refDir, "counties.json"), jsonLines(counties));
  await writeFile(path.join(refDir, "states.json"), jsonLines(states));

  // mapshaper copies id-field into properties too; keep it only as the feature id.
  const topo = JSON.parse(await readFile(topoOut, "utf8"));
  for (const obj of Object.values(topo.objects)) {
    for (const g of obj.geometries) delete g.properties?.id;
  }
  await writeFile(topoOut, JSON.stringify(topo));

  const n = (o) => topo.objects[o].geometries.length;
  const { size } = await stat(topoOut);
  console.log(
    `Wrote ${path.relative(root, topoOut)} (${(size / 1024).toFixed(0)} KB): ` +
      `${n("counties")} counties, ${n("states")} states, ${n("nation")} nation`,
  );
  console.log(`Wrote data/reference/counties.json (${counties.length}) and states.json (${states.length})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
