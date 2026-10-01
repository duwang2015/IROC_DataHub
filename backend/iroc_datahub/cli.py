"""``iroc-datahub`` command line."""

from __future__ import annotations

import argparse
import logging
import sys
import threading
import webbrowser
from pathlib import Path


def cmd_serve(args) -> int:
    import uvicorn

    from .main import create_app
    from .settings import Settings

    settings = Settings.load()
    if args.root:
        from .state import AppState

        AppState(settings).add_workspace(args.root)
        settings = Settings.load()
    port = args.port or settings.port
    url = f"http://{args.host}:{port}"
    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    print(f"IROC DataHub at {url}  (API docs: {url}/api/docs)")
    if args.reload:
        uvicorn.run("iroc_datahub.main:create_app", factory=True, host=args.host, port=port,
                    reload=True, reload_dirs=[str(Path(__file__).parent)])
    else:
        uvicorn.run(create_app(settings), host=args.host, port=port, log_level="info")
    return 0


def cmd_add_root(args) -> int:
    from .settings import Settings
    from .state import AppState

    state = AppState(Settings.load())
    ws = state.add_workspace(args.root, args.label, create=args.create,
                             trials=args.trial or None)
    print(f"workspace {ws.label}: {ws.root} (active)")
    return 0


def cmd_roots(args) -> int:
    from .settings import Settings

    s = Settings.load()
    for w in s.workspaces:
        mark = "*" if s.active == w.root else " "
        print(f"{mark} {w.label:20s} {w.root}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="iroc-datahub")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve", help="start the web app")
    s.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 to allow LAN access")
    s.add_argument("--port", type=int)
    s.add_argument("--root", help="store root to open (added to workspaces)")
    s.add_argument("--reload", action="store_true", help="auto-reload backend (development)")
    s.add_argument("--no-browser", action="store_true")
    s.set_defaults(func=cmd_serve)
    s = sub.add_parser("add-root", help="register a store root as a workspace")
    s.add_argument("root")
    s.add_argument("--label", default="")
    s.add_argument("--create", action="store_true", help="initialise a new store there")
    s.add_argument("--trial", action="append")
    s.set_defaults(func=cmd_add_root)
    s = sub.add_parser("roots", help="list workspaces")
    s.set_defaults(func=cmd_roots)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
