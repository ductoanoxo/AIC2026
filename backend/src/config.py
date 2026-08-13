from __future__ import annotations

import os
import json
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parents[1]
# Shared secrets live in the repository-level .env. A backend-local .env can
# override non-secret/runtime settings when needed.
load_dotenv(BACKEND_DIR.parent / ".env")
load_dotenv(BACKEND_DIR / ".env", override=True)


def _resolve(value: str, base: Path) -> Path:
    path = Path(value)
    return path.resolve() if path.is_absolute() else (base / path).resolve()


def _secret_list(name: str) -> tuple[str, ...]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return ()
    if raw.startswith("["):
        try:
            values = json.loads(raw)
        except json.JSONDecodeError:
            return ()
        if isinstance(values, list):
            return tuple(str(value).strip() for value in values if str(value).strip())
    return tuple(value.strip() for value in raw.split(",") if value.strip())


@dataclass(frozen=True)
class Settings:
    dataset_dir: Path = _resolve(
        os.getenv("AIC_DATASET_DIR", "../Feature_Dataset"), BACKEND_DIR
    )
    source_video_dir: Path = _resolve(
        os.getenv("AIC_VIDEO_DIR", "../Dataset"), BACKEND_DIR
    )
    index_dir: Path = _resolve(os.getenv("AIC_INDEX_DIR", "./storage"), BACKEND_DIR)
    cache_dir: Path = _resolve(os.getenv("AIC_CACHE_DIR", "./storage"), BACKEND_DIR)
    batch_prefix: str = os.getenv("AIC_BATCH_PREFIX", "L30_")
    # OpenAI's original ViT-B/32 checkpoint uses QuickGELU. This OpenCLIP model
    # name reproduces that architecture and avoids silently mismatched queries.
    clip_model: str = os.getenv("AIC_CLIP_MODEL", "ViT-B-32-quickgelu")
    clip_pretrained: str = os.getenv("AIC_CLIP_PRETRAINED", "openai")
    gemini_api_keys: tuple[str, ...] = _secret_list("GEMINI_API_KEY")
    openrouter_api_keys: tuple[str, ...] = _secret_list("OPENROUTER_API_KEY")
    translation_model: str = os.getenv(
        "AIC_TRANSLATION_MODEL", "gemini-3.6-flash"
    )
    openrouter_translation_model: str = os.getenv(
        "AIC_OPENROUTER_MODEL", "deepseek/deepseek-v4-flash-0731"
    )
    object_inference_model: str = os.getenv(
        "AIC_OBJECT_MODEL", "deepseek/deepseek-v4-flash-0731"
    )
    openrouter_gemini_model: str = os.getenv(
        "AIC_OPENROUTER_GEMINI_MODEL", "google/gemini-3-flash-preview"
    )
    qa_model: str = os.getenv(
        "AIC_QA_MODEL", "google/gemini-3-flash-preview"
    )
    openrouter_url: str = os.getenv(
        "OPENROUTER_API_URL", "https://openrouter.ai/api/v1/chat/completions"
    )
    gemini_api_base_url: str = os.getenv(
        "GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"
    )
    cors_origins: tuple[str, ...] = tuple(
        item.strip()
        for item in os.getenv("AIC_CORS_ORIGINS", "http://localhost:5173").split(",")
        if item.strip()
    )

    @property
    def feature_dir(self) -> Path:
        return self.dataset_dir / "clip-features-32-aic25-b1" / "clip-features-32"

    @property
    def mapping_dir(self) -> Path:
        return self.dataset_dir / "map-keyframes-aic25-b1" / "map-keyframes"

    @property
    def media_info_dir(self) -> Path:
        return self.dataset_dir / "media-info-aic25-b1" / "media-info"

    @property
    def object_dir(self) -> Path:
        return self.dataset_dir / "objects-aic25-b1" / "objects"

    @property
    def video_dir(self) -> Path:
        return self.source_video_dir

    def find_video(self, video_id: str) -> Path | None:
        """Find a source video anywhere below the configured video root."""
        direct = self.video_dir / f"{video_id}.mp4"
        if direct.is_file():
            return direct
        matches = list(self.video_dir.rglob(f"{video_id}.mp4"))
        if len(matches) > 1:
            locations = ", ".join(str(path) for path in matches)
            raise RuntimeError(f"Duplicate source video {video_id}: {locations}")
        return matches[0] if matches else None

    @property
    def faiss_path(self) -> Path:
        return self.index_dir / "clip_l30.faiss"

    @property
    def index_metadata_path(self) -> Path:
        return self.index_dir / "clip_l30.metadata.json"

    @property
    def thumbnail_dir(self) -> Path:
        return self.cache_dir / "thumbnails"

    @property
    def object_catalog_path(self) -> Path:
        return self.index_dir / "object_classes.json"

    @property
    def gemini_api_key(self) -> str:
        """First key for compatibility; callers should prefer gemini_api_keys."""
        return self.gemini_api_keys[0] if self.gemini_api_keys else ""


settings = Settings()
