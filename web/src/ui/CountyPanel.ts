import { api } from "../api";
import { h } from "../dom";
import { formatArea } from "../format";
import { rendererFor } from "../panels/registry";
import type { County, CountyDetails, CountySection } from "../types";

/** What the panel can show before the API answers, taken from the map geometry. */
export interface CountyPreview {
  fips: string;
  fullName: string;
  stateName: string;
}

/** The right-hand panel: details for the selected county, one section per dataset. */
export class CountyPanel {
  private request: AbortController | null = null;

  constructor(
    private el: HTMLElement,
    private onClear: () => void,
  ) {
    this.clear();
  }

  clear(): void {
    this.request?.abort();
    this.request = null;
    this.el.replaceChildren(
      h(
        "div",
        { class: "panel-empty" },
        h("h2", {}, "No county selected"),
        h("p", {}, "Click a county on the map to see its details. Zoom in to see county names."),
      ),
    );
  }

  async show(preview: CountyPreview): Promise<void> {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;

    const body = h("div", { class: "panel-body" }, h("p", { class: "panel-status" }, "Loading…"));
    this.el.replaceChildren(this.header(preview), body);

    let details: CountyDetails;
    try {
      details = await api.county(preview.fips, request.signal);
    } catch (err) {
      if (request.signal.aborted) return;
      console.error(err);
      const retry = h("button", { type: "button", class: "link-button" }, "Try again");
      retry.addEventListener("click", () => this.show(preview));
      body.replaceChildren(h("p", { class: "panel-status error" }, "Couldn't load data for this county. ", retry));
      return;
    }
    if (request.signal.aborted) return;
    body.replaceChildren(this.facts(details.county), ...details.sections.map((s) => this.section(s, details.county)));
  }

  private header(preview: CountyPreview): HTMLElement {
    const close = h("button", { type: "button", class: "panel-close", "aria-label": "Clear selection" }, "×");
    close.addEventListener("click", this.onClear);
    return h(
      "header",
      { class: "panel-head" },
      h("div", {}, h("h2", {}, preview.fullName), h("p", { class: "panel-sub" }, `${preview.stateName} · FIPS ${preview.fips}`)),
      close,
    );
  }

  private facts(county: County): HTMLElement {
    return h(
      "dl",
      { class: "fields facts" },
      h("dt", {}, "Land area"),
      h("dd", {}, formatArea(county.landSqMi)),
      h("dt", {}, "Water area"),
      h("dd", {}, formatArea(county.waterSqMi)),
    );
  }

  private section(section: CountySection, county: County): HTMLElement {
    const { dataset, rows } = section;
    const source = dataset.sourceUrl
      ? h("a", { href: dataset.sourceUrl, target: "_blank", rel: "noopener" }, dataset.source || dataset.sourceUrl)
      : dataset.source;
    return h(
      "section",
      { class: "dataset", "data-dataset": dataset.id },
      h("h3", {}, dataset.title),
      dataset.description && h("p", { class: "dataset-desc" }, dataset.description),
      rows.length > 0 ? rendererFor(section)(section, county) : h("p", { class: "dataset-empty" }, "No data yet"),
      source && h("p", { class: "dataset-source" }, "Source: ", source, dataset.updated ? ` · Updated ${dataset.updated}` : ""),
    );
  }
}
