from typing import Any

from fastapi import APIRouter, HTTPException, Request

from .datasets import DatasetStore
from .models import CountyDetails, CountySection, DatasetMeta, Health, State
from .reference import Reference

router = APIRouter(prefix="/api")


def _reference(request: Request) -> Reference:
    return request.app.state.reference


def _store(request: Request) -> DatasetStore:
    return request.app.state.store


@router.get("/health")
def health(request: Request) -> Health:
    return Health(counties=len(_reference(request).counties), datasets=len(_store(request).metas()))


@router.get("/states")
def states(request: Request) -> list[State]:
    return sorted(_reference(request).states.values(), key=lambda s: s.name)


@router.get("/datasets")
def datasets(request: Request) -> list[DatasetMeta]:
    return _store(request).metas()


@router.get("/counties/{fips}")
def county(fips: str, request: Request) -> CountyDetails:
    """Everything the county panel shows: reference info plus one section per dataset."""
    found = _reference(request).counties.get(fips)
    if found is None:
        raise HTTPException(404, f"Unknown county FIPS {fips!r}")
    store = _store(request)
    sections = [CountySection(dataset=meta, rows=store.rows(meta.id, fips)) for meta in store.metas()]
    return CountyDetails(county=found, sections=sections)


@router.get("/datasets/{dataset_id}/values")
def values(dataset_id: str, field: str, request: Request) -> dict[str, Any]:
    """One field for every county, keyed by FIPS. Used to color the map by a dataset."""
    store = _store(request)
    meta = store.get(dataset_id)
    if meta is None:
        raise HTTPException(404, f"Unknown dataset {dataset_id!r}")
    if meta.display != "fields":
        raise HTTPException(400, "Values are only available for datasets with display 'fields'")
    if field not in {f.key for f in meta.fields}:
        raise HTTPException(404, f"Unknown field {field!r} in dataset {dataset_id!r}")
    return store.values(dataset_id, field)
