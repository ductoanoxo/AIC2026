from pathlib import Path
from types import SimpleNamespace

import pytest

from src import qa


def test_parse_response_preserves_unicode_and_clamps_confidence() -> None:
    response = SimpleNamespace(
        parsed={
            "answer": "  màu xanh  ",
            "evidence_frame_id": 120,
            "confidence": 1.4,
            "reasoning": "Ly trong tay người phụ nữ có màu xanh.",
        },
        text=None,
    )

    result = qa._parse_response(response, {90, 120, 150}, 120)

    assert result.answer == "màu xanh"
    assert result.evidence_frame_id == 120
    assert result.confidence == 1.0
    assert result.context_frame_ids == (90, 120, 150)


def test_parse_response_falls_back_when_model_invents_frame_id() -> None:
    response = SimpleNamespace(
        parsed={
            "answer": "5",
            "evidence_frame_id": 999,
            "confidence": 0.8,
            "reasoning": "Five people are visible.",
        },
        text=None,
    )

    result = qa._parse_response(response, {100, 130, 160}, 130)

    assert result.evidence_frame_id == 130


def test_parse_response_recovers_json_wrapped_in_explanation() -> None:
    response = SimpleNamespace(
        parsed=None,
        text='Result follows:\n```json\n{"answer":"Đỏ","evidence_frame_id":10,"confidence":0.7,"reasoning":"Áo màu đỏ"}\n```',
    )

    result = qa._parse_response(response, {10, 20}, 10)

    assert result.answer == "Đỏ"
    assert result.evidence_frame_id == 10


def test_answer_requires_an_openrouter_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(qa, "settings", SimpleNamespace(openrouter_api_keys=()))

    with pytest.raises(qa.QaError, match="OPENROUTER_API_KEY"):
        qa.answer_video_question(Path("video.mp4"), "event", "question", 100)


def test_openrouter_request_enforces_json_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        qa,
        "settings",
        SimpleNamespace(
            openrouter_api_keys=("test-key",),
            openrouter_url="https://example.test/chat/completions",
            qa_model="google/gemini-3-flash-preview",
        ),
    )
    monkeypatch.setattr(
        qa,
        "extract_context_frames",
        lambda *_args: ([qa.EncodedFrame(100, 4.0, b"jpeg")], 25.0),
    )
    captured = {}

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": '{"answer":"5","evidence_frame_id":100,"confidence":0.9,"reasoning":"Five people"}'}}]}

    def fake_post(*_args, **kwargs):
        captured.update(kwargs["json"])
        return FakeResponse()

    monkeypatch.setattr(qa.requests, "post", fake_post)

    result = qa.answer_video_question(Path("video.mp4"), "event", "count?", 100, 3)

    assert result.answer == "5"
    assert captured["response_format"]["type"] == "json_schema"
    assert captured["response_format"]["json_schema"]["strict"] is True
    assert captured["reasoning"] == {"effort": "low", "exclude": True}
