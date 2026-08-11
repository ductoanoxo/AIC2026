# AIC 2026 Task 1 + Task 2 backend (Textual KIS and Q&A)

FastAPI backend using the provided CLIP ViT-B/32 features and a persistent
FAISS cosine-similarity index. The first implementation indexes the 96 videos
in batch L30 because those are the videos available locally.

## Setup (PowerShell)

```powershell
cd backend
pip install -r requirements.txt
Copy-Item .env.example .env
```

Build the vector index once:

```powershell
python -m src.build_index
```

Start the API:

```powershell
uvicorn src.main:app --reload --port 8000
```

The first search downloads and loads the OpenAI CLIP ViT-B/32 checkpoint. For
each search, Gemini 3.6 Flash normalizes Vietnamese or English input into an
English visual-search sentence before the CLIP text encoder embeds it. API
documentation is available at
`http://localhost:8000/docs`.

Task 2 reuses this retrieval pipeline. After the user selects a candidate,
`POST /api/qa/answer` extracts 3–9 frames around it and sends those frames to
Gemini 3 Flash through OpenRouter. The model returns a concise answer and the strongest evidence
frame. The frontend keeps the answer editable before creating the competition
submission.

For direct Gemini query translation, the backend reads `GEMINI_API_KEY` from
the repository-level `.env` and uses Google's official `google-genai` SDK. For
Task 2 image Q&A it reads `OPENROUTER_API_KEY` and calls Gemini 3 Flash through
OpenRouter. Both variables accept one key, a comma-separated list, or a JSON
array, with automatic failover for invalid or rate-limited keys. Keep all keys
out of source control.

Each search request can select `translator: "gemini"` for LLM normalization or
`translator: "deep-translator"` for Google Translate through the
`deep-translator` library, or `translator: "openrouter"` for DeepSeek V4 Flash
through OpenRouter. `translator: "openrouter-gemini"` uses Gemini 3 Flash
Preview through the same OpenRouter key. Direct Gemini is the default.

Set the frontend configuration to:

```env
VITE_API_URL=http://localhost:8000/api
```

Generated FAISS indexes and thumbnail cache are stored in `backend/storage/`
and are intentionally not committed.

The vision model can be configured independently:

```env
AIC_QA_MODEL=google/gemini-3-flash-preview
```

## API contract

### `POST /api/search`

Request:

```json
{
  "query": "natural language query",
  "topK": 50,
  "videoId": null
}
```

Response:

```json
{
  "query": "natural language query",
  "total": 0,
  "results": [
    {
      "rank": 1,
      "videoId": "backend value",
      "frameId": 0,
      "keyframeIndex": 0,
      "timestamp": 0,
      "score": 0,
      "clipScore": 0,
      "objectScore": 0,
      "thumbnailUrl": "https://backend/frame.jpg",
      "videoUrl": "https://backend/video.mp4",
      "metadata": {},
      "objects": []
    }
  ]
}
```

`frameId` is the original competition frame identifier. Do not replace it with
`keyframeIndex`.

### `GET /api/videos/:videoId/nearby-frames`

Query parameters:

```text
frameId=<original frame id>&count=<neighbor count>
```

Return either an array of frame objects or `{ "frames": [...] }` using the same
frame fields as search results.

### `GET /api/status`

Example response:

```json
{ "status": "online", "version": "backend version" }
```

### `POST /api/qa/answer`

Request:

```json
{
  "eventDescription": "A music award ceremony",
  "question": "How many people receive the main award?",
  "videoId": "L30_V001",
  "frameId": 3450,
  "contextFrames": 5
}
```

Response includes `answer`, `confidence`, `reasoning`, `contextFrameIds`, and a
normalized `evidenceFrame`. Use the returned `frameId`—not a keyframe index—in
the final `<video_id>,<frame_id>,<answer>` submission.

## Local backend checklist

Choose the backend framework and dependency manager, then add its own README,
environment file, tests, and run command here. Enable CORS for the Vite origin if
the frontend and backend use different origins.
