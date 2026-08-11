from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import cv2
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from .config import settings
from .schemas import QaAnswerRequest, SearchRequest
from .query_translation import TranslationError, translate_queries_for_clip
from .qa import QaError, answer_video_question
from .search import search_service


@asynccontextmanager
async def lifespan(_: FastAPI):
    search_service.load_index()
    yield


app = FastAPI(title="AIC 2026 Retrieval API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def public_url(request: Request, path: str) -> str:
    return str(request.base_url).rstrip("/") + "/api" + path


def video_path(video_id: str) -> Path:
    if not video_id.startswith(settings.batch_prefix) or not video_id.replace("_", "").isalnum():
        raise HTTPException(status_code=404, detail="Video not found")
    path = settings.video_dir / f"{video_id}.mp4"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Video not found")
    return path


def read_video_metadata(video_id: str, fps: float | None = None) -> dict[str, Any]:
    path = settings.media_info_dir / f"{video_id}.json"
    raw: dict[str, Any] = {}
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
    result: dict[str, Any] = {}
    title = raw.get("title")
    description = raw.get("description")
    duration = raw.get("length") or raw.get("duration")
    if isinstance(title, str):
        result["title"] = title
    if isinstance(description, str):
        result["description"] = description
    if isinstance(duration, (int, float)):
        result["duration"] = duration
    if fps is not None:
        result["fps"] = fps
    return result


def result_payload(request: Request, item: dict[str, Any], rank: int) -> dict[str, Any]:
    video_id = item["videoId"]
    frame_id = int(item["frameId"])
    score = item.get("score")
    return {
        "rank": rank,
        "videoId": video_id,
        "frameId": frame_id,
        "keyframeIndex": int(item["keyframeIndex"]),
        "timestamp": float(item["timestamp"]),
        "score": score,
        "clipScore": score,
        "objectScore": 0.0,
        "thumbnailUrl": public_url(request, f"/frames/{video_id}/{frame_id}"),
        "videoUrl": public_url(request, f"/videos/{video_id}"),
        "metadata": read_video_metadata(video_id, float(item["fps"])),
        "objects": [],
    }


@app.get("/api/status")
def status() -> dict[str, Any]:
    return {
        "status": "online" if search_service.ready else "initializing",
        "version": app.version,
        "message": None if search_service.ready else "Run python -m src.build_index first",
        "vectors": len(search_service.items),
    }


@app.post("/api/search")
def search(body: SearchRequest, request: Request) -> dict[str, Any]:
    try:
        english_queries = translate_queries_for_clip(body.query, body.translator)
        matches = search_service.search_many(english_queries, body.topK, body.videoId)
    except TranslationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    results = [result_payload(request, item, rank) for rank, item in enumerate(matches, 1)]
    return {
        "query": body.query,
        "originalQuery": body.query,
        "translatedQuery": english_queries[0],
        "expandedQueries": list(english_queries),
        "translator": body.translator,
        "message": f"Đã tìm thấy {len(results)} kết quả phù hợp.",
        "total": len(results),
        "results": results,
    }


@app.post("/api/qa/answer")
def qa_answer(body: QaAnswerRequest, request: Request) -> dict[str, Any]:
    path = video_path(body.videoId)
    try:
        result = answer_video_question(
            video_file=path,
            event_description=body.eventDescription,
            question=body.question,
            center_frame_id=body.frameId,
            context_frames=body.contextFrames,
        )
    except QaError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    evidence_frame = {
        "rank": 1,
        "videoId": body.videoId,
        "frameId": result.evidence_frame_id,
        "timestamp": result.evidence_frame_id / result.fps,
        "score": result.confidence,
        "thumbnailUrl": public_url(
            request, f"/frames/{body.videoId}/{result.evidence_frame_id}"
        ),
        "videoUrl": public_url(request, f"/videos/{body.videoId}"),
        "metadata": read_video_metadata(body.videoId, result.fps),
        "objects": [],
    }
    return {
        "videoId": body.videoId,
        "frameId": result.evidence_frame_id,
        "answer": result.answer,
        "confidence": result.confidence,
        "reasoning": result.reasoning,
        "contextFrameIds": list(result.context_frame_ids),
        "evidenceFrame": evidence_frame,
    }


@app.get("/api/videos/{video_id}")
def get_video(video_id: str) -> FileResponse:
    return FileResponse(video_path(video_id), media_type="video/mp4", filename=f"{video_id}.mp4")


@app.get("/api/frames/{video_id}/{frame_id}")
def get_frame(video_id: str, frame_id: int) -> Response:
    if frame_id < 0:
        raise HTTPException(status_code=400, detail="frame_id must be non-negative")
    settings.thumbnail_dir.mkdir(parents=True, exist_ok=True)
    cached = settings.thumbnail_dir / f"{video_id}_{frame_id}.jpg"
    if not cached.is_file():
        capture = cv2.VideoCapture(str(video_path(video_id)))
        try:
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame_id)
            ok, frame = capture.read()
        finally:
            capture.release()
        if not ok:
            raise HTTPException(status_code=404, detail="Frame not found")
        ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok:
            raise HTTPException(status_code=500, detail="Could not encode frame")
        cached.write_bytes(encoded.tobytes())
    return Response(content=cached.read_bytes(), media_type="image/jpeg")


@app.get("/api/videos/{video_id}/nearby-frames")
def nearby_frames(
    video_id: str,
    request: Request,
    frameId: int = Query(ge=0),
    count: int = Query(default=6, ge=1, le=50),
) -> dict[str, Any]:
    video_path(video_id)
    candidates = [item for item in search_service.items if item["videoId"] == video_id]
    candidates.sort(key=lambda item: abs(int(item["frameId"]) - frameId))
    selected = sorted(candidates[: 2 * count + 1], key=lambda item: int(item["frameId"]))
    return {
        "frames": [result_payload(request, item, rank) for rank, item in enumerate(selected, 1)]
    }
