from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SearchFilters(BaseModel):
    objects: list[str] = Field(default_factory=list)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    topK: int = Field(default=50, ge=1, le=100)
    videoId: str | None = None
    translator: Literal[
        "gemini", "deep-translator", "openrouter", "openrouter-gemini"
    ] = "gemini"
    filters: SearchFilters = Field(default_factory=SearchFilters)


class QaAnswerRequest(BaseModel):
    eventDescription: str = Field(min_length=1, max_length=2000)
    question: str = Field(min_length=1, max_length=1000)
    videoId: str = Field(min_length=1, max_length=200)
    frameId: int = Field(ge=0)
    contextFrames: Literal[3, 5, 7, 9] = 5
