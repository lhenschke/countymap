import "./styles.css";
import topoUrl from "./assets/us-counties.topo.json?url";
import { loadGeo } from "./map/geo";
import { MapView } from "./map/MapView";
import { CountyPanel } from "./ui/CountyPanel";
import { StateList } from "./ui/StateList";
import { Tooltip } from "./ui/Tooltip";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** The selected county lives in the URL (#county=17031) so it can be linked. */
function countyFromHash(): string | null {
  return new URLSearchParams(location.hash.slice(1)).get("county");
}

async function main(): Promise<void> {
  const mapEl = $("map");
  const status = $("map-status");
  const title = $("map-title");

  const geo = await loadGeo(topoUrl);
  const stateNames = new Map(geo.states.map((s) => [s.id, s.properties.name]));
  const stateName = (countyFips: string) => stateNames.get(countyFips.slice(0, 2)) ?? "";

  const tooltip = new Tooltip(mapEl);
  const panel = new CountyPanel($("county-panel"), () => navigate(null));

  const map = new MapView(mapEl, geo, {
    onSelect: (fips) => navigate(fips),
    onHover: (county, x, y) => {
      if (county) tooltip.show(county.properties.fullName, stateName(county.id), x, y);
      else tooltip.hide();
    },
    onZoom: (zoomed) => {
      $("zoom-reset").hidden = !zoomed;
      if (!zoomed) {
        stateList.setActive(null);
        title.textContent = "United States";
      }
    },
  });

  const stateList = new StateList($("state-list"), $<HTMLSelectElement>("state-select"), geo.states, (fips) => {
    stateList.setActive(fips);
    if (fips) {
      map.zoomToState(fips);
      title.textContent = stateNames.get(fips) ?? "";
    } else {
      map.reset();
    }
  });

  $("zoom-in").addEventListener("click", () => map.zoomBy(2));
  $("zoom-out").addEventListener("click", () => map.zoomBy(0.5));
  $("zoom-reset").addEventListener("click", () => map.reset());

  let current: string | null = null;
  function apply(fips: string | null, zoomTo = false): void {
    if (fips && !geo.countiesByFips.has(fips)) fips = null;
    if (fips === current) return;
    current = fips;
    map.select(fips, { zoomTo });
    if (fips && zoomTo) {
      const stateFips = fips.slice(0, 2);
      stateList.setActive(stateFips);
      title.textContent = stateNames.get(stateFips) ?? "";
    }
    if (fips) {
      const county = geo.countiesByFips.get(fips)!;
      void panel.show({ fips, fullName: county.properties.fullName, stateName: stateName(fips) });
    } else {
      panel.clear();
    }
  }

  function navigate(fips: string | null): void {
    if (fips === current) return;
    history.pushState(null, "", fips ? `#county=${fips}` : location.pathname + location.search);
    apply(fips);
  }

  window.addEventListener("hashchange", () => apply(countyFromHash()));
  window.addEventListener("popstate", () => apply(countyFromHash()));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") navigate(null);
  });

  status.remove();
  apply(countyFromHash(), true);
}

main().catch((err) => {
  console.error(err);
  const status = document.getElementById("map-status");
  if (status) {
    status.textContent = "The map failed to load. Refresh to try again.";
    status.classList.add("error");
  }
});
