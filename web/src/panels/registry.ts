import type { County, CountySection } from "../types";
import { renderFields } from "./fields";
import { renderTable } from "./table";

/** Draws one dataset's rows for a county. Only called when there are rows. */
export type PanelRenderer = (section: CountySection, county: County) => HTMLElement;

const byDisplay: Record<CountySection["dataset"]["display"], PanelRenderer> = {
  fields: renderFields,
  table: renderTable,
};
const byDataset = new Map<string, PanelRenderer>();

/**
 * Overrides the default renderer for one dataset, e.g. to draw a poll chart:
 *   registerPanel("polling", (section, county) => myChart(section.rows));
 */
export function registerPanel(datasetId: string, renderer: PanelRenderer): void {
  byDataset.set(datasetId, renderer);
}

export function rendererFor(section: CountySection): PanelRenderer {
  return byDataset.get(section.dataset.id) ?? byDisplay[section.dataset.display];
}
