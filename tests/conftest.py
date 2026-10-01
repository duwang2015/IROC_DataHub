from __future__ import annotations

from pathlib import Path

import numpy as np
import pydicom
import pytest
from fastapi.testclient import TestClient
from iroc_datahub.main import create_app
from iroc_datahub.settings import Settings
from iroc_qa.store import Store
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

CONFIG = """schema: iroc-store.config/1
paths: {inbox: _inbox, holding: _holding, logs: _logs}
trials:
  - id: NRG-BN011
    name: BN011
    protocol_ids: ["NRG-BN011"]
    case_id_patterns: ['(?i)\\b(?P<case>BN011[-_ ]?\\d{4})\\b']
  - id: NRG-HN009
    name: HN009
    protocol_ids: ["NRG-HN009"]
    case_id_patterns: ['(?i)\\b(?P<case>HN009[-_ ]?\\d{3,4})\\b']
ingest:
  settle_seconds: 0
  on_ingest: []
overview: {auto: false}
"""


def make_ct(patient_id: str, n: int = 2, series_number: int = 2, desc: str = "HeadNeck 3mm",
            modality: str = "CT") -> list[FileDataset]:
    study, series, frame = generate_uid(), generate_uid(), generate_uid()
    sop = {"CT": "1.2.840.10008.5.1.4.1.1.2", "MR": "1.2.840.10008.5.1.4.1.1.4"}[modality]
    out = []
    for i in range(n):
        meta = FileMetaDataset()
        meta.MediaStorageSOPClassUID = sop
        meta.MediaStorageSOPInstanceUID = generate_uid()
        meta.TransferSyntaxUID = ExplicitVRLittleEndian
        ds = FileDataset(None, {}, file_meta=meta, preamble=b"\0" * 128)
        ds.SOPClassUID, ds.SOPInstanceUID = sop, meta.MediaStorageSOPInstanceUID
        ds.Modality, ds.PatientID, ds.PatientName = modality, patient_id, "ANON"
        ds.StudyInstanceUID, ds.SeriesInstanceUID, ds.FrameOfReferenceUID = study, series, frame
        ds.SeriesNumber, ds.SeriesDescription, ds.StudyDate = series_number, desc, "20260912"
        ds.InstanceNumber = i + 1
        ds.ImagePositionPatient = [0.0, 0.0, i * 3.0]
        ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
        ds.PixelSpacing, ds.SliceThickness = [1.0, 1.0], 3.0
        ds.Rows = ds.Columns = 4
        ds.BitsAllocated = ds.BitsStored = 16
        ds.HighBit, ds.PixelRepresentation, ds.SamplesPerPixel = 15, 0, 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.PixelData = np.zeros((4, 4), dtype=np.uint16).tobytes()
        out.append(ds)
    return out


def write_series(series: list[FileDataset], folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for i, ds in enumerate(series):
        if int(pydicom.__version__.split(".")[0]) >= 3:
            ds.save_as(str(folder / f"IMG{i + 1:04d}.dcm"), enforce_file_format=True)
        else:
            ds.is_little_endian, ds.is_implicit_VR = True, False
            ds.save_as(str(folder / f"IMG{i + 1:04d}.dcm"), write_like_original=False)


@pytest.fixture
def store_root(tmp_path) -> Path:
    root = tmp_path / "store"
    Store.init(root, ["NRG-BN011"]).close()
    (root / "iroc_store.yaml").write_text(CONFIG, encoding="utf-8")
    return root


@pytest.fixture
def client(tmp_path, store_root):
    settings = Settings()
    settings.add(str(store_root), "test")
    app = create_app(settings, settings_path=tmp_path / "settings.json",
                     static_dir=tmp_path / "no-static")
    with TestClient(app) as c:
        yield c


@pytest.fixture
def filled(store_root):
    """One good case, one held drop, one mislabeled drop; returns the inbox path."""
    inbox = store_root / "_inbox"
    write_series(make_ct("BN011-0007", 3), inbox / "a" / "BN011-0007" / "CT")
    write_series(make_ct("BN011-0007", 2, 3, "T1", "MR"), inbox / "a" / "BN011-0007" / "MR")
    (inbox / "a" / "BN011-0007" / "notes.txt").write_text("site note")
    write_series(make_ct("HN009-001", 1), inbox / "b" / "x")
    write_series(make_ct("BN011-0031", 1), inbox / "c" / "BN011-0021")
    return inbox


def wait_job(client, job_id: str, timeout: float = 30.0) -> dict:
    import time

    end = time.time() + timeout
    while time.time() < end:
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["status"] in ("done", "failed"):
            return j
        time.sleep(0.05)
    raise TimeoutError(job_id)
