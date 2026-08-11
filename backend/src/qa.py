from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import cv2
import requests

from .config import settings


class QaError(RuntimeError):
    pass


@dataclass(frozen=True)
class EncodedFrame:
    frame_id: int
    timestamp: float
    jpeg: bytes


@dataclass(frozen=True)
class QaResult:
    answer: str
    evidence_frame_id: int
    confidence: float
    reasoning: str
    context_frame_ids: tuple[int, ...]
    fps: float


SYSTEM_PROMPT = """Bạn là hệ thống Video Question Answering cho cuộc thi AIC.
Chỉ dùng các frame được cung cấp làm bằng chứng. Trả lời câu hỏi thật ngắn bằng
tiếng Việt hoặc tiếng Anh. Không đoán khi hình ảnh không đủ bằng chứng. Chọn đúng
frame_id thể hiện rõ nhất câu trả lời. Với câu hỏi đếm, hãy đếm cẩn thận; với chữ
trên màn hình, sao chép chính xác. Chỉ trả về object JSON có đúng bốn field:
answer (string), evidence_frame_id (integer), confidence (number từ 0 đến 1),
reasoning (string giải thích ngắn)."""


RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {
            "type": "string",
            "description": "Câu trả lời ngắn bằng tiếng Việt hoặc tiếng Anh.",
        },
        "evidence_frame_id": {
            "type": "integer",
            "description": "Một frame_id đã cung cấp thể hiện câu trả lời rõ nhất.",
        },
        "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
        },
        "reasoning": {
            "type": "string",
            "description": "Giải thích bằng chứng ngắn gọn, không chứa chain-of-thought.",
        },
    },
    "required": ["answer", "evidence_frame_id", "confidence", "reasoning"],
    "additionalProperties": False,
}


def extract_context_frames(
    video_file: Path,
    center_frame_id: int,
    context_frames: int,
) -> tuple[list[EncodedFrame], float]:
    capture = cv2.VideoCapture(str(video_file))
    try:
        if not capture.isOpened():
            raise QaError("Không thể mở video để thực hiện Q&A.")
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        if fps <= 0 or frame_count <= 0:
            raise QaError("Video không có FPS hoặc số frame hợp lệ.")

        radius = context_frames // 2
        # Sample one frame per second around the selected retrieval hit. This
        # gives the VLM temporal context without uploading an entire clip.
        wanted_ids = {
            min(max(center_frame_id + offset * round(fps), 0), frame_count - 1)
            for offset in range(-radius, radius + 1)
        }
        frames: list[EncodedFrame] = []
        for frame_id in sorted(wanted_ids):
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame_id)
            ok, frame = capture.read()
            if not ok:
                continue
            ok, encoded = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82]
            )
            if ok:
                frames.append(
                    EncodedFrame(
                        frame_id=frame_id,
                        timestamp=frame_id / fps,
                        jpeg=encoded.tobytes(),
                    )
                )
    finally:
        capture.release()

    if not frames:
        raise QaError("Không trích xuất được frame ngữ cảnh cho Q&A.")
    return frames, fps


def _parse_response(response: Any, valid_frame_ids: set[int], fallback: int) -> QaResult:
    parsed = getattr(response, "parsed", None)
    if not isinstance(parsed, dict):
        text = getattr(response, "text", None)
        if isinstance(text, str):
            clean = text.strip()
            if clean.startswith("```"):
                clean = clean.removeprefix("```json").removeprefix("```")
                clean = clean.removesuffix("```").strip()
            try:
                parsed = json.loads(clean)
            except json.JSONDecodeError:
                # Be defensive when a provider wraps a valid object in a short
                # explanation despite structured-output instructions.
                decoder = json.JSONDecoder()
                parsed = None
                for index, character in enumerate(clean):
                    if character != "{":
                        continue
                    try:
                        candidate, _ = decoder.raw_decode(clean[index:])
                    except json.JSONDecodeError:
                        continue
                    if isinstance(candidate, dict):
                        parsed = candidate
                        break
    if not isinstance(parsed, dict):
        raise QaError("Gemini không trả về kết quả Q&A đúng định dạng.")

    answer = parsed.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        raise QaError("Gemini không tạo được câu trả lời.")
    evidence = parsed.get("evidence_frame_id")
    if not isinstance(evidence, int) or evidence not in valid_frame_ids:
        evidence = fallback
    confidence = parsed.get("confidence", 0.0)
    if not isinstance(confidence, (int, float)):
        confidence = 0.0
    reasoning = parsed.get("reasoning", "")
    if not isinstance(reasoning, str):
        reasoning = ""
    return QaResult(
        answer=answer.strip(),
        evidence_frame_id=evidence,
        confidence=min(max(float(confidence), 0.0), 1.0),
        reasoning=reasoning.strip(),
        context_frame_ids=tuple(sorted(valid_frame_ids)),
        fps=0.0,
    )


def answer_video_question(
    video_file: Path,
    event_description: str,
    question: str,
    center_frame_id: int,
    context_frames: int = 5,
) -> QaResult:
    if not settings.openrouter_api_keys:
        raise QaError("Chưa cấu hình OPENROUTER_API_KEY để chạy Q&A bằng hình ảnh.")

    frames, fps = extract_context_frames(video_file, center_frame_id, context_frames)
    valid_ids = {frame.frame_id for frame in frames}
    fallback = min(valid_ids, key=lambda value: abs(value - center_frame_id))
    content: list[dict[str, Any]] = [{
        "type": "text",
        "text": (
            f"Mô tả sự kiện: {event_description.strip()}\nCâu hỏi: {question.strip()}\n"
            "Các ảnh sau được sắp xếp theo thời gian. Mỗi nhãn frame_id thuộc ảnh ngay sau nó."
        ),
    }]
    for frame in frames:
        content.append({
            "type": "text",
            "text": f"frame_id={frame.frame_id}, timestamp={frame.timestamp:.3f}s",
        })
        encoded = base64.b64encode(frame.jpeg).decode("ascii")
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
        })

    last_problem = ""
    for api_key in settings.openrouter_api_keys:
        try:
            response = requests.post(
                settings.openrouter_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "AIC 2026 Video Q&A",
                },
                json={
                    "model": settings.qa_model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": content},
                    ],
                    "temperature": 0,
                    "max_tokens": 2048,
                    "reasoning": {"effort": "low", "exclude": True},
                    "provider": {"require_parameters": True},
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {
                            "name": "aic_video_qa_answer",
                            "strict": True,
                            "schema": RESPONSE_SCHEMA,
                        },
                    },
                },
                timeout=60,
            )
            if response.status_code in (401, 402, 429) or response.status_code >= 500:
                last_problem = f"OpenRouter tạm thời không khả dụng (HTTP {response.status_code})."
                continue
            if response.status_code == 404:
                last_problem = f"OpenRouter không tìm thấy model {settings.qa_model}."
                continue
            response.raise_for_status()
            raw_content = response.json()["choices"][0]["message"]["content"]
            if isinstance(raw_content, list):
                raw_content = "".join(
                    item.get("text", "") for item in raw_content if isinstance(item, dict)
                )
            parsed = _parse_response(
                SimpleNamespace(
                    parsed=raw_content if isinstance(raw_content, dict) else None,
                    text=raw_content if isinstance(raw_content, str) else None,
                ),
                valid_ids,
                fallback,
            )
            return QaResult(
                answer=parsed.answer,
                evidence_frame_id=parsed.evidence_frame_id,
                confidence=parsed.confidence,
                reasoning=parsed.reasoning,
                context_frame_ids=parsed.context_frame_ids,
                fps=fps,
            )
        except QaError:
            raise
        except requests.Timeout:
            last_problem = "OpenRouter phản hồi quá thời gian 60 giây."
            continue
        except requests.RequestException:
            last_problem = "Không thể kết nối tới OpenRouter."
            continue
        except Exception as error:
            raise QaError("OpenRouter trả về response Q&A không hợp lệ.") from error
    raise QaError(last_problem or "Tất cả OPENROUTER_API_KEY đều không khả dụng.")
