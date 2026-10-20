import type { CountyDetails, DatasetMeta, Value } from "./types";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  county: (fips: string, signal?: AbortSignal) =>
    getJson<CountyDetails>(`/api/counties/${encodeURIComponent(fips)}`, signal),
  datasets: () => getJson<DatasetMeta[]>("/api/datasets"),
  /** One field for every county, keyed by FIPS; for coloring the map. */
  values: (datasetId: string, field: string) =>
    getJson<Record<string, Value>>(
      `/api/datasets/${encodeURIComponent(datasetId)}/values?field=${encodeURIComponent(field)}`,
    ),
};
