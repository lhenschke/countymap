"""County datasets: the data shown in the county panel.

Each dataset is a folder under the datasets directory:

    datasets/<id>/meta.json    DatasetMeta: title, display mode, fields
    datasets/<id>/records.csv  rows keyed by a 5-digit `fips` column

Adding a dataset means adding a folder; no code changes. Data access goes
through the DatasetStore protocol so the CSV files can later be swapped for a
database without touching the API.
"""

import csv
import json
import logging
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any, Protocol

from .models import DatasetMeta, FieldSpec, Row

log = logging.getLogger(__name__)


class DatasetStore(Protocol):
    def metas(self) -> list[DatasetMeta]: ...

    def get(self, dataset_id: str) -> DatasetMeta | None: ...

    def rows(self, dataset_id: str, fips: str) -> list[Row]: ...

    def values(self, dataset_id: str, field: str) -> dict[str, Any]: ...


def normalize_fips(raw: str) -> str:
    raw = raw.strip()
    return raw.zfill(5) if raw.isdigit() else raw


def parse_value(raw: str, spec: FieldSpec) -> Any:
    raw = raw.strip()
    if raw == "":
        return None
    match spec.format:
        case "integer":
            return int(float(raw.replace(",", "")))
        case "number" | "percent" | "currency":
            return float(raw.replace(",", "").replace("$", "").rstrip("%"))
        case "date":
            return date.fromisoformat(raw).isoformat()
        case _:
            return raw


class CsvDatasetStore:
    def __init__(self, datasets_dir: Path, known_fips: set[str]):
        self._metas: dict[str, DatasetMeta] = {}
        self._rows: dict[str, dict[str, list[Row]]] = {}
        if not datasets_dir.is_dir():
            log.warning("Datasets directory %s not found; no datasets loaded", datasets_dir)
            return
        for meta_path in sorted(datasets_dir.glob("*/meta.json")):
            folder = meta_path.parent
            meta = DatasetMeta.model_validate({**json.loads(meta_path.read_text()), "id": folder.name})
            self._metas[meta.id] = meta
            self._rows[meta.id] = self._load_rows(meta, folder / "records.csv", known_fips)

    def _load_rows(self, meta: DatasetMeta, path: Path, known_fips: set[str]) -> dict[str, list[Row]]:
        by_fips: dict[str, list[Row]] = defaultdict(list)
        if not path.exists():
            return by_fips
        with path.open(newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            columns = set(reader.fieldnames or [])
            if "fips" not in columns:
                raise ValueError(f"{path}: missing required 'fips' column")
            missing = [s.key for s in meta.fields if s.key not in columns]
            if missing:
                raise ValueError(f"{path}: columns declared in meta.json are missing: {missing}")
            unknown: list[str] = []
            for line, record in enumerate(reader, start=2):
                fips = normalize_fips(record["fips"] or "")
                if fips not in known_fips:
                    unknown.append(fips)
                    continue
                row: Row = {}
                for spec in meta.fields:
                    try:
                        row[spec.key] = parse_value(record[spec.key] or "", spec)
                    except ValueError:
                        log.warning("%s:%d: bad %s value %r for %s", path, line, spec.format, record[spec.key], spec.key)
                        row[spec.key] = None
                by_fips[fips].append(row)
        if unknown:
            log.warning("%s: skipped %d rows with unknown FIPS, e.g. %s", path, len(unknown), unknown[:5])
        if meta.display == "fields":
            dupes = [f for f, rows in by_fips.items() if len(rows) > 1]
            if dupes:
                log.warning("%s: %d counties have more than one row; only the first is shown", path, len(dupes))
        if meta.sort:
            key = meta.sort.lstrip("-")
            for rows in by_fips.values():
                # Rows missing the sort value go last either way.
                present = [r for r in rows if r.get(key) is not None]
                absent = [r for r in rows if r.get(key) is None]
                present.sort(key=lambda r: r[key], reverse=meta.sort.startswith("-"))
                rows[:] = present + absent
        return by_fips

    def metas(self) -> list[DatasetMeta]:
        return sorted(self._metas.values(), key=lambda m: (m.order, m.title))

    def get(self, dataset_id: str) -> DatasetMeta | None:
        return self._metas.get(dataset_id)

    def rows(self, dataset_id: str, fips: str) -> list[Row]:
        return self._rows.get(dataset_id, {}).get(fips, [])

    def values(self, dataset_id: str, field: str) -> dict[str, Any]:
        return {fips: rows[0].get(field) for fips, rows in self._rows.get(dataset_id, {}).items() if rows}
