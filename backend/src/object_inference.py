from __future__ import annotations

import json
from functools import lru_cache

import requests

from .config import settings


SYSTEM_PROMPT = """You select object-detection labels for video retrieval.
Choose only visually concrete objects explicitly stated in the query or an exact cross-language synonym.
Every output value must exactly match one label from allowed_labels. Never invent or translate labels.
Return at most 5 labels. Return an empty list for abstract queries or when no allowed label is useful.
Never infer demographics or subclasses: Person does not imply Man, Woman, Boy, or Girl.
Never infer likely contextual objects: road does not imply Car; room does not imply Chair or Furniture.
Do not select a label merely because it commonly occurs in the described scene.
If the query's object has no exact label or clear synonym in allowed_labels, omit it. If nothing remains, return [].
Return JSON only: {\"objects\": [\"Exact label\"]}."""


@lru_cache(maxsize=512)
def infer_query_objects(query: str, allowed_labels: tuple[str, ...]) -> tuple[str, ...]:
    if not settings.openrouter_api_keys or not allowed_labels:
        return ()
    payload = {
        "model": settings.object_inference_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps({
                "query": query,
                "allowed_labels": list(allowed_labels),
            }, ensure_ascii=False)},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    valid = {label.casefold(): label for label in allowed_labels}
    for api_key in settings.openrouter_api_keys:
        try:
            response = requests.post(
                settings.openrouter_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "AIC 2026 Video Retrieval",
                },
                json=payload,
                timeout=20,
            )
            if response.status_code in {401, 402, 404, 429} or response.status_code >= 500:
                continue
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            objects = json.loads(content).get("objects", [])
            if not isinstance(objects, list):
                continue
            selected: list[str] = []
            for value in objects:
                if isinstance(value, str) and value.casefold() in valid:
                    canonical = valid[value.casefold()]
                    if canonical not in selected:
                        selected.append(canonical)
            return tuple(selected[:5])
        except (requests.RequestException, KeyError, IndexError, TypeError, json.JSONDecodeError):
            continue
    # Object inference is an optional reranker; retrieval must still work if OpenRouter fails.
    return ()
