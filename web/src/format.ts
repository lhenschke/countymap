import type { FieldSpec, Value } from "./types";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export const EMPTY = "—";

export function formatValue(value: Value, field: Pick<FieldSpec, "format" | "unit">): string {
  if (value === null || value === "") return EMPTY;
  let text: string;
  switch (field.format) {
    case "integer":
      text = integer.format(Number(value));
      break;
    case "number":
      text = number.format(Number(value));
      break;
    case "percent":
      text = percent.format(Number(value));
      break;
    case "currency":
      text = currency.format(Number(value));
      break;
    case "date":
      text = date.format(new Date(`${value}T00:00:00Z`));
      break;
    default:
      text = String(value);
  }
  return field.unit ? `${text} ${field.unit}` : text;
}
