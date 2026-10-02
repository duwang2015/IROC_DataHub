"""Entry point for the packaged (PyInstaller) build: ``IROC-DataHub.exe [serve options]``."""

from __future__ import annotations

import multiprocessing
import sys


def main() -> int:
    multiprocessing.freeze_support()
    from iroc_datahub.cli import main as cli_main

    argv = sys.argv[1:]
    if not argv or argv[0].startswith("-"):
        argv = ["serve", *argv]
    return cli_main(argv)


if __name__ == "__main__":
    sys.exit(main())
