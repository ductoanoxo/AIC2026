from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import faiss
import numpy as np

from .config import settings


def read_mapping(path: Path) -> list[dict[str, int | float]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    return [
        {
            "keyframeIndex": int(row["n"]),
            "timestamp": float(row["pts_time"]),
            "fps": float(row["fps"]),
            "frameId": int(row["frame_idx"]),
        }
        for row in rows
    ]


def build_index(batch_prefix: str = settings.batch_prefix) -> tuple[int, int]:
    feature_paths = sorted(settings.feature_dir.glob(f"{batch_prefix}*.npy"))
    if not feature_paths:
        raise FileNotFoundError(
            f"No feature files matching {batch_prefix}*.npy in {settings.feature_dir}"
        )

    matrices: list[np.ndarray] = []
    metadata: list[dict[str, int | float | str]] = []
    dimension: int | None = None

    for feature_path in feature_paths:
        video_id = feature_path.stem
        mapping_path = settings.mapping_dir / f"{video_id}.csv"
        video_path = settings.video_dir / f"{video_id}.mp4"
        if not mapping_path.is_file():
            raise FileNotFoundError(f"Missing keyframe mapping: {mapping_path}")
        if not video_path.is_file():
            raise FileNotFoundError(f"Missing source video: {video_path}")

        matrix = np.load(feature_path, allow_pickle=False)
        if matrix.ndim != 2:
            raise ValueError(f"Expected a 2D feature matrix in {feature_path}, got {matrix.shape}")
        matrix = np.ascontiguousarray(matrix, dtype=np.float32)
        rows = read_mapping(mapping_path)
        if len(rows) != matrix.shape[0]:
            raise ValueError(
                f"Feature/mapping mismatch for {video_id}: "
                f"{matrix.shape[0]} vectors versus {len(rows)} CSV rows"
            )
        if dimension is None:
            dimension = matrix.shape[1]
        elif matrix.shape[1] != dimension:
            raise ValueError(f"Inconsistent feature dimension in {feature_path}")

        faiss.normalize_L2(matrix)
        matrices.append(matrix)
        metadata.extend({"videoId": video_id, **row} for row in rows)

    vectors = np.ascontiguousarray(np.concatenate(matrices), dtype=np.float32)
    index = faiss.IndexFlatIP(vectors.shape[1])
    index.add(vectors)

    settings.index_dir.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(settings.faiss_path))
    payload = {
        "version": 1,
        "model": settings.clip_model,
        "pretrained": settings.clip_pretrained,
        "dimension": vectors.shape[1],
        "count": vectors.shape[0],
        "items": metadata,
    }
    settings.index_metadata_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    return len(feature_paths), vectors.shape[0]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the AIC L30 FAISS index")
    parser.add_argument("--batch-prefix", default=settings.batch_prefix)
    args = parser.parse_args()
    videos, vectors = build_index(args.batch_prefix)
    print(f"Built {settings.faiss_path} with {vectors} vectors from {videos} videos")


if __name__ == "__main__":
    main()

