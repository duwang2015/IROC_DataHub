# PyInstaller spec for IROC DataHub. Build with:  pyinstaller scripts/datahub.spec
# Produces dist/IROC-DataHub/IROC-DataHub(.exe) plus its support files (one-dir build:
# starts fast and is easy to inspect; zip the folder for distribution).
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None
root = Path(SPECPATH).parent

datas, binaries, hiddenimports = [], [], []
for pkg in ("iroc_datahub", "iroc_qa", "pydicom", "yaml"):
    d, b, h = collect_all(pkg)
    datas += d; binaries += b; hiddenimports += h
hiddenimports += collect_submodules("uvicorn") + collect_submodules("anyio") + [
    "iroc_qa.store.producers.dcm2nii", "iroc_qa.store.producers.dicom_qc",
    "iroc_qa.preprocess.dcm2nii", "iroc_qa.preprocess.dicom_qc", "openpyxl",
]
for opt in ("SimpleITK", "nibabel", "scipy", "rt_utils", "skimage"):
    try:
        d, b, h = collect_all(opt)
        datas += d; binaries += b; hiddenimports += h
    except Exception:
        pass

a = Analysis(
    [str(root / "scripts" / "datahub_launcher.py")],
    pathex=[str(root / "backend")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib.tests", "numpy.tests", "scipy.tests", "pytest"],
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="IROC-DataHub",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    icon=None,
)
coll = COLLECT(exe, a.binaries, a.zipfiles, a.datas, strip=False, upx=False, name="IROC-DataHub")
