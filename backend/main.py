from contextlib import asynccontextmanager, contextmanager
from datetime import date as calendar_date, datetime, timedelta
import os
from pathlib import Path
import re
import sqlite3
import secrets
import time
from typing import Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from backend.auth import COOKIE_NAME, SESSION_SECONDS, LoginInput, MemberUpdate, User, hash_password, token_digest, verify_password


ROOT = Path(__file__).resolve().parent.parent
TIME_PATTERN = re.compile(r"(?:[01]\d|2[0-3]):[0-5]\d")
FIELD_LABELS = {
    "title": "予定名", "date": "日付", "start": "開始時間", "end": "終了時間",
    "category": "種類", "location": "場所", "name": "会員名", "username": "会員ID", "password": "パスワード",
}


class EventInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str
    date: str
    start: str
    end: str = ""
    category: Literal["live", "medical", "other"]
    location: str = ""

    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        if not value:
            raise ValueError("予定名を入力してください。")
        if len(value) > 80:
            raise ValueError("予定名は80文字以内で入力してください。")
        return value

    @field_validator("date")
    @classmethod
    def check_date(cls, value: str) -> str:
        try:
            parsed = calendar_date.fromisoformat(value)
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) or parsed.year < 1900:
                raise ValueError
        except ValueError:
            raise ValueError("1900年から9999年までの有効な日付を選んでください。") from None
        return value

    @field_validator("start")
    @classmethod
    def check_start(cls, value: str) -> str:
        if not TIME_PATTERN.fullmatch(value):
            raise ValueError("開始時間を時・分で入力してください。")
        return value

    @field_validator("end")
    @classmethod
    def check_end(cls, value: str) -> str:
        if value and not TIME_PATTERN.fullmatch(value):
            raise ValueError("終了時間を時・分で入力してください。")
        return value

    @field_validator("location")
    @classmethod
    def check_location(cls, value: str) -> str:
        if len(value) > 120:
            raise ValueError("場所は120文字以内で入力してください。")
        return value

    @model_validator(mode="after")
    def check_time_order(self):
        if self.end and self.end <= self.start:
            raise ValueError("終了時間は開始時間より後にしてください。")
        return self


class Event(EventInput):
    id: str


def sample_events(today: calendar_date) -> list[dict]:
    monthly = [
        (3, "秋のアコースティックライブ", "18:30", "20:30", "live", "下北沢のライブハウス"),
        (7, "歯の定期検診", "10:00", "11:00", "medical", "さくら歯科クリニック"),
        (10, "友人とカフェ巡り", "13:00", "15:00", "other", "蔵前のカフェ"),
        (14, "お気に入りのバンドのライブ", "19:00", "21:00", "live", "渋谷のライブハウス"),
        (18, "眼科の定期検診", "11:00", "11:30", "medical", "みどり眼科"),
        (22, "美術館へお出かけ", "14:00", "16:00", "other", "東京都現代美術館"),
        (25, "週末のジャズライブ", "18:00", "20:00", "live", "代官山のジャズクラブ"),
    ]
    events = [
        {
            "id": f"sample-month-{index}", "title": title,
            "date": today.replace(day=day).isoformat(), "start": start, "end": end,
            "category": category, "location": location,
        }
        for index, (day, title, start, end, category, location) in enumerate(monthly)
        if day != today.day
    ]
    upcoming = [
        ("today-medical", 0, "いつもの定期検診", "10:00", "11:00", "medical", "さくらクリニック"),
        ("today-live", 0, "夜を彩る、音楽の時間", "19:00", "21:00", "live", "渋谷のライブハウス"),
        ("tomorrow", 1, "友人と週末ランチ", "12:00", "13:30", "other", "表参道のカフェ"),
        ("next-live", 3, "ピアノと過ごす午後", "15:00", "17:00", "live", "紀尾井ホール"),
        ("next-medical", 6, "歯のクリーニング", "10:30", "11:30", "medical", "さくら歯科クリニック"),
    ]
    for identifier, offset, title, start, end, category, location in upcoming:
        events.append({
            "id": f"sample-{identifier}", "title": title,
            "date": (today + timedelta(days=offset)).isoformat(), "start": start,
            "end": end, "category": category, "location": location,
        })
    return events


@contextmanager
def database(path: Path):
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize_database(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with database(path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        existing_events = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='events'"
        ).fetchone() is not None
        connection.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        initialized = connection.execute("SELECT 1 FROM metadata WHERE key = 'initialized'").fetchone() is not None
        connection.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                username TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
                password_hash TEXT NOT NULL
            )
        """)
        auth_initialized = connection.execute("SELECT 1 FROM metadata WHERE key='auth_initialized'").fetchone()
        if not auth_initialized:
            seeded_users = {}
            for username, name, role in [
                ("administer", "管理者", "admin"),
                ("test1", "テストユーザー1", "user"),
                ("test2", "テストユーザー2", "user"),
            ]:
                identifier = str(uuid4())
                connection.execute(
                    "INSERT INTO users (id,name,username,role,password_hash) VALUES (?,?,?,?,?)",
                    (identifier, name, username, role, hash_password("12345678")),
                )
                seeded_users[username] = identifier
            for username in ("test1", "test2"):
                connection.execute("INSERT INTO metadata (key,value) VALUES (?,?)", (f"seed_{username}_id", seeded_users[username]))
            connection.execute("INSERT INTO metadata (key,value) VALUES ('auth_initialized','1')")
        first_member = connection.execute("SELECT value FROM metadata WHERE key='seed_test1_id'").fetchone()[0]
        second_member = connection.execute("SELECT value FROM metadata WHERE key='seed_test2_id'").fetchone()[0]
        connection.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                date TEXT NOT NULL,
                start TEXT NOT NULL,
                end TEXT NOT NULL,
                category TEXT NOT NULL,
                location TEXT NOT NULL,
                owner_id TEXT NOT NULL REFERENCES users(id)
            )
        """)
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(events)")}
        if "owner_id" not in columns:
            connection.execute("ALTER TABLE events ADD COLUMN owner_id TEXT REFERENCES users(id)")
        connection.execute("UPDATE events SET owner_id=? WHERE owner_id IS NULL", (first_member,))
        connection.execute("CREATE INDEX IF NOT EXISTS events_owner_date ON events(owner_id,date,start)")
        today = datetime.now(ZoneInfo("Asia/Tokyo")).date()
        if not existing_events and not initialized:
            for event in sample_events(today):
                connection.execute(
                    "INSERT INTO events (id,title,date,start,end,category,location,owner_id) "
                    "VALUES (:id,:title,:date,:start,:end,:category,:location,:owner_id)",
                    {**event, "owner_id": first_member},
                )
        if not auth_initialized:
            for event in sample_events(today):
                connection.execute(
                    "INSERT INTO events (id,title,date,start,end,category,location,owner_id) "
                    "VALUES (:id,:title,:date,:start,:end,:category,:location,:owner_id)",
                    {**event, "id": str(uuid4()), "owner_id": second_member,
                     "title": "昼下がりのギターライブ" if event["id"] == "sample-today-live" else
                              "かかりつけ医院の診察" if event["id"] == "sample-today-medical" else event["title"]},
                )
        connection.execute("INSERT OR IGNORE INTO metadata (key,value) VALUES ('initialized','1')")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)
        connection.execute("CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)")
        connection.execute("""
            CREATE TABLE IF NOT EXISTS login_attempts (
                key_hash TEXT PRIMARY KEY,
                failures INTEGER NOT NULL,
                window_started INTEGER NOT NULL,
                locked_until INTEGER NOT NULL
            )
        """)


def create_app(database_path: Path | str | None = None, dist_path: Path | None = None) -> FastAPI:
    db_path = Path(database_path or os.environ.get("CALENDAR_DB_PATH", ROOT / "data" / "calendar.sqlite3"))
    static_path = Path(dist_path or ROOT / "dist").resolve()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        initialize_database(db_path)
        yield

    app = FastAPI(
        title="日々の予定",
        description="ライブ、通院、その他の予定を管理するカレンダーです。",
        version="2.0.0", lifespan=lifespan, docs_url=None, redoc_url=None,
    )

    dummy_password_hash = hash_password(secrets.token_urlsafe(32))

    @app.middleware("http")
    async def protect_api(request: Request, call_next):
        api_request = request.url.path == "/api" or request.url.path.startswith("/api/")
        if api_request and request.method not in {"GET", "HEAD", "OPTIONS"}:
            if request.headers.get("X-Requested-With") != "XMLHttpRequest":
                return JSONResponse(status_code=403, content={"detail": "画面を再読み込みして、もう一度お試しください。"})
        response = await call_next(request)
        if api_request:
            response.headers["Cache-Control"] = "no-store"
        return response

    def current_user(request: Request) -> dict:
        token = request.cookies.get(COOKIE_NAME, "")
        if not token or len(token) > 256:
            raise HTTPException(status_code=401, detail="ログインしてください。")
        with database(db_path) as connection:
            row = connection.execute(
                "SELECT users.id,users.name,users.username,users.role FROM sessions "
                "JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?",
                (token_digest(token), int(time.time())),
            ).fetchone()
        if row is None:
            raise HTTPException(status_code=401, detail="ログインの有効期限が切れました。もう一度ログインしてください。")
        return dict(row)

    def member_user(user: dict = Depends(current_user)) -> dict:
        if user["role"] != "user":
            raise HTTPException(status_code=403, detail="会員アカウントでログインしてください。")
        return user

    def admin_user(user: dict = Depends(current_user)) -> dict:
        if user["role"] != "admin":
            raise HTTPException(status_code=403, detail="管理者のみ利用できます。")
        return user

    def secure_cookie(request: Request) -> bool:
        return request.url.scheme == "https" or os.environ.get("SESSION_COOKIE_SECURE", "").lower() in {"1", "true", "yes"}

    @app.post("/api/auth/login", response_model=User, summary="ログイン")
    def login(payload: LoginInput, request: Request, response: Response):
        now = int(time.time())
        address = request.client.host if request.client else "不明"
        account_key = token_digest(f"account:{address}:{payload.username}")
        address_key = token_digest(f"address:{address}")
        with database(db_path) as connection:
            connection.execute("DELETE FROM login_attempts WHERE window_started<? AND locked_until<=?", (now - 3600, now))
            checks = connection.execute(
                "SELECT locked_until FROM login_attempts WHERE key_hash IN (?,?)", (account_key, address_key)
            ).fetchall()
            wait = max([row["locked_until"] - now for row in checks] + [0])
            if wait > 0:
                raise HTTPException(status_code=429, detail="ログインの試行回数が多すぎます。しばらく待ってからお試しください。", headers={"Retry-After": str(wait)})
            stored = connection.execute("SELECT * FROM users WHERE username=?", (payload.username,)).fetchone()
        verified = verify_password(payload.password, stored["password_hash"] if stored else dummy_password_hash)
        if not stored or not verified:
            with database(db_path) as connection:
                connection.execute("BEGIN IMMEDIATE")
                for key, limit in ((account_key, 5), (address_key, 30)):
                    previous = connection.execute("SELECT * FROM login_attempts WHERE key_hash=?", (key,)).fetchone()
                    active = previous and previous["window_started"] > now - 900
                    failures = previous["failures"] + 1 if active else 1
                    started = previous["window_started"] if active else now
                    locked = now + 900 if failures >= limit else 0
                    connection.execute(
                        "INSERT INTO login_attempts(key_hash,failures,window_started,locked_until) VALUES(?,?,?,?) "
                        "ON CONFLICT(key_hash) DO UPDATE SET failures=excluded.failures,window_started=excluded.window_started,locked_until=excluded.locked_until",
                        (key, failures, started, locked),
                    )
            raise HTTPException(status_code=401, detail="会員IDまたはパスワードが正しくありません。")
        token = secrets.token_urlsafe(32)
        with database(db_path) as connection:
            connection.execute("DELETE FROM sessions WHERE expires_at<=?", (now,))
            inserted = connection.execute(
                "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) "
                "SELECT ?,id,?,? FROM users WHERE id=? AND username=? AND password_hash=?",
                (token_digest(token), now + SESSION_SECONDS, now, stored["id"], stored["username"], stored["password_hash"]),
            ).rowcount
            if not inserted:
                raise HTTPException(status_code=401, detail="ログイン情報が変更されました。もう一度ログインしてください。")
            previous_token = request.cookies.get(COOKIE_NAME)
            if previous_token:
                connection.execute("DELETE FROM sessions WHERE token_hash=?", (token_digest(previous_token),))
            connection.execute("DELETE FROM login_attempts WHERE key_hash=?", (account_key,))
        response.set_cookie(
            COOKIE_NAME, token, max_age=SESSION_SECONDS, httponly=True,
            secure=secure_cookie(request), samesite="lax", path="/",
        )
        return {key: stored[key] for key in ("id", "name", "username", "role")}

    @app.get("/api/auth/me", response_model=User, summary="ログイン中の会員情報を取得")
    def me(user: dict = Depends(current_user)):
        return user

    @app.post("/api/auth/logout", status_code=204, summary="ログアウト")
    def logout(request: Request):
        token = request.cookies.get(COOKIE_NAME)
        if token:
            with database(db_path) as connection:
                connection.execute("DELETE FROM sessions WHERE token_hash=?", (token_digest(token),))
        response = Response(status_code=204)
        response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=secure_cookie(request))
        return response

    @app.get("/api/admin/users", response_model=list[User], summary="会員一覧を取得")
    def list_members(admin: dict = Depends(admin_user)):
        with database(db_path) as connection:
            rows = connection.execute("SELECT id,name,username,role FROM users WHERE role='user' ORDER BY username,id").fetchall()
        return [dict(row) for row in rows]

    @app.put("/api/admin/users/{user_id}", response_model=User, summary="会員情報を変更")
    def update_member(user_id: str, payload: MemberUpdate, admin: dict = Depends(admin_user)):
        new_hash = hash_password(payload.password) if payload.password else None
        with database(db_path) as connection:
            connection.execute("BEGIN IMMEDIATE")
            stored = connection.execute("SELECT * FROM users WHERE id=? AND role='user'", (user_id,)).fetchone()
            if stored is None:
                raise HTTPException(status_code=404, detail="会員が見つかりません。")
            try:
                connection.execute(
                    "UPDATE users SET name=?,username=?,password_hash=COALESCE(?,password_hash) WHERE id=? AND role='user'",
                    (payload.name, payload.username, new_hash, user_id),
                )
            except sqlite3.IntegrityError:
                raise HTTPException(status_code=409, detail="この会員IDはすでに使用されています。") from None
            if new_hash or payload.username != stored["username"]:
                connection.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        return {"id": user_id, "name": payload.name, "username": payload.username, "role": "user"}

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        details = []
        for item in error.errors():
            field = str(item["loc"][-1]) if item["loc"] else ""
            label = FIELD_LABELS.get(field, "入力内容")
            if item["type"] == "value_error":
                message = str(item.get("ctx", {}).get("error", "入力内容を確認してください。"))
            elif item["type"] == "missing":
                message = f"{label}を入力してください。"
            elif field == "category":
                message = "種類はライブ、通院、その他から選んでください。"
            elif item["type"] == "json_invalid":
                message = "送信されたデータの形式が正しくありません。"
            elif item["type"] == "extra_forbidden":
                message = "未対応の項目が含まれています。"
            else:
                message = f"{label}の形式を確認してください。"
            details.append({"loc": list(item["loc"]), "msg": message, "type": item["type"]})
        return JSONResponse(status_code=422, content={"detail": details})

    @app.get("/api/health", summary="稼働状態を確認")
    def health():
        with database(db_path) as connection:
            connection.execute("SELECT COUNT(*) FROM events").fetchone()
        return {"status": "ok"}

    @app.get("/api/events", response_model=list[Event], summary="予定の一覧を取得")
    def get_events(user: dict = Depends(member_user)):
        with database(db_path) as connection:
            rows = connection.execute("SELECT id,title,date,start,end,category,location FROM events WHERE owner_id=? ORDER BY date,start,id", (user["id"],)).fetchall()
        return [dict(row) for row in rows]

    @app.post("/api/events", response_model=Event, status_code=status.HTTP_201_CREATED, summary="予定を登録")
    def create_event(payload: EventInput, user: dict = Depends(member_user)):
        event = {"id": str(uuid4()), **payload.model_dump()}
        with database(db_path) as connection:
            connection.execute(
                "INSERT INTO events (id,title,date,start,end,category,location,owner_id) "
                "VALUES (:id,:title,:date,:start,:end,:category,:location,:owner_id)", {**event, "owner_id": user["id"]},
            )
        return event

    @app.put("/api/events/{event_id}", response_model=Event, summary="予定を変更")
    def update_event(event_id: str, payload: EventInput, user: dict = Depends(member_user)):
        event = {"id": event_id, **payload.model_dump()}
        with database(db_path) as connection:
            changed = connection.execute(
                "UPDATE events SET title=:title, date=:date, start=:start, end=:end, "
                "category=:category, location=:location WHERE id=:id AND owner_id=:owner_id", {**event, "owner_id": user["id"]},
            ).rowcount
        if not changed:
            raise HTTPException(status_code=404, detail="予定が見つかりません。")
        return event

    @app.delete("/api/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT, summary="予定を削除")
    def delete_event(event_id: str, user: dict = Depends(member_user)):
        with database(db_path) as connection:
            deleted = connection.execute("DELETE FROM events WHERE id=? AND owner_id=?", (event_id, user["id"])).rowcount
        if not deleted:
            raise HTTPException(status_code=404, detail="予定が見つかりません。")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="指定された機能が見つかりません。")
        requested = (static_path / path).resolve()
        if not requested.is_relative_to(static_path):
            raise HTTPException(status_code=404, detail="ページが見つかりません。")
        if requested.is_file():
            return FileResponse(requested)
        if (static_path / "index.html").is_file() and not Path(path).suffix:
            return FileResponse(static_path / "index.html")
        if not (static_path / "index.html").is_file():
            raise HTTPException(status_code=503, detail="画面の準備が必要です。先に npm run build を実行してください。")
        raise HTTPException(status_code=404, detail="ファイルが見つかりません。")

    return app


app = create_app()
