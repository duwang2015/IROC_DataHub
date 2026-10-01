"""Application state: settings, the active workspace, job runner, store factory."""

from __future__ import annotations

import logging
import threading
from pathlib import Path

from iroc_qa.store import Store
from iroc_qa.store.config import ConfigError, load_config

from .jobs import JobRunner
from .settings import Settings, Workspace

logger = logging.getLogger(__name__)


class NoWorkspaceError(RuntimeError):
    pass


class AppState:
    def __init__(self, settings: Settings | None = None, settings_path: Path | None = None):
        self.settings_path = settings_path
        self.settings = settings or Settings.load(settings_path)
        self.jobs = JobRunner()
        self._lock = threading.Lock()

    # -- workspaces -----------------------------------------------------------------
    @property
    def workspace(self) -> Workspace | None:
        return self.settings.active_workspace()

    def require_root(self) -> Path:
        ws = self.workspace
        if ws is None:
            raise NoWorkspaceError("no active workspace; add a store root first")
        if not (ws.path / "iroc_store.yaml").is_file():
            raise NoWorkspaceError(f"{ws.root} has no iroc_store.yaml (moved or not initialised?)")
        return ws.path

    def open_store(self, read_only: bool = False) -> Store:
        """A fresh Store per request/job: SQLite connections must not cross threads."""
        root = self.require_root()
        if read_only:
            try:
                return Store.open(root, read_only=True)
            except FileNotFoundError:
                pass  # catalog not created yet: fall through to a writable open
        return Store.open(root)

    def add_workspace(self, root: str | Path, label: str = "", create: bool = False,
                      trials: list[str] | None = None) -> Workspace:
        root = Path(root)
        if create:
            if (root / "iroc_store.yaml").exists():
                raise ConfigError(f"{root} already is a store root")
            Store.init(root, trials or None).close()
        else:
            load_config(root)  # validates
            Store.open(root).close()  # creates catalog/dirs if missing
        with self._lock:
            ws = self.settings.add(root, label)
            self.settings.save(self.settings_path)
        return ws

    def set_active(self, root: str) -> Workspace:
        with self._lock:
            ws = self.settings.set_active(root)
            self.settings.save(self.settings_path)
        return ws

    def remove_workspace(self, root: str) -> None:
        with self._lock:
            self.settings.remove(root)
            self.settings.save(self.settings_path)
