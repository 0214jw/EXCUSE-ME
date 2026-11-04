import re
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException, Path, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, UUID4, field_validator, model_validator

from database import CATEGORIES, connection, initialize
from curator import CuratorInput, CuratorResult, generate_curator
import paintings


@asynccontextmanager
async def lifespan(app):
    initialize()
    yield


app = FastAPI(title="EXCUSE ME! API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-Visitor-ID"],
)


class ArtworkFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=2, max_length=50, strict=True)
    content: str = Field(min_length=10, max_length=300, strict=True)
    category: str = Field(strict=True)
    author: str = Field(default="익명의 예술가", max_length=20, strict=True)
    refined_description: str | None = Field(default=None, max_length=1000, strict=True)

    @field_validator("refined_description", mode="before")
    @classmethod
    def normalize_description(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("문자열을 입력해 주세요.")
        return re.sub(r"^[\s\ufeff]+|[\s\ufeff]+$", "", value) or None

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


class ArtworkInput(ArtworkFields):
    # Client-controlled demo ID, never proof of authenticated identity.
    visitor_id: UUID4
    request_id: UUID4 = Field(default_factory=uuid4)
    description_confirmed: bool = Field(default=False, strict=True)
    image_token: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{43}$", strict=True)
    image_confirmed: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def require_description_confirmation(self):
        if self.refined_description and not self.description_confirmed:
            raise ValueError("작품 설명 확인이 필요합니다.")
        if self.image_token and not self.image_confirmed:
            raise ValueError("생성 이미지 확인이 필요합니다.")
        return self


class ArtworkUpdate(ArtworkFields):
    visitor_id: UUID4


class ArtworkDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visitor_id: UUID4


class RecognitionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visitor_id: UUID4


class RecognitionResult(BaseModel):
    artwork_id: int
    recognition_count: int = Field(ge=0)
    recognized_by_me: bool


class ArtworkOutput(BaseModel):
    id: int
    title: str
    content: str
    category: str
    author: str
    created_at: str
    updated_at: str
    # Only the final, user-confirmed description is accepted during donation.
    # Image metadata is derived exclusively from a server-generated capability.
    refined_description: str | None = None
    image_url: str | None = None
    image_mode: Literal["generated", "photo"] | None = None
    image_style: str | None = None
    # Personalized demo ownership result; never expose the stored visitor ID.
    can_manage: bool = False
    recognition_count: int = Field(default=0, ge=0)
    recognized_by_me: bool = False


# Counts come from actual rows, never from a mutable cached counter.
ARTWORK_SELECT = """SELECT a.*,
    (SELECT count(*) FROM artwork_recognitions r WHERE r.artwork_id=a.id) AS recognition_count,
    EXISTS(SELECT 1 FROM artwork_recognitions r WHERE r.artwork_id=a.id AND r.visitor_id=?) AS recognized_by_me
    FROM artworks a"""


def artwork_row(db, artwork_id, visitor_id=None):
    return db.execute(ARTWORK_SELECT + " WHERE a.id=?", (visitor_id, artwork_id)).fetchone()


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
        "order": "정렬은 latest 또는 popular 중 하나를 선택해 주세요.",
        "refined_description": "작품 설명은 최대 1000자의 문자열로 입력해 주세요.",
        "description_confirmed": "작품 설명 확인 여부를 선택해 주세요.",
        "image_style": "수채화·유화·점묘화·연필 드로잉·콜라주 중 하나를 선택해 주세요.",
        "image_token": "생성된 이미지 정보가 올바르지 않습니다.",
        "image_confirmed": "생성 이미지를 확인한 뒤 기증 여부를 선택해 주세요.",
        "body": "작품 설명과 생성 이미지의 확인 여부를 확인해 주세요.",
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


@app.post("/api/curator", response_model=CuratorResult)
def curate(data: CuratorInput, request: Request):
    return generate_curator(data, request.client.host if request.client else "unknown")


@app.post("/api/image-generations")
def generate_image(data: paintings.PaintingInput, request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return paintings.generate_painting(data, request.client.host if request.client else "unknown")


@app.post("/api/artworks", response_model=ArtworkOutput, status_code=201)
def create_artwork(artwork: ArtworkInput, response: Response):
    now = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    values = artwork.model_dump(mode="json")
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute("SELECT * FROM artworks WHERE visitor_id=? AND request_id=?",
                              (values["visitor_id"], values["request_id"])).fetchone()
        image = paintings.donation_image(db, values, existing["id"] if existing else None)
        if existing:
            linked = db.execute("SELECT id FROM image_generations WHERE artwork_id=?", (existing["id"],)).fetchone()
            if bool(linked) != bool(image) or (linked and linked["id"] != image["id"]):
                raise HTTPException(409, "이미 사용한 기증 요청의 이미지가 다릅니다.")
        cursor = db.execute("""
            INSERT INTO artworks
                (title, content, category, author, visitor_id, request_id, created_at, updated_at, refined_description)
            VALUES (:title, :content, :category, :author, :visitor_id, :request_id, :now, :now, :refined_description)
            ON CONFLICT(visitor_id, request_id) DO NOTHING
        """, {**values, "now": now})
        row = db.execute(
            "SELECT * FROM artworks WHERE visitor_id = ? AND request_id = ?",
            (values["visitor_id"], values["request_id"]),
        ).fetchone()
        if cursor.rowcount == 0:
            if any(row[key] != values[key] for key in ("title", "content", "category", "author", "refined_description")):
                raise HTTPException(409, "이미 사용한 요청 번호입니다. 입력 내용을 확인해 주세요.")
            response.status_code = 200
        elif image:
            image_url = f"/api/artworks/{row['id']}/image"
            db.execute("UPDATE artworks SET image_url=?, image_mode='generated', image_style=? WHERE id=?",
                       (image_url, image["style"], row["id"]))
            db.execute("UPDATE image_generations SET artwork_id=? WHERE id=?", (row["id"], image["id"]))
            row = db.execute("SELECT * FROM artworks WHERE id=?", (row["id"],)).fetchone()
        result = dict(artwork_row(db, row["id"]))
    response.headers["Location"] = f"/api/artworks/{result['id']}"
    return result


@app.get("/api/artworks/{artwork_id}/image")
def get_artwork_image(artwork_id: Annotated[int, Path(ge=1, le=9223372036854775807)]):
    with connection() as db:
        row = db.execute("SELECT filename,digest FROM image_generations WHERE artwork_id=? AND status='ready'",
                         (artwork_id,)).fetchone()
    if not row:
        raise HTTPException(404, "공개된 작품 이미지가 없습니다.")
    try:
        raw = paintings.file_path(row["filename"]).read_bytes()
        if paintings.hashlib.sha256(raw).hexdigest() != row["digest"]:
            raise OSError("Changed image")
    except OSError:
        raise HTTPException(503, "작품 이미지를 불러올 수 없습니다.") from None
    # Future reads must re-check publication after deletion; downloaded copies
    # and responses cached before this change cannot be recalled.
    return Response(raw, media_type="image/png", headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"})


@app.get("/api/artworks", response_model=list[ArtworkOutput])
def list_artworks(response: Response = None, order: Literal["latest", "popular"] = "latest",
                  category: str | None = None):
    if category is not None and category not in CATEGORIES:
        raise HTTPException(422, "지각·조퇴, 휴가·병가, 약속, 운동, 기타 중 하나를 선택해 주세요.")
    where = " WHERE a.category=?" if category is not None else ""
    # User's Phase 4 policy overrides older planning-document tie rules.
    sort = "recognition_count DESC, a.created_at ASC, a.id ASC" if order == "popular" else "a.created_at DESC, a.id DESC"
    with connection() as db:
        rows = db.execute(ARTWORK_SELECT + where + " ORDER BY " + sort,
                          (None, category) if category is not None else (None,)).fetchall()
    if response is not None:
        response.headers["Cache-Control"] = "no-store"
    return [dict(row) for row in rows]


@app.get("/api/hall-of-fame", response_model=list[ArtworkOutput])
def hall_of_fame(response: Response):
    with connection() as db:
        rows = db.execute(ARTWORK_SELECT + " ORDER BY recognition_count DESC, a.created_at ASC, a.id ASC LIMIT 10", (None,)).fetchall()
    response.headers["Cache-Control"] = "no-store"
    return [dict(row) for row in rows]


@app.get("/api/artworks/{artwork_id}", response_model=ArtworkOutput)
def get_artwork(artwork_id: Annotated[int, Path(ge=1, le=9223372036854775807)], response: Response = None,
                visitor_id: Annotated[UUID4 | None, Header(alias="X-Visitor-ID")] = None):
    with connection() as db:
        row = artwork_row(db, artwork_id, str(visitor_id) if visitor_id is not None else None)
    if row is None:
        raise HTTPException(404, "작품을 찾을 수 없습니다.")
    if response is not None:
        response.headers["Cache-Control"] = "no-store"
        response.headers["Vary"] = "X-Visitor-ID"
    return {**dict(row), "can_manage": visitor_id is not None and row["visitor_id"] == str(visitor_id)}


def owned_artwork(db, artwork_id, visitor_id):
    row = db.execute("SELECT * FROM artworks WHERE id=?", (artwork_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "작품을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.")
    if row["visitor_id"] != str(visitor_id):
        raise HTTPException(403, "이 방문객 ID로 기증한 작품만 수정하거나 삭제할 수 있습니다.")
    return row


@app.put("/api/artworks/{artwork_id}", response_model=ArtworkOutput)
def update_artwork(artwork_id: Annotated[int, Path(ge=1, le=9223372036854775807)],
                   data: ArtworkUpdate, response: Response):
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        row = owned_artwork(db, artwork_id, data.visitor_id)
        # An omitted explanation preserves it; explicit null/blank clears it.
        description = data.refined_description if "refined_description" in data.model_fields_set else row["refined_description"]
        db.execute("""UPDATE artworks SET title=?, content=?, category=?, author=?,
                   refined_description=?, updated_at=? WHERE id=?""",
                   (data.title, data.content, data.category, data.author, description,
                    datetime.now(timezone.utc).isoformat(timespec="microseconds"), artwork_id))
        result = dict(artwork_row(db, artwork_id, str(data.visitor_id)))
    response.headers["Cache-Control"] = "no-store"
    return {**result, "can_manage": True}


@app.delete("/api/artworks/{artwork_id}", status_code=204)
def delete_artwork(artwork_id: Annotated[int, Path(ge=1, le=9223372036854775807)], data: ArtworkDelete):
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        owned_artwork(db, artwork_id, data.visitor_id)
        # Revoke public access/capability in the same transaction. Keep budget
        # reservations and private files; only explicit preview maintenance may
        # later remove these unlinked, expired results. Never unlink a client URL.
        db.execute("UPDATE image_generations SET artwork_id=NULL, status='expired' WHERE artwork_id=?", (artwork_id,))
        db.execute("DELETE FROM artworks WHERE id=?", (artwork_id,))
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


def set_recognition(artwork_id, visitor_id, recognized):
    visitor = str(visitor_id)
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        if not db.execute("SELECT 1 FROM artworks WHERE id=?", (artwork_id,)).fetchone():
            raise HTTPException(404, "작품을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.")
        # Explicit add/remove rather than a blind toggle: retries cannot invert a vote.
        # Self-recognition is allowed for this local demo, per the user's policy.
        if recognized:
            db.execute("INSERT INTO artwork_recognitions(artwork_id,visitor_id,created_at) VALUES (?,?,?) ON CONFLICT(artwork_id,visitor_id) DO NOTHING",
                       (artwork_id, visitor, datetime.now(timezone.utc).isoformat(timespec="microseconds")))
        else:
            db.execute("DELETE FROM artwork_recognitions WHERE artwork_id=? AND visitor_id=?", (artwork_id, visitor))
        row = artwork_row(db, artwork_id, visitor)
        return {"artwork_id": artwork_id, "recognition_count": row["recognition_count"],
                "recognized_by_me": bool(row["recognized_by_me"])}


@app.put("/api/artworks/{artwork_id}/recognition", response_model=RecognitionResult)
def recognize_artwork(artwork_id: Annotated[int, Path(ge=1, le=9223372036854775807)], data: RecognitionInput, response: Response):
    result = set_recognition(artwork_id, data.visitor_id, True)
    response.headers["Cache-Control"] = "no-store"
    return result


@app.delete("/api/artworks/{artwork_id}/recognition", response_model=RecognitionResult)
def cancel_recognition(artwork_id: Annotated[int, Path(ge=1, le=9223372036854775807)], data: RecognitionInput, response: Response):
    result = set_recognition(artwork_id, data.visitor_id, False)
    response.headers["Cache-Control"] = "no-store"
    return result
