# IROC DataHub

Local web app for IROC radiotherapy QA staff: manage, organise and track clinical-trial
imaging data stored with [`iroc_qa.store`](https://github.com/duwang2015/IROC_QA).
Browse trials and cases, watch the inbox, file or discard holding items, add notes, export
cohorts and run processing modules, all from one page served on your own PC.

- Maintainers' guide: [`CLAUDE.md`](CLAUDE.md)
- How it is built: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Upgrade policy and the monthly routine: [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md)

## Install (Windows, one time)

```
powershell -ExecutionPolicy Bypass -File scripts\setup_windows.ps1 -RepoDir E:\IROC_DataHub -DataRoot E:\iroc_data
```
This clones the repository, creates an isolated `.venv`, installs pinned dependencies,
builds the frontend and registers `E:\iroc_data` as the workspace.

## Run

```
E:\IROC_DataHub\.venv\Scripts\iroc-datahub serve
```
Opens http://127.0.0.1:8765. Add `--host 0.0.0.0` to let other PCs on the LAN use it.

## Develop

```
pip install -r requirements.lock && pip install vendor/iroc_qa-*.whl --no-deps && pip install -e . --no-deps
iroc-datahub serve --reload --no-browser          # backend on :8765
cd frontend && npm ci && npm run dev              # UI on :5173, proxies /api
```
Checks: `ruff check backend tests && pytest -q`; `npm run lint && npm run typecheck && npm run build`.
