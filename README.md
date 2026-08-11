# AIC 2026 Video Retrieval Console

Frontend console cho hệ thống thi đấu **HCMC AI Challenge / AIC 2026 Video
Retrieval**.

Project tập trung vào thao tác nhanh:

- tìm kiếm keyframe bằng ngôn ngữ tự nhiên;
- xem nhiều candidate cùng lúc;
- inspect video và nearby frames;
- chọn đúng `videoId` + original `frameId`;
- tạo submission string cho KIS, Q&A và TRAKE.

Frontend chỉ giao tiếp với backend qua API. Browser không đọc dataset, `.npy`,
FAISS index, CLIP model, object-detection file hoặc thực hiện vector search.

> Backend hiện chưa được implement. Thư mục `backend/` chỉ chứa API contract và
> hướng dẫn tích hợp.

## 1. Kiến trúc project

```text
.
├── frontend/              React + TypeScript + Vite application
│   ├── src/
│   │   ├── components/    UI components cho search console
│   │   ├── lib/           Submission serialization và pure logic
│   │   ├── services/      API boundary tập trung
│   │   ├── styles/        Hallmark design tokens và UI styles
│   │   └── types/         Domain types
│   ├── .env.example
│   ├── package.json
│   └── README.md
├── backend/               Backend placeholder + API contract
├── .agents/               Project-local Codex skills
├── .codebase-memory/      Persistent codebase-memory MCP index
├── skills-lock.json
└── README.md
```

Frontend framework hiện tại:

- React 19
- TypeScript
- Vite
- Vitest + Testing Library
- CSS thuần với Hallmark Workbench/Cobalt visual system
- Không dùng router vì đây là một competition workspace duy nhất
- Không dùng global state library; state được tách rõ trong `App` và domain components

## 2. Chạy frontend

Yêu cầu: Node.js và npm.

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Mở URL Vite in ra, thường là:

```text
http://localhost:5173
```

### Cấu hình API URL

File `frontend/.env`:

```env
VITE_API_URL=/api
```

Nếu backend chạy ở origin khác:

```env
VITE_API_URL=http://localhost:8000/api
```

Không đặt API URL trực tiếp trong component. Mọi request đều đi qua
[`frontend/src/services/api.ts`](frontend/src/services/api.ts).

## 3. Các lệnh phát triển

Chạy từ thư mục `frontend/`:

```bash
npm run dev       # development server
npm test          # chạy toàn bộ test một lần
npm run test:watch
npm run lint      # TypeScript check
npm run build     # production build
```

Nếu clone project mới:

```bash
cd frontend
npm install
npm test
npm run lint
npm run build
```

## 4. Các query mode

### KIS — Known Item Search

1. Nhập mô tả event hoặc known item.
2. Chọn `Top K`.
3. Search qua backend.
4. Chọn result hoặc nearby frame.
5. Tạo submission:

```text
<videoId>,<frameId>
```

Có thể lưu tối đa 100 candidate tạm thời.

### Q&A — Video Question Answering

1. Search như KIS.
2. Chọn frame.
3. Nhập câu trả lời bằng Vietnamese hoặc English.
4. Tạo submission:

```text
<videoId>,<frameId>,<answer>
```

Answer luôn do user chỉnh sửa thủ công; frontend không tự thực hiện VQA.

### TRAKE — Temporal Retrieval and Alignment of Key Events

1. Nhập overall video description.
2. Search và chọn target video.
3. Thêm số semantic events tùy ý.
4. Search từng event trong target video.
5. Chọn một frame cho mỗi event.
6. Kiểm tra timeline và copy submission:

```text
<videoId>,<frameId1>,<frameId2>,...,<frameIdN>
```

Frontend giữ nguyên thứ tự user chọn. Nếu thứ tự frame có vẻ không chronological,
UI chỉ cảnh báo và không tự động sort.

## 5. Keyboard shortcuts

- `Ctrl/Cmd + Enter`: chạy search.
- `ArrowLeft`: chuyển về nearby frame trước.
- `ArrowRight`: chuyển tới nearby frame sau.

Arrow shortcuts không chạy khi focus đang ở input, textarea, select hoặc editable
element.

## 6. API contract

Base URL được lấy từ `VITE_API_URL`.

### `POST /search`

Request:

```json
{
  "query": "natural language query",
  "topK": 50,
  "videoId": null,
  "filters": {
    "objects": []
  }
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
      "videoId": "backend-provided-video-id",
      "frameId": 12345,
      "keyframeIndex": 123,
      "timestamp": 411.5,
      "score": 0.87,
      "clipScore": 0.87,
      "objectScore": 0,
      "thumbnailUrl": "https://backend/frame.jpg",
      "videoUrl": "https://backend/video.mp4",
      "metadata": {
        "title": "optional",
        "description": "optional",
        "duration": 600,
        "fps": 25
      },
      "objects": [
        {
          "label": "person",
          "score": 0.91,
          "bbox": [0, 0, 100, 100]
        }
      ]
    }
  ]
}
```

`frameId`, `keyframeIndex`, và `timestamp` là các field khác nhau. Submission
phải dùng **original `frameId`**, không dùng `keyframeIndex`.

### `GET /videos/:videoId/nearby-frames`

Query parameters:

```text
frameId=<original-frame-id>&count=<neighbor-count>
```

Backend có thể trả về một array hoặc:

```json
{
  "frames": []
}
```

Frame object dùng cùng field shape với search result.

### `GET /status`

```json
{
  "status": "online",
  "version": "backend-version",
  "message": "optional"
}
```

Frontend vẫn chạy khi status API unavailable, nhưng hiển thị trạng thái API
offline/unknown.

## 7. Backend

Backend cần được viết trong [`backend/`](backend/). Backend chịu trách nhiệm:

- dataset parsing;
- CLIP hoặc embedding inference;
- vector search và FAISS indexing;
- object detection parsing;
- tìm video/keyframe;
- cung cấp thumbnail, video URL, metadata và nearby frames.

Frontend không được chuyển các trách nhiệm này vào browser.

Đọc [`backend/README.md`](backend/README.md) trước khi implement backend.
Backend khác origin cần bật CORS cho Vite dev origin.

## 8. Testing

Test hiện tại cover:

- KIS submission serialization;
- Q&A serialization với Unicode;
- TRAKE dynamic event count;
- chronological warning;
- giới hạn 100 candidates;
- API network/HTTP error;
- request cancellation;
- selected result trong result grid.

Kết quả xác nhận hiện tại:

```text
3 test files passed
10 tests passed
npm run lint passed
npm run build passed
```

## 9. Design direction

UI được thiết kế theo hướng Hallmark Workbench/Cobalt:

- technical search-console appearance;
- dense keyframe matrix;
- compact metadata và monospace identifiers;
- dark graphite command header;
- cobalt signal accent;
- minimal animation;
- focus-visible states và reduced-motion support;
- responsive ở laptop và màn hình hẹp;
- không có marketing hero, decorative dashboard hoặc invented metrics.

## 10. Giới hạn hiện tại

- Chưa có backend implementation.
- Chưa có authentication/authorization.
- Chưa có upload dataset hoặc quản lý competition batch.
- Chưa có automatic VQA.
- Object filter hiện nhận label do user nhập; chưa có endpoint label catalog.
- Không có browser-level E2E test; hiện có unit/component tests và Vite smoke test.

## 11. Codebase MCP

Project có persistent codebase-memory MCP index tại:

```text
.codebase-memory/graph.db.zst
```

Sau các thay đổi lớn, re-index repository để graph được cập nhật. Không commit
dataset, video, secrets hoặc generated media vào repository.
# AIC2026
