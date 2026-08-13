from __future__ import annotations

from types import SimpleNamespace

from src import object_inference


class FakeResponse:
    status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return {"choices": [{"message": {"content": '{"objects":["Person","Car","Invented"]}'}}]}


def test_inference_accepts_only_allowed_labels(monkeypatch):
    object_inference.infer_query_objects.cache_clear()
    monkeypatch.setattr(object_inference, "settings", SimpleNamespace(
        openrouter_api_keys=("key",),
        openrouter_url="https://example.test",
        object_inference_model="deepseek/test",
    ))
    monkeypatch.setattr(object_inference.requests, "post", lambda *args, **kwargs: FakeResponse())

    result = object_inference.infer_query_objects("a person beside a car", ("Car", "Person"))

    assert result == ("Person", "Car")


def test_inference_returns_empty_without_allowed_labels():
    object_inference.infer_query_objects.cache_clear()
    assert object_inference.infer_query_objects("an abstract celebration", ()) == ()
