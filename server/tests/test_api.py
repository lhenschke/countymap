from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

FIXTURES = Path(__file__).parent / "fixtures" / "datasets"


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app(datasets_dir=FIXTURES))


def test_health(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body == {"status": "ok", "counties": 3144, "datasets": 2}


def test_states(client: TestClient) -> None:
    states = client.get("/api/states").json()
    assert len(states) == 51
    assert states[0] == {**states[0], "name": "Alabama", "abbr": "AL", "fips": "01"}
    assert any(s["abbr"] == "DC" for s in states)


def test_county_reference(client: TestClient) -> None:
    county = client.get("/api/counties/06037").json()["county"]
    assert county["fullName"] == "Los Angeles County"
    assert county["stateName"] == "California"
    assert county["stateAbbr"] == "CA"
    assert county["landSqMi"] > 4000


def test_connecticut_planning_regions(client: TestClient) -> None:
    county = client.get("/api/counties/09110").json()["county"]
    assert county["fullName"] == "Capitol Planning Region"


def test_unknown_county(client: TestClient) -> None:
    assert client.get("/api/counties/99999").status_code == 404


def test_sections_ordered_and_parsed(client: TestClient) -> None:
    sections = client.get("/api/counties/06037").json()["sections"]
    assert [s["dataset"]["id"] for s in sections] == ["demo_table", "demo_fields"]

    table, fields = sections
    # Sorted newest first; rows without a valid date go last.
    assert [r["pollster"] for r in table["rows"]] == ["Newer Poll", "Older Poll", "Undated Poll", "Bad Date Poll"]
    assert table["rows"][0] == {"pollster": "Newer Poll", "end_date": "2024-10-15", "dem_pct": 0.62}

    # FIPS zero-padded, thousands separators parsed, undeclared columns dropped.
    assert fields["rows"] == [{"population": 9663345, "share": 0.25, "note": "big"}]


def test_county_without_data_gets_empty_sections(client: TestClient) -> None:
    sections = client.get("/api/counties/01001").json()["sections"]
    assert [s["rows"] for s in sections] == [[], []]


def test_values(client: TestClient) -> None:
    values = client.get("/api/datasets/demo_fields/values", params={"field": "population"}).json()
    assert values == {"06037": 9663345, "17031": 5087072}


def test_values_errors(client: TestClient) -> None:
    assert client.get("/api/datasets/nope/values", params={"field": "x"}).status_code == 404
    assert client.get("/api/datasets/demo_fields/values", params={"field": "x"}).status_code == 404
    assert client.get("/api/datasets/demo_table/values", params={"field": "dem_pct"}).status_code == 400


def test_shipped_datasets_load() -> None:
    client = TestClient(create_app())
    ids = [d["id"] for d in client.get("/api/datasets").json()]
    assert ids == ["polling", "demographics"]
