"""FastAPI app: the /api routes plus the built front end (web/dist).

Run locally from server/:  uvicorn app.main:app --reload
"""

import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from starlette.types import Scope

from .api import router
from .datasets import CsvDatasetStore
from .reference import Reference

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("DATA_DIR", REPO_ROOT / "data"))
STATIC_DIR = Path(os.environ.get("STATIC_DIR", REPO_ROOT / "web" / "dist"))

logging.basicConfig(level=logging.INFO)


class FrontendFiles(StaticFiles):
    """Vite puts content-hashed files under assets/, so those can be cached forever."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if path.startswith("assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "no-cache"
        return response


def create_app(
    reference_dir: Path = DATA_DIR / "reference",
    datasets_dir: Path = DATA_DIR / "datasets",
    static_dir: Path = STATIC_DIR,
) -> FastAPI:
    app = FastAPI(title="County Map API")
    app.state.reference = Reference(reference_dir)
    app.state.store = CsvDatasetStore(datasets_dir, set(app.state.reference.counties))
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.include_router(router)
    # In development Vite serves the front end and proxies /api here instead.
    if static_dir.is_dir():
        app.mount("/", FrontendFiles(directory=static_dir, html=True), name="frontend")
    return app


app = create_app()
