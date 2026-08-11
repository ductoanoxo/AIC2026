from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

# On Windows, importing PyTorch before FAISS prevents the two packages from
# trying to initialize incompatible OpenMP runtimes in the opposite order.
import torch
import faiss
import numpy as np

from .config import settings


class SearchService:
    def __init__(self) -> None:
        self.index: Any | None = None
        self.items: list[dict[str, Any]] = []
        self._model: Any | None = None
        self._tokenizer: Any | None = None
        self._model_lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return self.index is not None and bool(self.items)

    def load_index(self) -> None:
        if not settings.faiss_path.is_file() or not settings.index_metadata_path.is_file():
            return
        payload = json.loads(settings.index_metadata_path.read_text(encoding="utf-8"))
        index = faiss.read_index(str(settings.faiss_path))
        items = payload.get("items", [])
        if index.ntotal != len(items):
            raise RuntimeError("FAISS index and metadata have different item counts")
        if payload.get("model") != settings.clip_model or payload.get("pretrained") != settings.clip_pretrained:
            raise RuntimeError("Index encoder configuration does not match backend configuration")
        self.index = index
        self.items = items

    def _load_encoder(self) -> None:
        if self._model is not None:
            return
        with self._model_lock:
            if self._model is not None:
                return
            import open_clip

            model, _, _ = open_clip.create_model_and_transforms(
                settings.clip_model, pretrained=settings.clip_pretrained, device="cpu"
            )
            model.eval()
            self._model = model
            self._tokenizer = open_clip.get_tokenizer(settings.clip_model)

    def encode_text(self, query: str) -> np.ndarray:
        return self.encode_texts([query])

    def encode_texts(self, queries: list[str] | tuple[str, ...]) -> np.ndarray:
        self._load_encoder()
        tokens = self._tokenizer(list(queries))
        with torch.inference_mode():
            vector = self._model.encode_text(tokens).cpu().numpy().astype(np.float32)
        faiss.normalize_L2(vector)
        return np.ascontiguousarray(vector)

    def search_many(
        self,
        queries: list[str] | tuple[str, ...],
        top_k: int,
        video_id: str | None = None,
    ) -> list[dict[str, Any]]:
        if not self.ready:
            raise RuntimeError("Search index is not built. Run: python -m src.build_index")
        query_vectors = self.encode_texts(queries)
        probe = len(self.items) if video_id else min(len(self.items), max(500, top_k * 10))
        _, ids = self.index.search(query_vectors, probe)
        candidate_ids = {int(item_id) for row in ids for item_id in row if item_id >= 0}

        ranked: list[dict[str, Any]] = []
        for vector_id in candidate_ids:
            item = self.items[vector_id]
            if video_id and item["videoId"] != video_id:
                continue
            image_vector = self.index.reconstruct(vector_id)
            similarities = query_vectors @ image_vector
            score = 0.7 * float(similarities.max()) + 0.3 * float(similarities.mean())
            ranked.append({**item, "score": score})
        ranked.sort(key=lambda item: item["score"], reverse=True)
        # Keep the result grid diverse: adjacent keyframes from the same scene
        # belong in the inspector, not in consecutive retrieval ranks.
        selected: list[dict[str, Any]] = []
        for item in ranked:
            is_near_duplicate = any(
                previous["videoId"] == item["videoId"]
                and abs(float(previous["timestamp"]) - float(item["timestamp"])) <= 2.0
                for previous in selected
            )
            if is_near_duplicate:
                continue
            selected.append(item)
            if len(selected) == top_k:
                break
        return selected

    def search(self, query: str, top_k: int, video_id: str | None = None) -> list[dict[str, Any]]:
        if not self.ready:
            raise RuntimeError("Search index is not built. Run: python -m src.build_index")
        query_vector = self.encode_text(query)
        wanted = min(top_k, len(self.items))
        probe = wanted if video_id is None else len(self.items)
        scores, ids = self.index.search(query_vector, probe)

        results: list[dict[str, Any]] = []
        for score, vector_id in zip(scores[0], ids[0]):
            if vector_id < 0:
                continue
            item = self.items[int(vector_id)]
            if video_id and item["videoId"] != video_id:
                continue
            results.append({**item, "score": float(score)})
            if len(results) == wanted:
                break
        return results


search_service = SearchService()
