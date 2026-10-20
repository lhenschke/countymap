"""API schemas. Field names are snake_case in Python and camelCase on the wire.

The TypeScript mirror of these models lives in web/src/types.ts; keep the two
in sync when changing either.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class State(CamelModel):
    fips: str
    name: str
    abbr: str
    land_sq_mi: float
    water_sq_mi: float


class County(CamelModel):
    fips: str
    name: str
    full_name: str
    state_fips: str
    state_name: str
    state_abbr: str
    land_sq_mi: float
    water_sq_mi: float


# How a value is parsed from CSV and displayed in the panel. "percent" values
# are fractions (0.473 is shown as 47.3%).
FieldFormat = Literal["text", "number", "integer", "percent", "currency", "date"]


class FieldSpec(CamelModel):
    key: str
    label: str
    format: FieldFormat = "text"
    unit: str | None = None


class DatasetMeta(CamelModel):
    id: str
    title: str
    description: str = ""
    source: str = ""
    source_url: str | None = None
    updated: str | None = None
    # "fields": one row per county, shown as a label/value list (demographics).
    # "table": any number of rows per county, shown as a table (polls).
    display: Literal["fields", "table"] = "fields"
    fields: list[FieldSpec]
    # Field key to sort table rows by; prefix with "-" for descending.
    sort: str | None = None
    # Panel position; lower comes first.
    order: int = 100


Row = dict[str, Any]


class CountySection(CamelModel):
    dataset: DatasetMeta
    rows: list[Row]


class CountyDetails(CamelModel):
    county: County
    sections: list[CountySection]


class Health(CamelModel):
    status: Literal["ok"] = "ok"
    counties: int
    datasets: int
