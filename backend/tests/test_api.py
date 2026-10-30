from datetime import date

from fastapi.testclient import TestClient
import pytest

from backend.main import create_app, sample_events


@pytest.fixture
def event_input():
    return {
        "title": "お気に入りのライブ", "date": "2026-11-12", "start": "18:30",
        "end": "20:30", "category": "live", "location": "渋谷のライブハウス",
    }


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "予定.sqlite3", tmp_path / "画面")) as test_client:
        yield test_client


def test_create_update_delete_and_persistence(tmp_path, event_input):
    path = tmp_path / "予定.sqlite3"
    with TestClient(create_app(path)) as client:
        assert client.get("/api/health").json() == {"status": "ok"}
        initial = client.get("/api/events").json()
        assert len(initial) >= 11
        response = client.post("/api/events", json=event_input)
        assert response.status_code == 201
        created = response.json()
        assert created["id"]
        assert {key: created[key] for key in event_input} == event_input
        changed = {**event_input, "title": "歯科の予約", "category": "medical", "location": "さくら歯科"}
        response = client.put(f"/api/events/{created['id']}", json=changed)
        assert response.status_code == 200
        assert response.json()["title"] == "歯科の予約"
    with TestClient(create_app(path)) as client:
        saved = next(event for event in client.get("/api/events").json() if event["id"] == created["id"])
        assert saved["category"] == "medical"
        assert saved["location"] == "さくら歯科"
        response = client.delete(f"/api/events/{created['id']}")
        assert response.status_code == 204
        assert response.content == b""
        assert all(event["id"] != created["id"] for event in client.get("/api/events").json())


def test_deleted_samples_are_not_recreated(tmp_path):
    path = tmp_path / "予定.sqlite3"
    with TestClient(create_app(path)) as client:
        for event in client.get("/api/events").json():
            assert client.delete(f"/api/events/{event['id']}").status_code == 204
    with TestClient(create_app(path)) as client:
        assert client.get("/api/events").json() == []


@pytest.mark.parametrize(("field", "value", "message"), [
    ("title", "  ", "予定名を入力してください。"),
    ("title", "あ" * 81, "予定名は80文字以内で入力してください。"),
    ("date", "2026-02-30", "有効な日付"),
    ("date", "20261112", "有効な日付"),
    ("date", "1899-12-31", "有効な日付"),
    ("start", "24:30", "開始時間"),
    ("start", "", "開始時間"),
    ("end", "18:30", "開始時間より後"),
    ("end", "17:00", "開始時間より後"),
    ("end", "27:00", "終了時間"),
    ("category", "不明", "ライブ、通院、その他"),
    ("location", "あ" * 121, "場所は120文字以内"),
    ("location", None, "場所の形式"),
])
def test_invalid_event_is_rejected_without_saving(client, event_input, field, value, message):
    before = client.get("/api/events").json()
    response = client.post("/api/events", json={**event_input, field: value})
    assert response.status_code == 422
    assert message in response.text
    assert client.get("/api/events").json() == before


def test_missing_fields_have_japanese_messages(client):
    response = client.post("/api/events", json={})
    assert response.status_code == 422
    assert "予定名を入力してください。" in response.text
    assert "日付を入力してください。" in response.text


def test_optional_fields_and_whitespace(client, event_input):
    event_input.pop("end")
    event_input.pop("location")
    event_input["title"] = "  朝の散歩  "
    response = client.post("/api/events", json=event_input)
    assert response.status_code == 201
    assert response.json()["title"] == "朝の散歩"
    assert response.json()["end"] == ""
    assert response.json()["location"] == ""


def test_unknown_ids_and_api_paths(client, event_input):
    assert client.put("/api/events/存在しない予定", json=event_input).status_code == 404
    assert client.delete("/api/events/存在しない予定").status_code == 404
    response = client.get("/api/存在しない機能")
    assert response.status_code == 404
    assert "見つかりません" in response.json()["detail"]


def test_events_are_sorted(client, event_input):
    client.post("/api/events", json={**event_input, "date": "2030-01-01", "start": "12:00", "end": ""})
    client.post("/api/events", json={**event_input, "date": "2030-01-01", "start": "09:00", "end": ""})
    events = client.get("/api/events").json()
    keys = [(event["date"], event["start"]) for event in events]
    assert keys == sorted(keys)


def test_frontend_files_and_spa_fallback(tmp_path):
    dist = tmp_path / "画面"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><html lang='ja'><title>日々の予定</title></html>")
    (dist / "favicon.svg").write_text("<svg xmlns='http://www.w3.org/2000/svg'></svg>")
    with TestClient(create_app(tmp_path / "予定.sqlite3", dist)) as client:
        assert client.get("/").status_code == 200
        assert "日々の予定" in client.get("/calendar").text
        assert client.get("/favicon.svg").headers["content-type"].startswith("image/svg+xml")
        assert client.get("/missing.js").status_code == 404
        assert client.get("/..%2Frequirements.txt").status_code == 404


def test_unbuilt_frontend_reports_setup_instruction(client):
    response = client.get("/")
    assert response.status_code == 503
    assert "npm run build" in response.json()["detail"]


def test_sample_dates_across_year_boundary():
    events = sample_events(date(2026, 12, 30))
    next_live = next(event for event in events if event["id"] == "sample-next-live")
    assert next_live["date"] == "2027-01-02"
    assert {event["category"] for event in events} == {"live", "medical", "other"}
