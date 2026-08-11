# Backend placeholder

This directory is reserved for the AIC 2026 retrieval backend. No backend
implementation is included yet.

The frontend must remain API-only. Backend responsibilities include dataset
parsing, embedding/inference, vector search, FAISS indexing, object detection
parsing, and serving video/keyframe metadata.

## Required API contract

### `POST /api/search`

Request:

```json
{
  "query": "natural language query",
  "topK": 50,
  "videoId": null,
  "filters": { "objects": [] }
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

## Local backend checklist

Choose the backend framework and dependency manager, then add its own README,
environment file, tests, and run command here. Enable CORS for the Vite origin if
the frontend and backend use different origins.
