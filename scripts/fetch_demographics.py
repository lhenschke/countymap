#!/usr/bin/env python3
"""Builds data/datasets/demographics/records.csv from the Census Bureau's
American Community Survey 5-year estimates.

Reads the ACS "table-based summary file" bulk downloads, which need no API
key. Each table file covers every geography in the country; only county rows
are kept.

    python3 scripts/fetch_demographics.py           # default year
    python3 scripts/fetch_demographics.py --year 2025

Update ACS_YEAR (and the "source"/"updated" lines in the dataset's meta.json)
when a new 5-year release comes out, usually each December.
"""

import argparse
import csv
import io
import json
import urllib.request
from collections.abc import Iterator
from pathlib import Path

ACS_YEAR = 2024  # the 2020–2024 5-year estimates
URL = "https://www2.census.gov/programs-surveys/acs/summary_file/{year}/table-based-SF/data/5YRData/acsdt5y{year}-{table}.dat"
COUNTY_PREFIX = "0500000US"

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "datasets" / "demographics" / "records.csv"
REFERENCE = ROOT / "data" / "reference" / "counties.json"

# Table -> the estimate columns used from it.
TABLES = {
    "b01003": ["B01003_E001"],  # total population
    "b01002": ["B01002_E001"],  # median age
    "b19013": ["B19013_E001"],  # median household income
    "b17001": ["B17001_E001", "B17001_E002"],  # poverty universe, below poverty
    # Population 25+, then bachelor's, master's, professional, doctorate.
    "b15003": ["B15003_E001", "B15003_E022", "B15003_E023", "B15003_E024", "B15003_E025"],
    # Total, then non-Hispanic White, Black, Asian, and Hispanic or Latino (any race).
    "b03002": ["B03002_E001", "B03002_E003", "B03002_E004", "B03002_E006", "B03002_E012"],
}

FIELDS = [
    "fips",
    "population",
    "median_age",
    "median_household_income",
    "pct_poverty",
    "pct_bachelors_or_higher",
    "pct_white",
    "pct_black",
    "pct_hispanic",
    "pct_asian",
]


def county_rows(year: int, table: str) -> Iterator[dict[str, str]]:
    url = URL.format(year=year, table=table)
    print(f"Reading {url}")
    with urllib.request.urlopen(url) as res:
        lines = io.TextIOWrapper(res, encoding="utf-8")
        header = next(lines).rstrip("\n").split("|")
        for line in lines:
            if line.startswith(COUNTY_PREFIX):
                yield dict(zip(header, line.rstrip("\n").split("|")))


def number(raw: str | None) -> float | None:
    """ACS marks missing or suppressed estimates with blanks or large negative codes."""
    try:
        value = float(raw or "")
    except ValueError:
        return None
    return None if value < 0 else value


def share(part: float | None, whole: float | None) -> str:
    if part is None or not whole:
        return ""
    return f"{part / whole:.4f}"


def fmt(value: float | None, digits: int = 0) -> str:
    if value is None:
        return ""
    return f"{value:.{digits}f}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--year", type=int, default=ACS_YEAR, help="last year of the 5-year period")
    year = parser.parse_args().year

    values: dict[str, dict[str, float | None]] = {}
    for table, columns in TABLES.items():
        for row in county_rows(year, table):
            fips = row["GEO_ID"].removeprefix(COUNTY_PREFIX)
            values.setdefault(fips, {}).update({c: number(row.get(c)) for c in columns})

    known = {c["fips"] for c in json.loads(REFERENCE.read_text())}
    missing = sorted(known - values.keys())
    extra = sorted(values.keys() - known)

    with OUT.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(FIELDS)
        for fips in sorted(known & values.keys()):
            v = values[fips]
            degree = [v.get(c) for c in ("B15003_E022", "B15003_E023", "B15003_E024", "B15003_E025")]
            writer.writerow(
                [
                    fips,
                    fmt(v.get("B01003_E001")),
                    fmt(v.get("B01002_E001"), 1),
                    fmt(v.get("B19013_E001")),
                    share(v.get("B17001_E002"), v.get("B17001_E001")),
                    share(None if None in degree else sum(degree), v.get("B15003_E001")),  # type: ignore[arg-type]
                    share(v.get("B03002_E003"), v.get("B03002_E001")),
                    share(v.get("B03002_E004"), v.get("B03002_E001")),
                    share(v.get("B03002_E012"), v.get("B03002_E001")),
                    share(v.get("B03002_E006"), v.get("B03002_E001")),
                ]
            )

    print(f"Wrote {OUT.relative_to(ROOT)}: {len(known & values.keys())} counties")
    if missing:
        print(f"No ACS data for {len(missing)} map counties: {missing[:10]}")
    if extra:
        print(f"Skipped {len(extra)} ACS counties not on the map: {extra[:10]}")


if __name__ == "__main__":
    main()
