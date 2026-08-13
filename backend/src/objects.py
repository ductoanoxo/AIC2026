from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from .config import settings


# OpenImages/Faster R-CNN scores in the supplied files are often conservative;
# 0.05 keeps useful candidates while deduplication and the top-10 cap limit noise.
MIN_DISPLAY_SCORE = 0.05
MAX_OBJECTS = 10


@lru_cache(maxsize=1)
def read_object_catalog() -> tuple[str, ...]:
    """Load the exact class catalog generated from objects-aic25-b1."""
    path = settings.object_catalog_path
    if not path.is_file():
        return ()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return ()
    labels = payload.get("classes", []) if isinstance(payload, dict) else []
    if not isinstance(labels, list):
        return ()
    return tuple(sorted({label.strip() for label in labels if isinstance(label, str) and label.strip()}, key=str.casefold))


def _object_path(video_id: str, keyframe_index: int):
    return settings.object_dir / video_id / f"{keyframe_index:03d}.json"


@lru_cache(maxsize=8192)
def read_objects(video_id: str, keyframe_index: int) -> tuple[dict[str, Any], ...]:
    """Return deduplicated, confidence-ranked detections for one keyframe."""
    path = _object_path(video_id, keyframe_index)
    if not path.is_file():
        return ()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return ()

    labels = payload.get("detection_class_entities", [])
    scores = payload.get("detection_scores", [])
    boxes = payload.get("detection_boxes", [])
    best: dict[str, dict[str, Any]] = {}
    for index, (label, raw_score) in enumerate(zip(labels, scores)):
        if not isinstance(label, str) or not label.strip():
            continue
        try:
            score = float(raw_score)
        except (TypeError, ValueError):
            continue
        if score < MIN_DISPLAY_SCORE:
            continue
        detection: dict[str, Any] = {"label": label.strip(), "score": score}
        if index < len(boxes) and isinstance(boxes[index], list):
            try:
                detection["bbox"] = [float(value) for value in boxes[index]]
            except (TypeError, ValueError):
                pass
        key = label.strip().casefold()
        if key not in best or score > best[key]["score"]:
            best[key] = detection
    ranked = sorted(best.values(), key=lambda item: item["score"], reverse=True)
    return tuple(ranked[:MAX_OBJECTS])


def object_match_score(detections: tuple[dict[str, Any], ...], wanted: list[str]) -> float:
    """Score an AND-style object filter using the best confidence per label."""
    terms = [term.strip().casefold() for term in wanted if term.strip()]
    if not terms:
        return 0.0
    available = {
        detection["label"].casefold(): float(detection["score"])
        for detection in detections
    }
    matches = [max((score for label, score in available.items() if term in label), default=0.0) for term in terms]
    if any(score == 0.0 for score in matches):
        return 0.0
    return sum(matches) / len(matches)


def object_relevance_score(detections: tuple[dict[str, Any], ...], wanted: list[str]) -> float:
    """Soft score for AI-inferred labels; partial matches remain useful."""
    terms = [term.strip().casefold() for term in wanted if term.strip()]
    if not terms:
        return 0.0
    available = {
        detection["label"].casefold(): float(detection["score"])
        for detection in detections
    }
    matches = [max((score for label, score in available.items() if term == label), default=0.0) for term in terms]
    return sum(matches) / len(matches)
