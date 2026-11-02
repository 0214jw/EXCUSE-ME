import re
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Path, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, UUID4, field_validator

from database import CATEGORIES, connection, initialize


@asynccontextmanager
async def lifespan(app):
    initialize()
    yield


app = FastAPI(title="EXCUSE ME! API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ArtworkInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=2, max_length=50, strict=True)
    content: str = Field(min_length=10, max_length=300, strict=True)
    category: str = Field(strict=True)
    author: str = Field(default="익명의 예술가", max_length=20, strict=True)
    # A client-controlled demo identifier, never proof of identity or authorization.
    visitor_id: UUID4
    request_id: UUID4 = Field(default_factory=uuid4)

    @field_validator("title", "content", "author", mode="before")
    @classmethod
    def normalize_text(cls, value):
        if not isinstance(value, str):
            raise ValueError("문자열을 입력해 주세요.")
        # Match the browser's whitespace handling, including BOM and NEL.
        value = re.sub(r"^[\s\ufeff]+|[\s\ufeff]+$", "", value)
        return value

    @field_validator("author")
    @classmethod
    def anonymous_author(cls, value):
        return value or "익명의 예술가"

    @field_validator("category")
    @classmethod
    def valid_category(cls, value):
        if value not in CATEGORIES:
            raise ValueError("지정된 다섯 카테고리 중 하나를 선택해 주세요.")
        return value


class ArtworkOutput(BaseModel):
    id: int
    title: str
    content: str
    category: str
    author: str
    created_at: str
    updated_at: str
    # Read-only preparation for future server-side generation/media workflows.
    # ArtworkInput deliberately stays text-only until those workflows exist.
    refined_description: str | None = None
    image_url: str | None = None
    image_mode: Literal["generated", "photo"] | None = None
    image_style: str | None = None


@app.exception_handler(RequestValidationError)
async def invalid_input(request, exc):
    messages = {
        "title": "작품명은 앞뒤 공백을 제외하고 2~50자로 입력해 주세요.",
        "content": "핑계 내용은 앞뒤 공백을 제외하고 10~300자로 입력해 주세요.",
        "category": "지각·조퇴, 휴가·병가, 약속, 운동, 기타 중 하나를 선택해 주세요.",
        "author": "작가명은 최대 20자의 문자열로 입력해 주세요.",
        "visitor_id": "방문객 ID가 없거나 올바르지 않습니다. 브라우저 저장 설정을 확인해 주세요.",
        "request_id": "등록 요청 번호가 올바르지 않습니다. 화면을 새로 열어 주세요.",
        "artwork_id": "작품 번호는 1 이상의 정수여야 합니다.",
    }
    errors = {}
    for error in exc.errors():
        field = str(error["loc"][-1])
        errors[field] = messages.get(field, "허용되지 않은 입력입니다.")
    # Do not reflect the original request body or internal exception details.
    return JSONResponse(status_code=422, content={"detail": "입력값을 확인해 주세요.", "errors": errors})


@app.exception_handler(sqlite3.Error)
async def database_error(request, exc):
    return JSONResponse(status_code=503, content={
        "detail": "작품 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."
    })


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/artworks", response_model=ArtworkOutput, status_code=201)
def create_artwork(artwork: ArtworkInput, response: Response):
    now = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    values = artwork.model_dump(mode="json")
    with connection() as db:
        cursor = db.execute("""
            INSERT INTO artworks
                (title, content, category, author, visitor_id, request_id, created_at, updated_at)
            VALUES (:title, :content, :category, :author, :visitor_id, :request_id, :now, :now)
            ON CONFLICT(visitor_id, request_id) DO NOTHING
        """, {**values, "now": now})
        row = db.execute(
            "SELECT * FROM artworks WHERE visitor_id = ? AND request_id = ?",
            (values["visitor_id"], values["request_id"]),
        ).fetchone()
        if cursor.rowcount == 0:
            if any(row[key] != values[key] for key in ("title", "content", "category", "author")):
                raise HTTPException(409, "이미 사용한 요청 번호입니다. 입력 내용을 확인해 주세요.")
            response.status_code = 200
        result = dict(row)
    response.headers["Location"] = f"/api/artworks/{result['id']}"
    return result


@app.get("/api/artworks", response_model=list[ArtworkOutput])
def list_artworks():
    with connection() as db:
        return [dict(row) for row in db.execute(
            "SELECT * FROM artworks ORDER BY created_at DESC, id DESC"
        ).fetchall()]


@app.get("/api/artworks/{artwork_id}", response_model=ArtworkOutput)
def get_artwork(artwork_id: Annotated[int, Path(ge=1, le=9223372036854775807)]):
    with connection() as db:
        row = db.execute("SELECT * FROM artworks WHERE id = ?", (artwork_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "작품을 찾을 수 없습니다.")
    return dict(row)
