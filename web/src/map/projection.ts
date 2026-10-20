import { geoAlbersUsa, type GeoPermissibleObjects } from "d3-geo";

/** Map units; the SVG viewBox. */
export const MAP_WIDTH = 975;
export const MAP_HEIGHT = 610;
const MARGIN = 8;
/** Open water on the right for the Northeastern state callouts. */
const RIGHT_GUTTER = 36;

/**
 * Albers USA (Alaska and Hawaii as insets) fitted to the viewBox. Shared by
 * the map and the label worker so their coordinates agree.
 */
export function makeProjection(nation: GeoPermissibleObjects) {
  return geoAlbersUsa().fitExtent(
    [
      [MARGIN, MARGIN],
      [MAP_WIDTH - MARGIN - RIGHT_GUTTER, MAP_HEIGHT - MARGIN],
    ],
    nation,
  );
}
