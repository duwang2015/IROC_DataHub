"""Per-user app settings: the list of known store roots (workspaces).

Lives outside any store root so that a root stays relocatable and self-contained.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

SETTINGS_ENV = "IROC_DATAHUB_SETTINGS"


def settings_path() -> Path:
    env = os.environ.get(SETTINGS_ENV)
    if env:
        return Path(env)
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return base / "iroc-datahub" / "settings.json"


@dataclass
class Workspace:
    root: str
    label: str = ""
    last_opened: str = ""

    @property
    def path(self) -> Path:
        return Path(self.root)


@dataclass
class Settings:
    workspaces: list[Workspace] = field(default_factory=list)
    active: str | None = None
    port: int = 8765

    # -- persistence ------------------------------------------------------------
    @classmethod
    def load(cls, path: Path | None = None) -> Settings:
        path = path or settings_path()
        if not path.exists():
            return cls()
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return cls()
        ws = [Workspace(**w) for w in data.get("workspaces", []) if isinstance(w, dict)]
        return cls(workspaces=ws, active=data.get("active"), port=int(data.get("port", 8765)))

    def save(self, path: Path | None = None) -> Path:
        path = path or settings_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".json.part")
        tmp.write_text(json.dumps({"workspaces": [asdict(w) for w in self.workspaces],
                                   "active": self.active, "port": self.port}, indent=1),
                       encoding="utf-8")
        tmp.replace(path)
        return path

    # -- workspaces -----------------------------------------------------------------
    def add(self, root: str | Path, label: str = "", make_active: bool = True) -> Workspace:
        root = str(Path(root))
        for w in self.workspaces:
            if _same(w.root, root):
                if label:
                    w.label = label
                if make_active:
                    self.active = w.root
                    w.last_opened = _now()
                return w
        w = Workspace(root=root, label=label or Path(root).name, last_opened=_now())
        self.workspaces.append(w)
        if make_active or self.active is None:
            self.active = w.root
        return w

    def remove(self, root: str) -> None:
        self.workspaces = [w for w in self.workspaces if not _same(w.root, root)]
        if self.active and _same(self.active, root):
            self.active = self.workspaces[0].root if self.workspaces else None

    def set_active(self, root: str) -> Workspace:
        for w in self.workspaces:
            if _same(w.root, root):
                self.active = w.root
                w.last_opened = _now()
                return w
        raise KeyError(root)

    def active_workspace(self) -> Workspace | None:
        if not self.active:
            return None
        for w in self.workspaces:
            if _same(w.root, self.active):
                return w
        return None


def _same(a: str, b: str) -> bool:
    return os.path.normcase(os.path.normpath(a)) == os.path.normcase(os.path.normpath(b))


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")
