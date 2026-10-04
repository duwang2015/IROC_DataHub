"""JSON API under /api. Every UI view is built from these endpoints."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from iroc_qa.store.config import ConfigError, config_from_dict
from iroc_qa.store.ingest import Ingester, resolve_holding
from iroc_qa.store.layout import CASE_PIN
from pydantic import BaseModel, Field

from . import __version__
from .jobs import Job
from .state import AppState, NoWorkspaceError

router = APIRouter(prefix="/api")


def get_state(request: Request) -> AppState:
    return request.app.state.app


State = Depends(get_state)


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, NoWorkspaceError):
        return HTTPException(status_code=409, detail={"code": "no_workspace", "message": str(exc)})
    if isinstance(exc, (ConfigError, KeyError, ValueError)):
        return HTTPException(status_code=400, detail={"code": "bad_request", "message": str(exc)})
    return HTTPException(status_code=500, detail={"code": "error", "message": str(exc)})


# ---------------------------------------------------------------------------------
# health / workspaces
# ---------------------------------------------------------------------------------

@router.get("/health")
def health(state: AppState = State) -> dict:
    ws = state.workspace
    ok = bool(ws and (ws.path / "iroc_store.yaml").is_file())
    return {"version": __version__, "workspace": ws.root if ws else None,
            "label": ws.label if ws else None, "store_ok": ok,
            "jobs_running": len(state.jobs.running())}


class WorkspaceIn(BaseModel):
    root: str
    label: str = ""
    create: bool = False
    trials: list[str] = Field(default_factory=list)


@router.get("/workspaces")
def list_workspaces(state: AppState = State) -> dict:
    return {"active": state.settings.active,
            "workspaces": [{"root": w.root, "label": w.label, "last_opened": w.last_opened,
                            "exists": (w.path / "iroc_store.yaml").is_file()}
                           for w in state.settings.workspaces]}


@router.post("/workspaces")
def add_workspace(body: WorkspaceIn, state: AppState = State) -> dict:
    try:
        ws = state.add_workspace(body.root, body.label, body.create, body.trials)
    except Exception as exc:
        raise _http(exc) from exc
    return {"root": ws.root, "label": ws.label}


class ActiveIn(BaseModel):
    root: str


@router.post("/workspaces/active")
def set_active(body: ActiveIn, state: AppState = State) -> dict:
    try:
        ws = state.set_active(body.root)
    except KeyError as exc:
        raise _http(ValueError(f"unknown workspace {body.root}")) from exc
    return {"root": ws.root, "label": ws.label}


@router.delete("/workspaces")
def remove_workspace(root: str, state: AppState = State) -> dict:
    state.remove_workspace(root)
    return {"ok": True}


# ---------------------------------------------------------------------------------
# read endpoints
# ---------------------------------------------------------------------------------

@router.get("/overview")
def overview(state: AppState = State) -> dict:
    try:
        with state.open_store(read_only=True) as store:
            st = store.catalog.stats()
            holding = store.catalog.list_holding()
            inbox = _inbox_entries(store)
            lock = store.lock()
            recent = []
            for t in st["trials"]:
                recent.extend(store.catalog.trial_log(t["id"], limit=10))
            recent.sort(key=lambda r: r["at"], reverse=True)
            from iroc_qa.store.summary import list_summaries

            return {"root": str(store.root), "stats": st, "holding": holding, "inbox": inbox,
                    "last_summary": (list_summaries(store.cfg.reports, 1) or [None])[0],
                    "lock": lock.read_holder() if lock.is_held_by_live_process() else None,
                    "recent_log": recent[:20],
                    "jobs": [j.as_dict() for j in state.jobs.running()],
                    "trials_config": [{"id": t.id, "name": t.name, "site": t.site,
                                       "kind": t.kind} for t in store.cfg.trials],
                    "sites": store.cfg.sites()}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/trials")
def trials(state: AppState = State) -> list[dict]:
    """Every collection (trials and non-trial sources) with its site, kind and stats."""
    try:
        with state.open_store(read_only=True) as store:
            stats = {t["id"]: t for t in store.catalog.stats()["trials"]}
            return [{"id": t.id, "name": t.name, **stats.get(t.id, {}), "site": t.site,
                     "kind": t.kind} for t in store.cfg.trials]
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/sites")
def sites(state: AppState = State) -> list[dict]:
    """Sites in display order, each with its collections (trials first, then sources)."""
    try:
        with state.open_store(read_only=True) as store:
            stats = {t["id"]: t for t in store.catalog.stats()["trials"]}
            out = []
            for site, rules in store.cfg.by_site().items():
                cols = [{"id": r.id, "name": r.name, "kind": r.kind, "site": site,
                         **{k: stats.get(r.id, {}).get(k, 0) for k in ("cases", "batches",
                                                                      "files", "bytes")}}
                        for r in sorted(rules, key=lambda r: (r.kind != "trial", r.id))]
                out.append({"site": site, "collections": cols,
                            "cases": sum(c["cases"] for c in cols),
                            "files": sum(c["files"] for c in cols),
                            "bytes": sum(c["bytes"] for c in cols)})
            return out
    except Exception as exc:
        raise _http(exc) from exc


def _case_summaries(store, trial_id: str) -> list[dict]:
    cat = store.catalog
    hold_by_case: dict[str, int] = {}
    for h in cat.list_holding():
        dec = json.loads(h["report_json"]) if h["report_json"] else {}
        if dec.get("trial") == trial_id and dec.get("case"):
            hold_by_case[dec["case"]] = hold_by_case.get(dec["case"], 0) + 1
    out = []
    for c in cat.list_cases(trial_id):
        series = cat.series_for_case(c["id"])
        runs = cat.runs_for_case(c["id"], status="completed")
        batches = cat.list_batches(c["id"])
        out.append({
            "trial": trial_id, "case_id": c["case_id"],
            "modalities": sorted({s["modality"] for s in series}),
            "modules": sorted({r["module"] for r in runs}),
            "n_batches": len(batches),
            "current": (c["current_batch_id"] or "").rsplit("/", 1)[-1],
            "pinned": bool(c["pinned"]),
            "last_ingest": max((b["ingested_at"] for b in batches), default=None),
            "n_files": sum(b["n_files"] for b in batches),
            "holding": hold_by_case.get(c["case_id"], 0),
        })
    return out


@router.get("/trials/{trial}/cases")
def trial_cases(trial: str, q: str = "", modality: list[str] = Query(default=[]),
                missing: list[str] = Query(default=[]), holding: bool = False,
                no_module: str = "", state: AppState = State) -> dict:
    try:
        with state.open_store(read_only=True) as store:
            tid = store.cfg.trial(trial).id
            rows = _case_summaries(store, tid)
    except Exception as exc:
        raise _http(exc) from exc
    qq = q.strip().upper()
    mods = {m.upper() for m in modality}
    miss = {m.upper() for m in missing}
    out = []
    for r in rows:
        if qq and qq not in r["case_id"].upper():
            continue
        if mods and not mods <= set(r["modalities"]):
            continue
        if miss and miss & set(r["modalities"]):
            continue
        if holding and not r["holding"]:
            continue
        if no_module and no_module in r["modules"]:
            continue
        out.append(r)
    return {"trial": tid, "total": len(rows), "cases": out}


@router.get("/cases/{trial}/{case_id}")
def case_detail(trial: str, case_id: str, state: AppState = State) -> dict:
    try:
        with state.open_store(read_only=True) as store:
            case = store.case(trial, case_id)
            cat = store.catalog
            c = cat.get_case(case.pk)
            if c is None:
                raise HTTPException(404, {"code": "not_found", "message": f"no case {case.pk}"})
            batches = []
            for b in cat.list_batches(case.pk):
                series = [dict(s, path=str(store.abs(s["rel_dir"])),
                               name=s["rel_dir"].rsplit("/", 1)[-1])
                          for s in cat.series_for_case(case.pk, batch_id=b["id"])]
                docs = [{"rel_path": f["rel_path"], "name": f["rel_path"].rsplit("/", 1)[-1],
                         "kind": f["kind"], "size": f["size"],
                         "path": str(store.abs(f["rel_path"]))}
                        for f in cat.files_for_batch(b["id"]) if f["series_id"] is None]
                batches.append({k: v for k, v in b.items() if k != "manifest_json"}
                               | {"current": b["id"] == c["current_batch_id"],
                                  "path": str(store.abs(f"{case.pk}/original/{b['name']}")),
                                  "series": series, "documents": docs})
            runs = []
            for r in cat.runs_for_case(case.pk):
                files = [f for f in cat.derived_files(case.pk, module=r["module"],
                                                      latest_only=False)
                         if f["derived_run_id"] == r["id"]]
                runs.append({k: v for k, v in r.items() if k != "manifest_json"}
                            | {"path": str(store.abs(r["rel_dir"])),
                               "files": [{"name": f["rel_path"].rsplit("/", 1)[-1],
                                          "kind": f["kind"], "size": f["size"],
                                          "path": str(store.abs(f["rel_path"]))}
                                         for f in files]})
            notes_dir = case.dir / "notes"
            notes = [{"name": p.name, "size": p.stat().st_size, "path": str(p)}
                     for p in sorted(notes_dir.iterdir())] if notes_dir.is_dir() else []
            holding = []
            for h in cat.list_holding():
                dec = json.loads(h["report_json"]) if h["report_json"] else {}
                if dec.get("trial") == case.trial and dec.get("case") == case.case_id:
                    holding.append(dict(h, decision=dec,
                                        report=str(store.cfg.holding / h["ingest_id"]
                                                   / "report.md")))
            return {"trial": case.trial, "case_id": case.case_id, "pk": case.pk,
                    "site": case.site, "kind": case.kind,
                    "path": str(case.dir), "notes_path": str(notes_dir),
                    "current": (c["current_batch_id"] or "").rsplit("/", 1)[-1],
                    "pinned": bool(c["pinned"]), "batches": batches, "runs": runs,
                    "notes": notes, "holding": holding,
                    "log": cat.trial_log(case.trial, case_id=case.case_id, limit=100)}
    except HTTPException:
        raise
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/search")
def search(q: str, state: AppState = State) -> dict:
    qq = q.strip().upper()
    if not qq:
        return {"cases": [], "trials": []}
    try:
        with state.open_store(read_only=True) as store:
            cat = store.catalog
            trials = [{"id": t.id, "name": t.name} for t in store.cfg.trials
                      if qq in t.id.upper() or qq in t.name.upper()]
            cases = []
            for c in cat.list_cases():
                if qq in c["case_id"].upper():
                    series = cat.series_for_case(c["id"])
                    try:
                        rule = store.cfg.trial(c["trial_id"])
                        site, kind = rule.site, rule.kind
                    except Exception:
                        site, kind = "OTHER", "trial"
                    cases.append({"trial": c["trial_id"], "case_id": c["case_id"],
                                  "site": site, "kind": kind,
                                  "modalities": sorted({s["modality"] for s in series})})
                if len(cases) >= 100:
                    break
            return {"cases": cases, "trials": trials}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/holding")
def holding_list(state: AppState = State) -> list[dict]:
    try:
        with state.open_store(read_only=True) as store:
            out = []
            for h in store.catalog.list_holding():
                dec = json.loads(h["report_json"]) if h["report_json"] else {}
                rep_dir = store.cfg.holding / h["ingest_id"]
                summary = ""
                try:
                    rep = json.loads((rep_dir / "report.json").read_text(encoding="utf-8"))
                    g = next((g for g in rep["groups"] if g["group_no"] == h["group_no"]), {})
                    summary = g.get("summary", "")
                    source = rep.get("source", "")
                except (OSError, ValueError):
                    source = ""
                out.append({"ingest_id": h["ingest_id"], "group_no": h["group_no"],
                            "reason": h["reason"], "created_at": h["created_at"],
                            "suggested_trial": dec.get("trial"), "suggested_case": dec.get("case"),
                            "notes": dec.get("notes", []), "summary": summary, "source": source,
                            "path": str(rep_dir / h["rel_dir"]),
                            "report": str(rep_dir / "report.md")})
            return out
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/holding/{ingest_id}")
def holding_detail(ingest_id: str, state: AppState = State) -> dict:
    try:
        with state.open_store(read_only=True) as store:
            rep_dir = store.cfg.holding / ingest_id
            if not rep_dir.is_dir():
                raise HTTPException(404, {"code": "not_found", "message": ingest_id})
            rep = json.loads((rep_dir / "report.json").read_text(encoding="utf-8"))
            md = (rep_dir / "report.md").read_text(encoding="utf-8")
            for g in rep["groups"]:
                g["present"] = (rep_dir / g["dir"]).is_dir()
            return {"report": rep, "markdown": md, "path": str(rep_dir),
                    "trials": [t.id for t in store.cfg.trials]}
    except HTTPException:
        raise
    except Exception as exc:
        raise _http(exc) from exc


def _inbox_entries(store) -> list[dict]:
    from iroc_qa.store.fsutil import is_settled, iter_files

    inbox = store.cfg.inbox
    if not inbox.exists():
        return []
    out = []
    for p in sorted(inbox.iterdir()):
        if p.name.startswith(".") or p.name == "STOP":
            continue
        files = list(iter_files(p, store.cfg.ignore_globs))
        out.append({"name": p.name, "path": str(p), "is_dir": p.is_dir(),
                    "n_files": len(files), "bytes": sum(f.stat().st_size for f in files),
                    "settled": is_settled(p, store.cfg.settle_seconds, store.cfg.ignore_globs)})
    return out


@router.get("/inbox")
def inbox(state: AppState = State) -> dict:
    try:
        with state.open_store(read_only=True) as store:
            return {"path": str(store.cfg.inbox), "entries": _inbox_entries(store),
                    "settle_seconds": store.cfg.settle_seconds}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/log/{trial}")
def trial_log(trial: str, case: str = "", action: str = "", since: str = "", limit: int = 200,
              state: AppState = State) -> dict:
    try:
        with state.open_store(read_only=True) as store:
            tid = store.cfg.trial(trial).id
            cid = store.case(tid, case).case_id if case else None
            rows = store.catalog.trial_log(tid, cid, since or None, action or None, limit)
            return {"trial": tid, "path": str(store.log.path(tid)), "entries": rows}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/config")
def get_config(state: AppState = State) -> dict:
    try:
        root = state.require_root()
        text = (root / "iroc_store.yaml").read_text(encoding="utf-8")
        return {"path": str(root / "iroc_store.yaml"), "text": text}
    except Exception as exc:
        raise _http(exc) from exc


class ConfigIn(BaseModel):
    text: str


@router.put("/config")
def put_config(body: ConfigIn, state: AppState = State) -> dict:
    import yaml

    try:
        root = state.require_root()
        data = yaml.safe_load(body.text) or {}
        config_from_dict(root, data)  # validates regexes, ids, schema
        path = root / "iroc_store.yaml"
        backup = root / "iroc_store.yaml.bak"
        if path.exists():
            backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
        path.write_text(body.text, encoding="utf-8")
        with state.open_store() as store:
            return {"ok": True, "trials": [t.id for t in store.cfg.trials]}
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/jobs")
def jobs(state: AppState = State) -> list[dict]:
    return [j.as_dict() for j in state.jobs.list()]


@router.get("/jobs/{job_id}")
def job(job_id: str, state: AppState = State) -> dict:
    j = state.jobs.get(job_id)
    if j is None:
        raise HTTPException(404, {"code": "not_found", "message": job_id})
    return j.as_dict()


# ---------------------------------------------------------------------------------
# write endpoints (all run as background jobs)
# ---------------------------------------------------------------------------------

class IngestIn(BaseModel):
    sources: list[str] = Field(default_factory=list)
    dry_run: bool = False
    trial: str = ""
    case: str = ""
    keep_source: bool = False


@router.post("/ingest", status_code=202)
def ingest(body: IngestIn, state: AppState = State) -> dict:
    forced = (body.trial, body.case) if body.trial and body.case else None
    if (body.trial or body.case) and not forced:
        raise _http(ValueError("trial and case must be given together"))
    state.require_root()

    def run(job: Job):
        with state.open_store() as store:
            srcs = [Path(s) for s in body.sources] or None
            rep = Ingester(store, dry_run=body.dry_run, forced=forced,
                           keep_source=body.keep_source).run(srcs)
            return {"summary": rep.summary(), "lock_busy": rep.lock_busy,
                    "summary_path": str(rep.summary_path) if rep.summary_path else None,
                    "summary_name": rep.summary_path.stem if rep.summary_path else None,
                    "drops": [{"drop": str(d.drop), "ingest_id": d.ingest_id,
                               "skipped_unsettled": d.skipped_unsettled, "batches": d.batches,
                               "held": d.held, "duplicates": d.duplicates,
                               "failures": d.failures, "dry_run": d.dry_run}
                              for d in rep.drops]}

    return state.jobs.submit("ingest" + (" (dry run)" if body.dry_run else ""), run).as_dict()


class ImportIn(BaseModel):
    path: str
    dry_run: bool = False
    trial: str = ""
    case: str = ""


@router.post("/import", status_code=202)
def import_folder(body: ImportIn, state: AppState = State) -> dict:
    """File everything found in a folder anywhere on disk; the folder is only read."""
    forced = (body.trial, body.case) if body.trial and body.case else None
    if (body.trial or body.case) and not forced:
        raise _http(ValueError("trial and case must be given together"))
    folder = Path(body.path)
    if not folder.exists():
        raise _http(ValueError(f"folder not found: {body.path}"))
    root = state.require_root().resolve()
    if root == folder.resolve() or root in folder.resolve().parents:
        raise _http(ValueError("the folder is inside the store root; use the inbox instead"))

    def run(job: Job):
        with state.open_store() as store:
            rep = Ingester(store, dry_run=body.dry_run, forced=forced,
                           copy_only=True).import_folder(folder)
            return {"summary": rep.summary(), "lock_busy": rep.lock_busy,
                    "summary_path": str(rep.summary_path) if rep.summary_path else None,
                    "summary_name": rep.summary_path.stem if rep.summary_path else None,
                    "drops": [{"drop": str(d.drop), "ingest_id": d.ingest_id,
                               "batches": d.batches, "held": d.held, "duplicates": d.duplicates,
                               "failures": d.failures, "dry_run": d.dry_run}
                              for d in rep.drops]}

    return state.jobs.submit("import" + (" (dry run)" if body.dry_run else ""), run).as_dict()


@router.get("/reports")
def reports(limit: int = 30, state: AppState = State) -> list[dict]:
    from iroc_qa.store.summary import list_summaries

    try:
        with state.open_store(read_only=True) as store:
            return list_summaries(store.cfg.reports, limit)
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/reports/{name}")
def report(name: str, state: AppState = State) -> dict:
    try:
        with state.open_store(read_only=True) as store:
            if "/" in name or "\\" in name or ".." in name:
                raise ValueError("bad report name")
            md = store.cfg.reports / f"{name}.md"
            js = store.cfg.reports / f"{name}.json"
            if not md.is_file():
                raise HTTPException(404, {"code": "not_found", "message": name})
            return {"name": name, "path": str(md), "markdown": md.read_text(encoding="utf-8"),
                    "data": json.loads(js.read_text(encoding="utf-8")) if js.is_file() else None}
    except HTTPException:
        raise
    except Exception as exc:
        raise _http(exc) from exc


class ResolveIn(BaseModel):
    groups: list[int] = Field(default_factory=list)
    all: bool = False
    trial: str = ""
    case: str = ""
    discard: bool = False
    force_new_batch: bool = False


@router.post("/holding/{ingest_id}/resolve", status_code=202)
def resolve(ingest_id: str, body: ResolveIn, state: AppState = State) -> dict:
    if not body.groups and not body.all:
        raise _http(ValueError("give groups or all"))
    if not body.discard and not (body.trial and body.case):
        raise _http(ValueError("trial and case are required unless discarding"))
    state.require_root()

    def run(job: Job):
        with state.open_store() as store:
            return resolve_holding(store, ingest_id, None if body.all else body.groups,
                                   body.trial or None, body.case or None, discard=body.discard,
                                   force_new_batch=body.force_new_batch)

    return state.jobs.submit("discard" if body.discard else "resolve", run).as_dict()


class NoteIn(BaseModel):
    message: str
    case: str = ""


@router.post("/log/{trial}/note")
def add_note(trial: str, body: NoteIn, state: AppState = State) -> dict:
    if not body.message.strip():
        raise _http(ValueError("empty note"))
    try:
        with state.open_store() as store:
            tid = store.cfg.trial(trial).id
            cid = store.case(tid, body.case).case_id if body.case else None
            return store.log.append(tid, "note", body.message.strip(), case_id=cid)
    except Exception as exc:
        raise _http(exc) from exc


class CurrentIn(BaseModel):
    batch: str
    pin: bool = False


@router.post("/cases/{trial}/{case_id}/current")
def set_current(trial: str, case_id: str, body: CurrentIn, state: AppState = State) -> dict:
    try:
        with state.open_store() as store:
            case = store.case(trial, case_id)
            cat = store.catalog
            b = cat.get_batch(f"{case.pk}/{body.batch}")
            if b is None:
                raise ValueError(f"unknown batch {body.batch}")
            with cat.transaction():
                cat.set_current_batch(case.pk, b["id"], pin=body.pin)
            pin = case.dir / CASE_PIN
            if body.pin:
                pin.write_text(json.dumps({"schema": "iroc-store.case/1",
                                           "pinned_batch": body.batch}), encoding="utf-8")
            elif pin.exists():
                pin.unlink()
            store.log.append(case.trial, "current", f"current batch set to {body.batch}"
                             + (" (pinned)" if body.pin else ""), case_id=case.case_id)
            store.refresh_overview()
            return {"ok": True}
    except Exception as exc:
        raise _http(exc) from exc


class ExportIn(BaseModel):
    trial: str
    cases: list[str] = Field(default_factory=list)
    dest: str
    derived: str = ""
    current_only: bool = True
    note: str = ""


@router.post("/export", status_code=202)
def export_cases(body: ExportIn, state: AppState = State) -> dict:
    from iroc_qa.store.export import export

    state.require_root()

    def run(job: Job):
        with state.open_store() as store:
            n = export(store, body.trial, body.cases or None, Path(body.dest),
                       what="derived" if body.derived else "original",
                       module=body.derived or None, current_only=body.current_only,
                       note=body.note or None)
            return {"files": n, "dest": body.dest}

    return state.jobs.submit("export", run).as_dict()


class RunIn(BaseModel):
    producer: str
    trial: str
    case: str
    batch: str = ""
    force: bool = False
    no_resample: bool = False
    skip_suv: bool = False
    skip_rtstruct: bool = False


@router.post("/run", status_code=202)
def run_producer(body: RunIn, state: AppState = State) -> dict:
    if body.producer not in ("dcm2nii", "dicom_qc"):
        raise _http(ValueError("producer must be dcm2nii or dicom_qc"))
    state.require_root()

    def run(job: Job):
        with state.open_store() as store:
            case = store.case(body.trial, body.case)
            if body.producer == "dicom_qc":
                from iroc_qa.store.producers.dicom_qc import run_dicom_qc

                r = run_dicom_qc(store, case, batch=body.batch or None, force=body.force)
            else:
                from iroc_qa.store.producers.dcm2nii import run_dcm2nii

                r = run_dcm2nii(store, case, batch=body.batch or None, force=body.force,
                                no_resample=body.no_resample, skip_suv=body.skip_suv,
                                skip_rtstruct=body.skip_rtstruct)
            if r is None:
                return {"status": "nothing to run (no matching series or tool unavailable)"}
            store.refresh_overview()
            return {"status": "cached" if r.cached else "completed", "run": r.run_name,
                    "path": str(r.dir)}

    return state.jobs.submit(f"run {body.producer}", run).as_dict()


@router.post("/reindex", status_code=202)
def reindex_job(full: bool = False, state: AppState = State) -> dict:
    from iroc_qa.store.reindex import reindex

    state.require_root()

    def run(job: Job):
        with state.open_store() as store:
            rep = reindex(store, full_hash=full)
            return {"summary": rep.summary(), "problems": rep.problems,
                    "leftovers": rep.leftovers}

    return state.jobs.submit("reindex", run).as_dict()


@router.post("/verify", status_code=202)
def verify_job(trial: str = "", sample: int | None = None, state: AppState = State) -> dict:
    from iroc_qa.store.verify import verify

    state.require_root()

    def run(job: Job):
        with state.open_store(read_only=True) as store:
            rep = verify(store, trial or None, sample=sample)
            return {"summary": rep.summary(), "ok": rep.ok, "problems": rep.problems}

    return state.jobs.submit("verify", run).as_dict()


class OpenIn(BaseModel):
    path: str


@router.post("/open-folder")
def open_folder(body: OpenIn, state: AppState = State) -> dict:
    """Open a folder inside the store root in the OS file manager (the app runs locally)."""
    try:
        root = state.require_root().resolve()
        target = Path(body.path).resolve()
        if root != target and root not in target.parents:
            raise ValueError("path is outside the active store root")
        if not target.exists():
            raise ValueError("path does not exist")
        if target.is_file():
            target = target.parent
        if sys.platform == "win32":
            os.startfile(str(target))  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(target)])
        else:
            subprocess.Popen(["xdg-open", str(target)])
        return {"ok": True, "opened": str(target)}
    except Exception as exc:
        raise _http(exc) from exc
