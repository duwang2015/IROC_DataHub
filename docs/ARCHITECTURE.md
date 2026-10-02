# Architecture

```
browser ──HTTP──▶ FastAPI (backend/iroc_datahub)
                   ├── /api/...        JSON, OpenAPI at /api/docs
                   ├── /assets, /      built React app (frontend/ → backend/iroc_datahub/static)
                   └── JobRunner       long operations in a worker thread, polled via /api/jobs
                          │
                          ▼
                   iroc_qa.store (pip-installed from duwang2015/IROC_QA, pinned)
                   ├── Store / Catalog / Ingester / resolve_holding / export / producers
                   └── data root on disk:  E:\iroc_data  or  \\nas\iroc
```

## Rules

- **The app never touches the data tree directly.** Every read goes through the store's
  catalog; every write goes through a store API that also writes the trial log.
- **One `Store` per request or job.** SQLite connections are thread-bound, and FastAPI runs
  sync handlers in a thread pool. `AppState.open_store()` is cheap; use it in a `with`.
- **Writes are jobs.** Ingest, resolve, export, run, reindex and verify return `202` with a
  job id. The UI polls `/api/jobs/{id}`; `progress` carries the store's log lines.
- **Workspaces** (store roots) are the only app state and live in the user's settings file
  (`%APPDATA%\iroc-datahub\settings.json`). A root is self-describing; moving it means
  pointing the app at the new path and running reindex.

## API map

| Area | Endpoints |
|---|---|
| App | `GET /api/health`, `GET/POST/DELETE /api/workspaces`, `POST /api/workspaces/active` |
| Browse | `GET /api/overview`, `GET /api/trials`, `GET /api/trials/{t}/cases?q&modality&missing&holding&no_module`, `GET /api/cases/{t}/{c}`, `GET /api/search?q` |
| Inbox / holding | `GET /api/inbox`, `POST /api/ingest`, `POST /api/import` (any folder, copy only), `GET /api/holding`, `GET /api/holding/{id}`, `POST /api/holding/{id}/resolve` |
| Summaries | `GET /api/reports`, `GET /api/reports/{name}` (one Markdown + JSON summary per ingest or import run, stored in `_reports/`) |
| Records | `GET /api/log/{t}`, `POST /api/log/{t}/note`, `POST /api/cases/{t}/{c}/current` |
| Tools | `POST /api/export`, `POST /api/run`, `POST /api/reindex`, `POST /api/verify`, `POST /api/open-folder` |
| Config | `GET/PUT /api/config` (validated before writing; previous file kept as `.bak`) |
| Jobs | `GET /api/jobs`, `GET /api/jobs/{id}` |

Errors are `{"detail": {"code": ..., "message": ...}}`; `409 no_workspace` means no store root
is active and the UI shows the workspace picker.

## Frontend

`frontend/src/`:

- `api/client.ts` — the only place that calls `fetch`; typed wrappers per endpoint.
- `api/types.ts` — response shapes (hand-written; regenerate from `/api/openapi.json` when
  they drift).
- `pages/` — one component per route: Dashboard, Trial, Case, Holding, Inbox, Log, Settings,
  Search.
- `components/` — small shared pieces (badges, job progress, tables, path links).
- `styles.css` — design tokens and the few global rules; components use plain CSS classes.

No state library, no component library. Server state is fetched per page with a small
`useApi` hook; mutations submit a job and poll it with `useJob`.

## Migration path to the full platform

The entities (trial, case, batch ≈ submission, series, file, derived run ≈ job, provenance)
and the API shapes are the ones in `docs/PLATFORM_PLAN.md` of IROC_QA. When the store moves to
Postgres and an object store, the backend swaps its store implementation; the frontend and
any scripts written against `/api` keep working. The viewer, multi-user review and the site
portal are additions on the same API, not a rewrite.
