// Mirrors server/app/models.py; keep the two in sync.

export interface State {
  fips: string;
  name: string;
  abbr: string;
  landSqMi: number;
  waterSqMi: number;
}

export interface County {
  fips: string;
  name: string;
  fullName: string;
  stateFips: string;
  stateName: string;
  stateAbbr: string;
  landSqMi: number;
  waterSqMi: number;
}

/** "percent" values are fractions: 0.473 is shown as 47.3%. */
export type FieldFormat = "text" | "number" | "integer" | "percent" | "currency" | "date";

export interface FieldSpec {
  key: string;
  label: string;
  format: FieldFormat;
  unit: string | null;
}

export interface DatasetMeta {
  id: string;
  title: string;
  description: string;
  source: string;
  sourceUrl: string | null;
  updated: string | null;
  display: "fields" | "table";
  fields: FieldSpec[];
  sort: string | null;
  order: number;
}

export type Value = string | number | null;
/** Keys are the dataset's field keys (CSV column names). */
export type Row = Record<string, Value>;

export interface CountySection {
  dataset: DatasetMeta;
  rows: Row[];
}

export interface CountyDetails {
  county: County;
  sections: CountySection[];
}
