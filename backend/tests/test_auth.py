import hashlib
from pathlib import Path
import sqlite3
import time

from fastapi.testclient import TestClient
import pytest

from backend.main import create_app, database


CSRF_HEADERS = {"X-Requested-With": "XMLHttpRequest"}
SESSION_COOKIE = "hibi_session"
PASSWORD = "12345678"
EVENT = {
    "title": "自分だけの予定", "date": "2026-11-12", "start": "18:30",
    "end": "20:30", "category": "live", "location": "東京の会場",
}


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "会員予定.sqlite3"


@pytest.fixture
def client(db_path):
    with TestClient(create_app(db_path), headers=CSRF_HEADERS) as test_client:
        yield test_client


def login(client, username="test1", password=PASSWORD):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def admin_members(client):
    login(client, "administer")
    response = client.get("/api/admin/users")
    assert response.status_code == 200
    return response.json()


@pytest.mark.parametrize(("method", "path", "payload"), [
    ("get", "/api/events", None),
    ("post", "/api/events", EVENT),
    ("put", "/api/events/存在しない予定", EVENT),
    ("delete", "/api/events/存在しない予定", None),
    ("get", "/api/auth/me", None),
    ("get", "/api/admin/users", None),
    ("put", "/api/admin/users/存在しない会員", {"name": "会員", "username": "member"}),
])
def test_authentication_is_required(client, method, path, payload):
    options = {"json": payload} if payload is not None else {}
    response = getattr(client, method)(path, **options)
    assert response.status_code == 401
    assert "detail" in response.json()


@pytest.mark.parametrize(("username", "name", "role"), [
    ("administer", "管理者", "admin"),
    ("test1", "テストユーザー1", "user"),
    ("test2", "テストユーザー2", "user"),
])
def test_seeded_accounts_and_private_cookie(client, username, name, role):
    response = client.post("/api/auth/login", json={"username": username, "password": PASSWORD})
    assert response.status_code == 200
    user = response.json()
    assert set(user) == {"id", "name", "username", "role"}
    assert user["name"] == name
    assert user["role"] == role
    assert user["username"] == username
    assert client.get("/api/auth/me").json() == user
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "max-age=43200" in cookie
    assert "password" not in response.text


def test_invalid_credentials_do_not_reveal_accounts(client):
    known = client.post("/api/auth/login", json={"username": "test1", "password": "間違ったパスワード"})
    unknown = client.post("/api/auth/login", json={"username": "unknown", "password": "間違ったパスワード"})
    assert known.status_code == unknown.status_code == 401
    assert known.json() == unknown.json()
    assert SESSION_COOKIE not in client.cookies
    assert client.get("/api/auth/me").status_code == 401


def test_password_hashes_are_salted_and_session_tokens_are_hashed(client, db_path):
    login(client)
    token = client.cookies.get(SESSION_COOKIE)
    with database(db_path) as connection:
        hashes = [row["password_hash"] for row in connection.execute("SELECT password_hash FROM users")]
        sessions = connection.execute("SELECT token_hash, expires_at, created_at FROM sessions").fetchall()
    assert len(hashes) == 3
    assert len(set(hashes)) == 3
    for encoded in hashes:
        algorithm, iterations, salt, digest = encoded.split("$")
        assert algorithm == "pbkdf2_sha256"
        assert int(iterations) >= 600_000
        assert len(bytes.fromhex(salt)) >= 16
        expected = hashlib.pbkdf2_hmac("sha256", PASSWORD.encode(), bytes.fromhex(salt), int(iterations)).hex()
        assert expected == digest
        assert encoded != PASSWORD
    session = next(row for row in sessions if row["token_hash"] == hashlib.sha256(token.encode()).hexdigest())
    assert session["token_hash"] != token
    assert 0 < session["expires_at"] - int(time.time()) <= 43_200
    assert session["expires_at"] - session["created_at"] == 43_200


def test_logout_revokes_copied_session(client, db_path):
    login(client)
    token = client.cookies.get(SESSION_COOKIE)
    assert client.post("/api/auth/logout").status_code == 204
    assert SESSION_COOKIE not in client.cookies
    assert client.get("/api/auth/me").status_code == 401
    with TestClient(create_app(db_path), headers={**CSRF_HEADERS, "Cookie": f"{SESSION_COOKIE}={token}"}) as replay:
        assert replay.get("/api/auth/me").status_code == 401
        assert replay.get("/api/events").status_code == 401


def test_expired_session_cannot_access_calendar(client, db_path):
    login(client)
    token_hash = hashlib.sha256(client.cookies.get(SESSION_COOKIE).encode()).hexdigest()
    with database(db_path) as connection:
        connection.execute("UPDATE sessions SET expires_at = ? WHERE token_hash = ?", (int(time.time()) - 1, token_hash))
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/events").status_code == 401


def test_each_member_has_isolated_events(client):
    first = login(client, "test1")
    first_events = client.get("/api/events").json()
    created = client.post("/api/events", json=EVENT).json()
    second = login(client, "test2")
    assert first["id"] != second["id"]
    second_events = client.get("/api/events").json()
    assert first_events and second_events
    assert {event["id"] for event in first_events}.isdisjoint(event["id"] for event in second_events)
    assert created["id"] not in {event["id"] for event in second_events}
    assert client.put(f"/api/events/{created['id']}", json={**EVENT, "title": "他人の予定を変更"}).status_code == 404
    assert client.delete(f"/api/events/{created['id']}").status_code == 404
    own = client.post("/api/events", json={**EVENT, "title": "二人目の予定"})
    assert own.status_code == 201
    login(client, "test1")
    saved = client.get("/api/events").json()
    assert next(event for event in saved if event["id"] == created["id"])["title"] == EVENT["title"]
    assert all(event["id"] != own.json()["id"] for event in saved)


def test_roles_cannot_cross_permission_boundaries(client):
    member = login(client)
    assert client.get("/api/admin/users").status_code == 403
    assert client.put(f"/api/admin/users/{member['id']}", json={"name": "変更", "username": "test1"}).status_code == 403
    admin = login(client, "administer")
    assert client.get("/api/events").status_code == 403
    assert client.post("/api/events", json=EVENT).status_code == 403
    assert client.put("/api/events/無関係の予定", json=EVENT).status_code == 403
    assert client.delete("/api/events/無関係の予定").status_code == 403
    users = client.get("/api/admin/users").json()
    assert len(users) == 2
    assert all(user["role"] == "user" for user in users)
    assert all(set(user) == {"id", "name", "username", "role"} for user in users)
    assert client.put(f"/api/admin/users/{admin['id']}", json={"name": "変更禁止", "username": "newadmin"}).status_code == 404


def test_admin_edit_revokes_sessions_and_preserves_owned_events(client, db_path):
    user = login(client)
    old_token = client.cookies.get(SESSION_COOKIE)
    event = client.post("/api/events", json=EVENT).json()
    with TestClient(create_app(db_path), headers=CSRF_HEADERS) as admin:
        login(admin, "administer")
        edited = admin.put(f"/api/admin/users/{user['id']}", json={
            "name": "変更後の会員", "username": "renamed.user", "password": "new-password-123",
        })
    assert edited.status_code == 200, edited.text
    assert edited.json() == {"id": user["id"], "name": "変更後の会員", "username": "renamed.user", "role": "user"}
    with TestClient(create_app(db_path), headers={**CSRF_HEADERS, "Cookie": f"{SESSION_COOKIE}={old_token}"}) as stale:
        assert stale.get("/api/auth/me").status_code == 401
    old_login = client.post("/api/auth/login", json={"username": "test1", "password": PASSWORD})
    assert old_login.status_code == 401
    old_password = client.post("/api/auth/login", json={"username": "renamed.user", "password": PASSWORD})
    assert old_password.status_code == 401
    new_user = login(client, "renamed.user", "new-password-123")
    assert new_user["id"] == user["id"]
    assert any(item["id"] == event["id"] for item in client.get("/api/events").json())


def test_name_only_edit_and_empty_password_preserve_session_and_password(client, db_path):
    user = login(client)
    old_token = client.cookies.get(SESSION_COOKIE)
    with database(db_path) as connection:
        old_hash = connection.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()[0]
    with TestClient(create_app(db_path), headers=CSRF_HEADERS) as admin:
        login(admin, "administer")
        result = admin.put(f"/api/admin/users/{user['id']}", json={"name": "新しい表示名", "username": "test1", "password": ""})
    assert result.status_code == 200
    with database(db_path) as connection:
        current_hash = connection.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()[0]
    assert current_hash == old_hash
    with TestClient(create_app(db_path), headers={**CSRF_HEADERS, "Cookie": f"{SESSION_COOKIE}={old_token}"}) as existing:
        assert existing.get("/api/auth/me").status_code == 200
        assert existing.get("/api/auth/me").json()["name"] == "新しい表示名"
    assert login(client)["name"] == "新しい表示名"


def test_username_edit_alone_revokes_sessions(client, db_path):
    user = login(client)
    token = client.cookies.get(SESSION_COOKIE)
    with TestClient(create_app(db_path), headers=CSRF_HEADERS) as admin:
        login(admin, "administer")
        result = admin.put(f"/api/admin/users/{user['id']}", json={"name": user["name"], "username": "changed_name"})
    assert result.status_code == 200
    with TestClient(create_app(db_path), headers={**CSRF_HEADERS, "Cookie": f"{SESSION_COOKIE}={token}"}) as stale:
        assert stale.get("/api/auth/me").status_code == 401
    assert login(client, "changed_name")["id"] == user["id"]


def test_password_spaces_are_preserved(client):
    members = admin_members(client)
    member = next(user for user in members if user["username"] == "test1")
    password = " new-password-123 "
    changed = client.put(f"/api/admin/users/{member['id']}", json={"name": member["name"], "username": "test1", "password": password})
    assert changed.status_code == 200
    assert client.post("/api/auth/login", json={"username": "test1", "password": password.strip()}).status_code == 401
    assert login(client, "test1", password)["id"] == member["id"]


def test_duplicate_username_is_rejected_without_changing_member(client):
    members = admin_members(client)
    first = next(user for user in members if user["username"] == "test1")
    for username in ("test2", "administer"):
        response = client.put(f"/api/admin/users/{first['id']}", json={"name": "変更しない", "username": username})
        assert response.status_code == 409
    unchanged = next(user for user in client.get("/api/admin/users").json() if user["id"] == first["id"])
    assert unchanged == first


@pytest.mark.parametrize(("field", "value"), [
    ("name", "  "), ("name", "名" * 81), ("username", "ab"),
    ("username", "x" * 41), ("username", "日本語"), ("username", "has space"),
    ("password", "1234567"), ("password", "x" * 129),
])
def test_invalid_member_fields_are_rejected(client, field, value):
    member = admin_members(client)[0]
    payload = {"name": member["name"], "username": member["username"], "password": ""}
    response = client.put(f"/api/admin/users/{member['id']}", json={**payload, field: value})
    assert response.status_code == 422
    assert "detail" in response.json()


@pytest.mark.parametrize(("method", "path", "payload"), [
    ("post", "/api/auth/login", {"username": "test1", "password": PASSWORD}),
    ("post", "/api/auth/logout", None),
    ("post", "/api/events", EVENT),
    ("put", "/api/events/任意の予定", EVENT),
    ("delete", "/api/events/任意の予定", None),
    ("put", "/api/admin/users/任意の会員", {"name": "名前", "username": "member"}),
])
def test_unsafe_requests_require_csrf_header(client, method, path, payload):
    login(client)
    client.headers.pop("X-Requested-With")
    options = {"json": payload} if payload is not None else {}
    response = getattr(client, method)(path, **options)
    assert response.status_code == 403


def test_https_session_cookie_is_secure(db_path):
    with TestClient(create_app(db_path), base_url="https://testserver", headers=CSRF_HEADERS) as client:
        response = client.post("/api/auth/login", json={"username": "test1", "password": PASSWORD})
        assert response.status_code == 200
        assert "secure" in response.headers["set-cookie"].lower()
        assert client.get("/api/auth/me").status_code == 200


def test_login_attempts_are_temporarily_throttled(client, db_path):
    for _ in range(5):
        response = client.post("/api/auth/login", json={"username": "test1", "password": "間違ったパスワード"})
        assert response.status_code == 401
    assert client.post("/api/auth/login", json={"username": "test1", "password": PASSWORD}).status_code == 429
    with database(db_path) as connection:
        connection.execute("UPDATE login_attempts SET locked_until = 0, window_started = ?", (int(time.time()) - 3600,))
    assert login(client)["username"] == "test1"


def prepare_legacy_database(path: Path, include_event: bool):
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE events (id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, category TEXT NOT NULL, location TEXT NOT NULL)")
        connection.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        connection.execute("INSERT INTO metadata (key, value) VALUES ('initialized', '1')")
        if include_event:
            connection.execute("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?)", ("legacy-event", "以前からある予定", "2026-11-02", "09:00", "10:00", "other", "以前の場所"))


@pytest.mark.parametrize("include_event", [True, False])
def test_legacy_migration_preserves_data_without_reseeding_test1(db_path, include_event):
    prepare_legacy_database(db_path, include_event)
    for _ in range(2):
        with TestClient(create_app(db_path), headers=CSRF_HEADERS) as client:
            first = login(client)
            first_events = client.get("/api/events").json()
            assert len(first_events) == (1 if include_event else 0)
            if include_event:
                assert first_events[0] == {"id": "legacy-event", "title": "以前からある予定", "date": "2026-11-02", "start": "09:00", "end": "10:00", "category": "other", "location": "以前の場所"}
            login(client, "test2")
            second_events = client.get("/api/events").json()
            assert second_events
            assert all(event["id"] != "legacy-event" for event in second_events)
    if include_event:
        with database(db_path) as connection:
            assert connection.execute("SELECT owner_id FROM events WHERE id = 'legacy-event'").fetchone()[0] == first["id"]


def test_restart_preserves_changed_credentials_and_deleted_samples(client, db_path):
    user = login(client)
    for event in client.get("/api/events").json():
        assert client.delete(f"/api/events/{event['id']}").status_code == 204
    login(client, "administer")
    response = client.put(f"/api/admin/users/{user['id']}", json={"name": "保存した名前", "username": "kept_user", "password": "kept-password-123"})
    assert response.status_code == 200
    with TestClient(create_app(db_path), headers=CSRF_HEADERS) as restarted:
        assert restarted.post("/api/auth/login", json={"username": "test1", "password": PASSWORD}).status_code == 401
        saved = login(restarted, "kept_user", "kept-password-123")
        assert saved["id"] == user["id"]
        assert saved["name"] == "保存した名前"
        assert restarted.get("/api/events").json() == []
