from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .config import settings


def _labels(path: Path) -> set[str]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return set()
    values = payload.get("detection_class_entities", [])
    return {value.strip() for value in values if isinstance(value, str) and value.strip()}


def build_object_catalog() -> tuple[int, int]:
    paths = list(settings.object_dir.glob("*/*.json"))
    classes: set[str] = set()
    with ThreadPoolExecutor(max_workers=16) as executor:
        for labels in executor.map(_labels, paths, chunksize=64):
            classes.update(labels)
    settings.index_dir.mkdir(parents=True, exist_ok=True)
    settings.object_catalog_path.write_text(json.dumps({
        "version": 1,
        "source": str(settings.object_dir),
        "files": len(paths),
        "classes": sorted(classes, key=str.casefold),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(paths), len(classes)


if __name__ == "__main__":
    files, classes = build_object_catalog()
    print(f"Built {settings.object_catalog_path} with {classes} classes from {files} JSON files")
