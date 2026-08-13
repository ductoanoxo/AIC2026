from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from src import objects as object_data


def test_read_objects_deduplicates_and_ranks(tmp_path, monkeypatch):
    object_data.read_objects.cache_clear()
    monkeypatch.setattr(object_data, "settings", SimpleNamespace(object_dir=tmp_path))
    folder = tmp_path / "L30_V001"
    folder.mkdir()
    (folder / "001.json").write_text(json.dumps({
        "detection_class_entities": ["Person", "Car", "Person", "Noise"],
        "detection_scores": ["0.70", "0.60", "0.90", "0.01"],
        "detection_boxes": [[0, 0, 1, 1]] * 4,
    }), encoding="utf-8")

    detections = object_data.read_objects("L30_V001", 1)

    assert [item["label"] for item in detections] == ["Person", "Car"]
    assert detections[0]["score"] == 0.9


def test_object_match_requires_every_filter():
    detections = ({"label": "Person", "score": 0.9}, {"label": "Sports car", "score": 0.8})
    assert object_data.object_match_score(detections, ["person", "car"]) == pytest.approx(0.85)
    assert object_data.object_match_score(detections, ["person", "boat"]) == 0.0


def test_object_catalog_uses_only_generated_classes(tmp_path, monkeypatch):
    object_data.read_object_catalog.cache_clear()
    catalog = tmp_path / "object_classes.json"
    catalog.write_text(json.dumps({"classes": ["Person", "Car", "Person", 123]}), encoding="utf-8")
    monkeypatch.setattr(object_data, "settings", SimpleNamespace(object_catalog_path=catalog))

    assert object_data.read_object_catalog() == ("Car", "Person")
