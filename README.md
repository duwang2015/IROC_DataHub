# IROC DataHub

Local web app for IROC radiotherapy QA staff: manage, organise and track clinical-trial
imaging data stored with [`iroc_qa.store`](https://github.com/duwang2015/IROC_QA).
Browse trials and cases, watch the inbox, import whole folders (copy only, the source is never
touched), file or discard holding items, read the summary of every run, add notes, export
cohorts and run processing modules, all from one page served on your own PC.

- Maintainers' guide: [`CLAUDE.md`](CLAUDE.md)
- How it is built: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Upgrade policy and the monthly routine: [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md)

## Install without Python or Node (Windows)

Download `IROC-DataHub-win64.zip` from the latest [release](https://github.com/duwang2015/IROC_DataHub/releases)
(or the `IROC-DataHub-win64` artifact of any CI run), unzip anywhere, double-click
`IROC-DataHub.exe`. It opens http://127.0.0.1:8765 and asks for a data root on first start.
`IROC-DataHub.exe --host 0.0.0.0` lets other PCs on the LAN use it in their browsers.

## Run as a container (Linux server or NAS)

```
docker build -t iroc-datahub .
docker run -d --name datahub -p 8765:8765 -v /srv/iroc_data:/data -v /srv/datahub-config:/config iroc-datahub
```

## Install from source (Windows, one time)

```
powershell -ExecutionPolicy Bypass -File scripts\setup_windows.ps1 -RepoDir E:\IROC_DataHub -DataRoot E:\iroc_data
```
This clones the repository, creates an isolated `.venv`, installs pinned dependencies,
builds the frontend and registers `E:\iroc_data` as the workspace. For a separate test store,
run it again with `-DataRoot E:\iroc_test` (or add one later in Settings); the app can switch
between workspaces.

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
