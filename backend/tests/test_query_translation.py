from types import SimpleNamespace

from src import query_translation


class FakeModels:
    def generate_content(self, **_kwargs):
        return SimpleNamespace(
            parsed={"english_queries": ["a red car", "a car that is red", "a red automobile"]},
            text=None,
        )


class FakeClient:
    def __init__(self, **_kwargs):
        self.models = FakeModels()

    def close(self):
        pass


def test_translation_reads_structured_english_query(monkeypatch):
    query_translation.translate_queries_for_clip.cache_clear()
    monkeypatch.setattr(
        query_translation,
        "settings",
        SimpleNamespace(gemini_api_keys=("test-key",), translation_model="gemini-3.6-flash"),
    )
    monkeypatch.setattr(query_translation.genai, "Client", FakeClient)

    queries = query_translation.translate_queries_for_clip("một chiếc xe màu đỏ")
    assert queries[0] == "a red car"
    assert len(queries) == 6


def test_deep_translator_provider(monkeypatch):
    query_translation.translate_queries_for_clip.cache_clear()

    class FakeGoogleTranslator:
        def __init__(self, **_kwargs):
            pass

        def translate(self, _query):
            return "a woman riding a bicycle"

    monkeypatch.setattr(query_translation, "GoogleTranslator", FakeGoogleTranslator)
    assert (
        query_translation.translate_for_clip("một phụ nữ đi xe đạp", "deep-translator")
        == "a woman riding a bicycle"
    )


def test_openrouter_provider(monkeypatch):
    query_translation.translate_queries_for_clip.cache_clear()

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {
                "choices": [{"message": {"content": '{"english_queries":["a red car","a red automobile","a car that is red"]}'}}]
            }

    monkeypatch.setattr(
        query_translation,
        "settings",
        SimpleNamespace(
            openrouter_api_keys=("test-key",),
            openrouter_translation_model="deepseek/deepseek-v4-flash-0731",
            openrouter_gemini_model="google/gemini-3-flash-preview",
            openrouter_url="https://example.test/chat/completions",
        ),
    )
    monkeypatch.setattr(query_translation.requests, "post", lambda *_args, **_kwargs: FakeResponse())
    queries = query_translation.translate_queries_for_clip("một chiếc xe đỏ", "openrouter")
    assert queries[0] == "a red car"
    assert len(queries) == 6
