# Maintenance

This project is maintained by people working through Claude Code sessions, in relay. The
repository on GitHub is the single source of truth; `CLAUDE.md` is the hand-over document
every session reads first.

## Working model

1. Open a Claude Code session on this repository (web, desktop or CLI). Describe the change.
2. Claude works on a branch, runs the checks in `CLAUDE.md`, opens a pull request.
3. CI (`.github/workflows/ci.yml`) runs ruff, pytest, oxlint, tsc and the Vite build.
4. A human reads the PR summary and merges. Nothing merges with red CI.

Branch protection to enable once on GitHub: require the `backend` and `frontend` checks on
`main`, require a pull request, no force-push.

## Upgrade policy

**If it runs, it stays.** All dependencies are pinned:

| What | Where | Install with |
|---|---|---|
| Python version | `.python-version` | pyenv / python.org installer |
| Python packages | `requirements.lock` | `pip install -r requirements.lock` |
| `iroc-qa` (the store) | commit hash in `pyproject.toml` and `requirements.lock` | same |
| Node version | `.nvmrc` | nvm / nodejs.org installer |
| npm packages | `frontend/package-lock.json` | `npm ci` (never `npm install` in CI) |

Upgrades happen only when a human decides, for one of these reasons:
- the pinned Python or Node line reaches end of life and installers disappear;
- a feature we need requires a newer version of something;
- a security advisory affects a code path reachable in this app (it runs on an intranet, so
  most advisories do not).

An upgrade is its own PR: bump the pin, run both test suites (this repository and
`IROC_QA`), describe why in the PR body. One upgrade per PR.

To bump `iroc-qa` to a newer commit: replace the hash in `pyproject.toml`, regenerate
`requirements.lock` (see below), run the tests.

## Regenerating `requirements.lock`

```
python -m venv .lockenv && .lockenv/bin/pip install -e ".[dev]"
.lockenv/bin/pip freeze --exclude-editable > requirements.lock
```
Commit the result together with the `pyproject.toml` change that caused it.

## Monthly maintenance routine (Claude)

A scheduled Claude session (a "Routine") runs this prompt once a month. It reports; it does
not change anything on its own.

```
You are doing the monthly maintenance check for IROC_DataHub. Do not upgrade dependencies
and do not change behaviour. Steps:
1. Check out main, install pinned dependencies (pip install -r requirements.lock,
   npm ci in frontend/), run: ruff check backend tests; pytest -q; npm run lint;
   npm run typecheck; npm run build. Report any failure with the error text.
2. Run `pip list --outdated` and `npm outdated` and `npm audit --omit=dev`; list results
   in a table, mark anything that looks like a real security issue reachable from this app.
3. Read the open issues and pull requests on the repository; summarise what is waiting on a
   human.
4. If IROC_QA has new commits on main since the pinned iroc-qa hash, list their subjects and
   say whether the store's public API (iroc_qa.store) changed.
5. Write the report as a GitHub issue titled "Maintenance report <YYYY-MM>" with the sections
   above, and close any previous month's report issue that has no open discussion.
Do not open pull requests; do not push commits.
```

Schedule: first Monday of the month, 09:00 local. Create it from a Claude Code session with
"set up a monthly Routine for this repository with the prompt in docs/MAINTENANCE.md".

## Release steps

1. `cd frontend && npm ci && npm run build` (output lands in `backend/iroc_datahub/static/`).
2. `python -m build` to produce a wheel that contains the built frontend.
3. Tag `vX.Y.Z`; attach the wheel to the GitHub release.
4. On the IROC PC: `pip install iroc_datahub-X.Y.Z-py3-none-any.whl` inside the app venv.

## Things that are deliberately not here

- No database migrations: the catalog is `iroc_qa.store`'s and is rebuilt with `reindex`.
- No authentication: the app binds to localhost. LAN use (`--host 0.0.0.0`) is for a trusted
  network only; multi-user access control belongs to the full platform.
