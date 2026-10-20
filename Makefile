# Local development shortcuts. Run `make setup` once, then `make dev-api` and
# `make dev-web` in two terminals and open http://localhost:5173.

PY := server/.venv/bin/python

.PHONY: setup dev-api dev-web build serve test geo demographics docker

setup:
	python3 -m venv server/.venv
	$(PY) -m pip install -r server/requirements-dev.txt
	cd web && npm ci

dev-api:
	cd server && .venv/bin/uvicorn app.main:app --reload --port 8000

dev-web:
	cd web && npm run dev

build:
	cd web && npm run build

# Production-like: FastAPI serves the built front end at http://localhost:8000
serve: build
	cd server && .venv/bin/uvicorn app.main:app --port 8000

test:
	cd server && .venv/bin/python -m pytest -q
	cd web && npm run typecheck

# Rebuild the map geometry and FIPS reference from Census files.
geo:
	cd web && npm run build:geo

# Refresh data/datasets/demographics from the Census ACS bulk files.
demographics:
	python3 scripts/fetch_demographics.py

docker:
	docker build -t countymap .
	docker run --rm -p 8000:8000 countymap
