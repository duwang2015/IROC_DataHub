"""FastAPI application factory: JSON API plus the built React app."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import router
from .settings import Settings
from .state import AppState

logger = logging.getLogger(__name__)
STATIC_DIR = Path(__file__).parent / "static"


def create_app(settings: Settings | None = None, settings_path: Path | None = None,
               static_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="IROC DataHub", version="0.1.0", docs_url="/api/docs",
                  openapi_url="/api/openapi.json")
    app.state.app = AppState(settings, settings_path)
    app.include_router(router)

    static = static_dir or STATIC_DIR
    index = static / "index.html"
    if index.is_file():
        app.mount("/assets", StaticFiles(directory=static / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            candidate = static / full_path
            if full_path and candidate.is_file() and static in candidate.resolve().parents:
                return FileResponse(candidate)
            return FileResponse(index)
    else:
        @app.get("/", include_in_schema=False)
        def no_ui():
            return JSONResponse({"message": "frontend not built; run `npm run build` in "
                                            "frontend/ or use /api/docs"})
    return app
