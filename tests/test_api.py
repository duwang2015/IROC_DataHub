from __future__ import annotations

from .conftest import wait_job


def test_health_and_workspaces(client, store_root, tmp_path):
    h = client.get("/api/health").json()
    assert h["store_ok"] and h["workspace"] == str(store_root)
    ws = client.get("/api/workspaces").json()
    assert ws["active"] == str(store_root) and ws["workspaces"][0]["exists"]
    r = client.post("/api/workspaces", json={"root": str(tmp_path / "new"), "create": True,
                                             "trials": ["X-1"], "label": "new"})
    assert r.status_code == 200
    assert (tmp_path / "new" / "iroc_store.yaml").exists()
    assert client.get("/api/health").json()["workspace"] == str(tmp_path / "new")
    client.post("/api/workspaces/active", json={"root": str(store_root)})
    assert client.get("/api/health").json()["workspace"] == str(store_root)
    assert client.post("/api/workspaces", json={"root": str(tmp_path / "nope")}).status_code == 400


def test_no_workspace_is_409(tmp_path):
    from fastapi.testclient import TestClient
    from iroc_datahub.main import create_app
    from iroc_datahub.settings import Settings

    app = create_app(Settings(), settings_path=tmp_path / "s.json", static_dir=tmp_path / "x")
    with TestClient(app) as c:
        assert c.get("/api/overview").status_code == 409
        assert c.get("/").json()["message"].startswith("frontend not built")


def test_ingest_overview_cases_detail(client, filled):
    ib = client.get("/api/inbox").json()
    assert sorted(e["name"] for e in ib["entries"]) == ["a", "b", "c"]
    job = client.post("/api/ingest", json={"dry_run": True}).json()
    j = wait_job(client, job["id"])
    assert j["status"] == "done" and len(j["result"]["drops"]) == 3
    assert client.get("/api/inbox").json()["entries"]  # dry run leaves the inbox alone
    j = wait_job(client, client.post("/api/ingest", json={}).json()["id"])
    assert j["status"] == "done", j["error"]
    drops = j["result"]["drops"]
    assert sum(len(d["batches"]) for d in drops) == 2
    assert sum(len(d["held"]) for d in drops) == 1
    ov = client.get("/api/overview").json()
    assert ov["stats"]["holding_open"] == 1 and ov["inbox"] == []
    assert {t["id"] for t in ov["stats"]["trials"]} >= {"NRG-BN011", "NRG-HN009"}
    trials = client.get("/api/trials").json()
    assert next(t for t in trials if t["id"] == "NRG-BN011")["cases"] == 1
    cases = client.get("/api/trials/NRG-BN011/cases").json()
    assert cases["cases"][0]["case_id"] == "BN011-0007"
    assert cases["cases"][0]["modalities"] == ["CT", "MR"]
    assert client.get("/api/trials/NRG-BN011/cases", params={"missing": "MR"}).json()["cases"] == []
    both = client.get("/api/trials/NRG-BN011/cases", params={"modality": ["CT", "MR"]}).json()
    assert both["cases"]
    d = client.get("/api/cases/NRG-BN011/BN011-0007").json()
    assert d["current"].startswith("batch-") and len(d["batches"]) == 1
    assert [s["modality"] for s in d["batches"][0]["series"]] == ["CT", "MR"]
    assert d["batches"][0]["documents"][0]["name"] == "notes.txt"
    assert client.get("/api/cases/NRG-BN011/BN011-9999").status_code == 404
    s = client.get("/api/search", params={"q": "hn009"}).json()
    assert s["trials"][0]["id"] == "NRG-HN009" and s["cases"][0]["case_id"] == "HN009-001"


def test_holding_resolve_note_log(client, filled):
    wait_job(client, client.post("/api/ingest", json={}).json()["id"])
    hold = client.get("/api/holding").json()
    assert len(hold) == 1 and hold[0]["reason"] == "folder_mismatch"
    assert hold[0]["suggested_case"] == "BN011-0031"
    hid = hold[0]["ingest_id"]
    det = client.get(f"/api/holding/{hid}").json()
    assert det["report"]["groups"][0]["present"] and "folder_mismatch" in det["markdown"]
    assert client.post(f"/api/holding/{hid}/resolve", json={"groups": [1]}).status_code == 400
    j = wait_job(client, client.post(f"/api/holding/{hid}/resolve",
                                     json={"groups": [1], "trial": "NRG-BN011",
                                           "case": "BN011-0031"}).json()["id"])
    assert j["status"] == "done" and j["result"][0]["status"] == "filed"
    assert client.get("/api/holding").json() == []
    assert client.get(f"/api/holding/{hid}").status_code == 404
    r = client.post("/api/log/NRG-BN011/note", json={"message": "took CT for autoseg",
                                                      "case": "BN011-0007"})
    assert r.status_code == 200 and r.json()["action"] == "note"
    log = client.get("/api/log/NRG-BN011", params={"action": "note"}).json()
    assert log["entries"][0]["message"] == "took CT for autoseg"
    d = client.get("/api/cases/NRG-BN011/BN011-0007").json()
    assert any(e["action"] == "note" for e in d["log"])
    assert client.post("/api/log/NRG-BN011/note", json={"message": "  "}).status_code == 400


def test_current_config_reindex_verify_open(client, filled, store_root):
    wait_job(client, client.post("/api/ingest", json={}).json()["id"])
    d = client.get("/api/cases/NRG-BN011/BN011-0007").json()
    b = d["batches"][0]["name"]
    assert client.post("/api/cases/NRG-BN011/BN011-0007/current",
                       json={"batch": b, "pin": True}).json()["ok"]
    assert client.get("/api/cases/NRG-BN011/BN011-0007").json()["pinned"]
    assert (store_root / "Brain" / "NRG-BN011" / "BN011-0007" / "case.json").exists()
    cfg = client.get("/api/config").json()
    assert "NRG-BN011" in cfg["text"]
    bad = cfg["text"].replace("(?P<case>BN011", "(BN011")
    assert client.put("/api/config", json={"text": bad}).status_code == 400
    assert client.put("/api/config", json={"text": cfg["text"] + "\n"}).json()["ok"]
    assert (store_root / "iroc_store.yaml.bak").exists()
    j = wait_job(client, client.post("/api/reindex").json()["id"])
    assert j["status"] == "done" and not j["result"]["problems"]
    j = wait_job(client, client.post("/api/verify").json()["id"])
    assert j["status"] == "done" and j["result"]["ok"]
    assert client.post("/api/open-folder", json={"path": "/etc"}).status_code == 400
    assert client.get("/api/jobs").json()


def test_export_and_run(client, filled, tmp_path):
    wait_job(client, client.post("/api/ingest", json={}).json()["id"])
    j = wait_job(client, client.post("/api/export", json={
        "trial": "NRG-BN011", "cases": ["BN011-0007"], "dest": str(tmp_path / "out"),
        "note": "audit"}).json()["id"])
    assert j["status"] == "done" and j["result"]["files"] == 6
    assert (tmp_path / "out" / "BN011-0007" / "CT_002_HeadNeck_3mm").is_dir()
    bad = client.post("/api/run", json={"producer": "x", "trial": "a", "case": "b"})
    assert bad.status_code == 400
    j = wait_job(client, client.post("/api/run", json={"producer": "dicom_qc", "trial": "NRG-BN011",
                                                       "case": "BN011-0007"}).json()["id"])
    assert j["status"] == "done"


def test_import_folder_and_reports(client, store_root, tmp_path):
    from .conftest import make_ct, write_series

    src = tmp_path / "archive"
    write_series(make_ct("BN011-0007", 2), src / "2024" / "BN011-0007" / "CT")
    write_series(make_ct("BN011-0031", 1), src / "BN011-0021")
    before = sorted(str(p) for p in src.rglob("*") if p.is_file())
    bad = client.post("/api/import", json={"path": str(store_root / "_inbox")})
    assert bad.status_code == 400
    j = wait_job(client, client.post("/api/import", json={"path": str(src), "dry_run": True}
                                     ).json()["id"])
    assert j["status"] == "done" and j["result"]["summary_name"].startswith("import-dry-")
    j = wait_job(client, client.post("/api/import", json={"path": str(src)}).json()["id"])
    assert j["status"] == "done", j["error"]
    assert len(j["result"]["drops"][0]["batches"]) == 1
    assert len(j["result"]["drops"][0]["held"]) == 1
    assert sorted(str(p) for p in src.rglob("*") if p.is_file()) == before
    reps = client.get("/api/reports").json()
    assert reps[0]["mode"] == "import" and not reps[0]["dry_run"] and reps[1]["dry_run"]
    r = client.get(f"/api/reports/{reps[0]['name']}").json()
    assert r["markdown"].startswith("# Folder import summary")
    assert r["data"]["totals"]["batches"] == 1
    assert client.get("/api/reports/../x").status_code in (400, 404)
    assert client.get("/api/overview").json()["last_summary"]["name"] == reps[0]["name"]


def test_sites_and_sources(client, store_root, tmp_path):
    from .conftest import make_ct, write_series

    sites = client.get("/api/sites").json()
    assert [s["site"] for s in sites] == ["HN", "Brain"]
    hn = sites[0]["collections"]
    assert [(c["id"], c["kind"]) for c in hn] == [("NRG-HN009", "trial"), ("Penn", "source")]
    src = tmp_path / "penn"
    ct = make_ct("MRN-42", 1)
    for ds in ct:
        ds.InstitutionName = "Penn Medicine"
    write_series(ct, src / "x")
    j = wait_job(client, client.post("/api/import", json={"path": str(src)}).json()["id"])
    assert j["status"] == "done" and j["result"]["drops"][0]["batches"][0]["trial"] == "Penn"
    d = client.get("/api/cases/Penn/MRN-42").json()
    assert d["site"] == "HN" and d["kind"] == "source"
    assert (store_root / "HN" / "Penn" / "MRN-42" / "original").is_dir()
    s = client.get("/api/search", params={"q": "mrn"}).json()
    assert s["cases"][0]["kind"] == "source"
