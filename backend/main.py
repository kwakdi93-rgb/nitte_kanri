from contextlib import asynccontextmanager, contextmanager
from datetime import date as calendar_date, datetime, timedelta
import os
from pathlib import Path
import re
import sqlite3
from typing import Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, field_validator, model_validator


ROOT = Path(__file__).resolve().parent.parent
TIME_PATTERN = re.compile(r"(?:[01]\d|2[0-3]):[0-5]\d")
FIELD_LABELS = {
    "title": "予定名", "date": "日付", "start": "開始時間", "end": "終了時間",
    "category": "種類", "location": "場所",
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
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize_database(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with database(path) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                date TEXT NOT NULL,
                start TEXT NOT NULL,
                end TEXT NOT NULL,
                category TEXT NOT NULL,
                location TEXT NOT NULL
            )
        """)
        connection.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        seeded = connection.execute(
            "INSERT OR IGNORE INTO metadata (key, value) VALUES ('initialized', '1')"
        ).rowcount
        if seeded:
            today = datetime.now(ZoneInfo("Asia/Tokyo")).date()
            connection.executemany(
                "INSERT INTO events (id, title, date, start, end, category, location) "
                "VALUES (:id, :title, :date, :start, :end, :category, :location)",
                sample_events(today),
            )


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
        version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None,
    )

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
    def get_events():
        with database(db_path) as connection:
            rows = connection.execute("SELECT * FROM events ORDER BY date, start, id").fetchall()
        return [dict(row) for row in rows]

    @app.post("/api/events", response_model=Event, status_code=status.HTTP_201_CREATED, summary="予定を登録")
    def create_event(payload: EventInput):
        event = {"id": str(uuid4()), **payload.model_dump()}
        with database(db_path) as connection:
            connection.execute(
                "INSERT INTO events (id, title, date, start, end, category, location) "
                "VALUES (:id, :title, :date, :start, :end, :category, :location)", event,
            )
        return event

    @app.put("/api/events/{event_id}", response_model=Event, summary="予定を変更")
    def update_event(event_id: str, payload: EventInput):
        event = {"id": event_id, **payload.model_dump()}
        with database(db_path) as connection:
            changed = connection.execute(
                "UPDATE events SET title=:title, date=:date, start=:start, end=:end, "
                "category=:category, location=:location WHERE id=:id", event,
            ).rowcount
        if not changed:
            raise HTTPException(status_code=404, detail="予定が見つかりません。")
        return event

    @app.delete("/api/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT, summary="予定を削除")
    def delete_event(event_id: str):
        with database(db_path) as connection:
            deleted = connection.execute("DELETE FROM events WHERE id = ?", (event_id,)).rowcount
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
