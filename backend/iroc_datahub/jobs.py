"""Background jobs: long store operations run in a thread, polled by the UI."""

from __future__ import annotations

import logging
import threading
import traceback
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


@dataclass
class Job:
    id: str
    kind: str
    status: str = "queued"           # queued | running | done | failed
    created_at: str = field(default_factory=_now)
    started_at: str | None = None
    finished_at: str | None = None
    progress: list[str] = field(default_factory=list)
    result: Any = None
    error: str | None = None

    def as_dict(self) -> dict:
        return {"id": self.id, "kind": self.kind, "status": self.status,
                "created_at": self.created_at, "started_at": self.started_at,
                "finished_at": self.finished_at, "progress": list(self.progress[-200:]),
                "result": self.result, "error": self.error}


class JobLogHandler(logging.Handler):
    def __init__(self, job: Job):
        super().__init__(level=logging.INFO)
        self.job = job
        self.setFormatter(logging.Formatter("%(levelname)s %(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        if record.name.startswith("iroc_qa") or record.name.startswith("iroc_datahub"):
            self.job.progress.append(self.format(record))


class JobRunner:
    """One worker thread: store writes are serialised anyway by the store lock."""

    def __init__(self, max_kept: int = 200):
        self._jobs: dict[str, Job] = {}
        self._order: list[str] = []
        self._lock = threading.Lock()
        self._max_kept = max_kept

    def submit(self, kind: str, fn: Callable[[Job], Any]) -> Job:
        job = Job(id=uuid.uuid4().hex[:12], kind=kind)
        with self._lock:
            self._jobs[job.id] = job
            self._order.append(job.id)
            while len(self._order) > self._max_kept:
                old = self._order.pop(0)
                self._jobs.pop(old, None)
        t = threading.Thread(target=self._run, args=(job, fn), name=f"job-{kind}", daemon=True)
        t.start()
        return job

    def _run(self, job: Job, fn: Callable[[Job], Any]) -> None:
        handler = JobLogHandler(job)
        logging.getLogger().addHandler(handler)
        job.status = "running"
        job.started_at = _now()
        try:
            job.result = fn(job)
            job.status = "done"
        except Exception as exc:
            job.error = f"{exc}\n{traceback.format_exc()}"
            job.status = "failed"
            logger.exception("job %s (%s) failed", job.id, job.kind)
        finally:
            job.finished_at = _now()
            logging.getLogger().removeHandler(handler)

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def list(self, limit: int = 50) -> list[Job]:
        with self._lock:
            ids = list(reversed(self._order[-limit:]))
        return [self._jobs[i] for i in ids if i in self._jobs]

    def running(self) -> list[Job]:
        return [j for j in self._jobs.values() if j.status in ("queued", "running")]
