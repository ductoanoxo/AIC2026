from __future__ import annotations

import json
import sys
from functools import lru_cache

from google import genai
from google.genai import types
from deep_translator import GoogleTranslator
import requests

from .config import settings


class TranslationError(RuntimeError):
    """Raised when a query cannot be normalized to English."""


SYSTEM_PROMPT = """Bạn là bộ chuẩn hóa truy vấn cho hệ thống tìm kiếm video.
Nhận truy vấn bằng tiếng Việt hoặc tiếng Anh và trả về đúng 3 câu trong trường
english_queries. Mỗi câu phải là mô tả thị giác tiếng Anh ngắn, tự nhiên, tối
ưu cho CLIP text-to-image retrieval. Ba câu diễn đạt khác nhau nhưng phải giữ
nguyên người, vật thể, hành động, màu sắc, số lượng, bối cảnh và quan hệ không
gian. Không thêm chi tiết. Bỏ cụm điều khiển như 'hãy tìm video/cảnh'."""


def _with_clip_prompts(queries: list[str]) -> tuple[str, ...]:
    expanded: list[str] = []
    for query in queries:
        clean = query.strip()
        if clean and clean not in expanded:
            expanded.append(clean)
            expanded.append(f"a video frame showing {clean}")
    return tuple(expanded)


def _translate_with_openrouter(query: str, model: str) -> tuple[str, ...]:
    if not settings.openrouter_api_keys:
        raise TranslationError(
            "Chưa cấu hình OPENROUTER_API_KEY trong file .env ở thư mục gốc."
        )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    errors: list[int] = []
    last_problem = ""
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
                timeout=30,
            )
            errors.append(response.status_code)
            if response.status_code == 401:
                last_problem = "OpenRouter API key không hợp lệ."
                continue
            if response.status_code == 402:
                last_problem = "OpenRouter từ chối thanh toán hoặc không đủ credit cho request."
                continue
            if response.status_code == 429:
                last_problem = "OpenRouter đang giới hạn tốc độ request."
                continue
            if response.status_code == 404:
                last_problem = f"OpenRouter không tìm thấy model {model}."
                continue
            if response.status_code >= 500:
                last_problem = "Provider của OpenRouter đang tạm thời gặp lỗi."
                continue
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            queries = parsed.get("english_queries")
            if isinstance(queries, list) and all(isinstance(item, str) for item in queries):
                prompts = _with_clip_prompts(queries)
                if prompts:
                    return prompts
            last_problem = "OpenRouter trả về nội dung nhưng không đúng schema english_queries."
            continue
        except TranslationError:
            raise
        except requests.Timeout:
            last_problem = "OpenRouter phản hồi quá thời gian 30 giây."
            continue
        except requests.RequestException:
            last_problem = "Không thể kết nối tới OpenRouter."
            continue
        except (KeyError, IndexError, TypeError, json.JSONDecodeError):
            last_problem = "OpenRouter trả về response không hợp lệ hoặc JSON chưa hoàn chỉnh."
            continue
    if errors and all(status == 401 for status in errors):
        raise TranslationError("Tất cả OPENROUTER_API_KEY đều không hợp lệ.")
    raise TranslationError(last_problem or "OpenRouter không khả dụng.")


@lru_cache(maxsize=512)
def translate_queries_for_clip(query: str, provider: str = "gemini") -> tuple[str, ...]:
    query = query.strip()
    if not query:
        raise TranslationError("Truy vấn không được để trống.")
    if provider == "deep-translator":
        try:
            translated = GoogleTranslator(source="auto", target="en").translate(query)
        except Exception as error:
            raise TranslationError("Không thể dịch truy vấn bằng Google Translate.") from error
        if not isinstance(translated, str) or not translated.strip():
            raise TranslationError("Google Translate không tạo được truy vấn tiếng Anh.")
        return _with_clip_prompts([translated])
    if provider == "openrouter":
        return _translate_with_openrouter(query, settings.openrouter_translation_model)
    if provider == "openrouter-gemini":
        return _translate_with_openrouter(query, settings.openrouter_gemini_model)
    if provider != "gemini":
        raise TranslationError("Bộ dịch không được hỗ trợ.")
    if not settings.gemini_api_keys:
        raise TranslationError(
            "Chưa cấu hình GEMINI_API_KEY trong file .env ở thư mục gốc."
        )

    response = None
    errors: list[str] = []
    for api_key in settings.gemini_api_keys:
        client = None
        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=settings.translation_model,
                contents=query,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0,
                    # Gemini 3.x may spend part of this budget on internal
                    # reasoning before emitting the small JSON response.
                    max_output_tokens=512,
                    response_mime_type="application/json",
                    response_schema={
                        "type": "object",
                        "properties": {
                            "english_queries": {
                                "type": "array",
                                "items": {"type": "string"},
                                "minItems": 3,
                                "maxItems": 3,
                            }
                        },
                        "required": ["english_queries"],
                    },
                ),
            )
            break
        except Exception as error:
            message = str(error)
            errors.append(message)
            # Invalid, exhausted, or rate-limited keys are skipped automatically.
            if not any(
                marker in message
                for marker in ("API_KEY_INVALID", "API key not valid", "RESOURCE_EXHAUSTED", "429")
            ):
                raise TranslationError("Không thể dịch truy vấn bằng Gemini API.") from error
        finally:
            if client is not None:
                client.close()

    if response is None:
        if errors and all(
            "API_KEY_INVALID" in message or "API key not valid" in message
            for message in errors
        ):
            raise TranslationError("Tất cả GEMINI_API_KEY trong .env đều không hợp lệ.")
        raise TranslationError("Tất cả Gemini API key đều hết hạn mức hoặc không khả dụng.")

    parsed = response.parsed
    if not isinstance(parsed, dict) and isinstance(response.text, str):
        try:
            parsed = json.loads(response.text)
        except json.JSONDecodeError:
            parsed = None
    translated = parsed.get("english_queries") if isinstance(parsed, dict) else None
    if not isinstance(translated, list) or not all(isinstance(item, str) for item in translated):
        raise TranslationError("Gemini không tạo được các truy vấn tiếng Anh.")
    prompts = _with_clip_prompts(translated)
    if not prompts:
        raise TranslationError("Gemini không tạo được các truy vấn tiếng Anh.")
    return prompts


def translate_for_clip(query: str, provider: str = "gemini") -> str:
    """Backward-compatible helper returning the primary normalized query."""
    return translate_queries_for_clip(query, provider)[0]


def main() -> None:
    query = " ".join(sys.argv[1:]).strip()
    if not query:
        query = input("Nhập truy vấn cần dịch: ").strip()
    provider = "gemini"
    if "--deep-translator" in sys.argv:
        provider = "deep-translator"
        query = query.replace("--deep-translator", "").strip()
    for translated in translate_queries_for_clip(query, provider):
        print(translated)


if __name__ == "__main__":
    main()
