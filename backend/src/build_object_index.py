from __future__ import annotations

import os
import json
import time
from collections import defaultdict, Counter
from multiprocessing import Pool, cpu_count
from pathlib import Path

from .config import settings

def _parse_file(fpath_str: str) -> tuple[str, int, list[tuple[str, float]]]:
    fpath = Path(fpath_str)
    video_id = fpath.parent.name
    try:
        keyframe_idx = int(fpath.stem)
    except ValueError:
        keyframe_idx = 0

    results: list[tuple[str, float]] = []
    try:
        with fpath.open("r", encoding="utf-8") as f:
            data = json.load(f)
            entities = data.get("detection_class_entities", [])
            scores = data.get("detection_scores", [])

            # Deduplicate per frame keeping highest score per entity
            best: dict[str, float] = {}
            for ent, raw_score in zip(entities, scores):
                if isinstance(ent, str) and ent.strip():
                    try:
                        score = float(raw_score)
                    except (TypeError, ValueError):
                        continue
                    clean_ent = ent.strip()
                    if clean_ent not in best or score > best[clean_ent]:
                        best[clean_ent] = score
            results = [(ent, score) for ent, score in best.items()]
    except Exception:
        pass

    return video_id, keyframe_idx, results


def build_object_index(min_score: float = 0.05) -> tuple[int, int]:
    start_time = time.time()
    print(f"Scanning object JSON files in {settings.object_dir}...", flush=True)

    json_paths = [str(p) for p in settings.object_dir.rglob("*.json")]
    total_files = len(json_paths)
    print(f"Found {total_files} JSON files in {time.time() - start_time:.2f}s", flush=True)

    num_workers = min(cpu_count(), 16)
    print(f"Building inverted object index with {num_workers} processes...", flush=True)

    # Inverted index: entity_lower -> list of [video_id, keyframe_idx, score]
    inverted_index = defaultdict(list)
    entity_case_map = {}
    total_detections = 0

    with Pool(num_workers) as pool:
        for i, (video_id, kf_idx, detections) in enumerate(pool.imap_unordered(_parse_file, json_paths, chunksize=256), 1):
            for ent, score in detections:
                if score >= min_score:
                    ent_lower = ent.casefold()
                    if ent_lower not in entity_case_map:
                        entity_case_map[ent_lower] = ent
                    inverted_index[ent_lower].append([video_id, kf_idx, round(score, 4)])
                    total_detections += 1

            if i % 50000 == 0 or i == total_files:
                print(f"Indexed {i}/{total_files} files ({i/total_files*100:.1f}%)", flush=True)

    # Save Catalog
    settings.index_dir.mkdir(parents=True, exist_ok=True)

    catalog_data = {
        "version": 1,
        "source": str(settings.object_dir),
        "total_files": total_files,
        "total_classes": len(entity_case_map),
        "classes": sorted(list(entity_case_map.values()), key=str.casefold),
    }

    catalog_path = settings.object_catalog_path
    catalog_path.write_text(json.dumps(catalog_data, ensure_ascii=False, indent=2), encoding="utf-8")

    # Save Inverted Index
    index_payload = {
        "version": 1,
        "min_score": min_score,
        "total_detections": total_detections,
        "inverted_index": inverted_index
    }

    index_output_path = settings.index_dir / "object_inverted_index.json"
    index_output_path.write_text(json.dumps(index_payload, ensure_ascii=False), encoding="utf-8")

    print(f"Successfully built Object Catalog at: {catalog_path}", flush=True)
    print(f"Successfully built Inverted Object Index at: {index_output_path} ({len(entity_case_map)} classes, {total_detections} postings) in {time.time() - start_time:.2f}s", flush=True)

    return total_files, len(entity_case_map)


if __name__ == "__main__":
    build_object_index()
