import { h } from "../dom";
import { formatValue } from "../format";
import type { CountySection } from "../types";

/** One row per county, shown as a label/value list. */
export function renderFields({ dataset, rows }: CountySection): HTMLElement {
  const row = rows[0];
  return h(
    "dl",
    { class: "fields" },
    ...dataset.fields.flatMap((field) => [h("dt", {}, field.label), h("dd", {}, formatValue(row[field.key] ?? null, field))]),
  );
}
