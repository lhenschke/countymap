import { h } from "../dom";
import { formatValue } from "../format";
import type { CountySection } from "../types";

const NUMERIC = new Set(["number", "integer", "percent", "currency"]);

/** Any number of rows per county, shown as a table. */
export function renderTable({ dataset, rows }: CountySection): HTMLElement {
  const cls = (format: string) => (NUMERIC.has(format) ? "num" : "");
  return h(
    "div",
    { class: "table-scroll" },
    h(
      "table",
      {},
      h("thead", {}, h("tr", {}, ...dataset.fields.map((f) => h("th", { class: cls(f.format), scope: "col" }, f.label)))),
      h(
        "tbody",
        {},
        ...rows.map((row) =>
          h("tr", {}, ...dataset.fields.map((f) => h("td", { class: cls(f.format) }, formatValue(row[f.key] ?? null, f)))),
        ),
      ),
    ),
  );
}
