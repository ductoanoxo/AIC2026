# Deployment Architecture

## Mục tiêu

Hệ thống được triển khai theo mô hình một VPS CPU kết nối tới một GPU RTX 4090 chạy trên RunPod Serverless.

```text
Người dùng
    |
    v
Frontend + Backend API trên VPS
    |  HTTPS + RUNPOD_API_KEY
    v
RunPod Serverless - 1 endpoint / 1 RTX 4090 / 1 handler
    |-- task=retrieve: OpenCLIP + FAISS GPU
    `-- task=qa: VLM Q&A
```

## Phân chia trách nhiệm

### VPS CPU

VPS chạy các container `frontend` và `backend` trong [docker-compose.yml](docker-compose.yml).

Backend chịu trách nhiệm:

- Public API, authentication, CORS và rate limiting.
- Gọi RunPod Serverless qua HTTPS.
- Nhận kết quả retrieval từ GPU worker và trả về frontend.
- Đọc metadata, caption, OCR, transcript và object annotations.
- Đọc video bằng OpenCV và trích xuất context frames cho Q&A.
- Tạo thumbnail và phục vụ video/frame.
- RRF/fusion, filtering và temporal logic/TRAKE.

VPS không chạy training hoặc embedding toàn bộ dataset.

### RunPod Serverless GPU

Chỉ sử dụng một endpoint GPU với một handler. Handler định tuyến theo field `task`:

```text
task=retrieve
  - Encode text query bằng OpenCLIP.
  - Search FAISS GPU.
  - Trả top-k video/frame results.

task=qa
  - Nhận question và context frames từ backend.
  - Chạy VLM trên GPU.
  - Trả answer, confidence và evidence_frame_id.
```

FAISS index được tạo offline, lưu dưới dạng CPU index và được load/chuyển lên GPU khi worker khởi động. GPU index không được ghi trực tiếp ra file; khi cần lưu phải chuyển về CPU index trước.

## Request flow

### Retrieval

```text
Frontend POST /api/search
  -> VPS Backend dịch/chuẩn hóa query
  -> RunPod task=retrieve
  -> OpenCLIP encode query trên GPU
  -> FAISS GPU search
  -> RunPod trả vector search results
  -> VPS đọc metadata/object và xử lý fusion/filter
  -> Frontend nhận top-k results
```

Payload tối thiểu tới RunPod:

```json
{
  "input": {
    "task": "retrieve",
    "queries": ["a video frame showing a person beside a car"],
    "top_k": 100,
    "video_id": null
  }
}
```

### Q&A

```text
Frontend POST /api/qa/answer
  -> VPS tìm video và trích xuất context frames
  -> RunPod task=qa
  -> VLM xử lý question + frames trên GPU
  -> RunPod trả answer/evidence
  -> VPS bổ sung thumbnail, video URL và metadata
  -> Frontend nhận kết quả
```

Không gửi API key hoặc request trực tiếp từ frontend tới RunPod. `RUNPOD_API_KEY` chỉ tồn tại trong environment của backend VPS.

## RunPod endpoint

Endpoint nên bắt đầu với:

```text
GPU: RTX 4090 24GB
workersMin: 1
workersMax: 1
```

`workersMin=1` giữ một worker warm để giảm cold start nhưng vẫn bị tính phí khi worker idle. Tăng `workersMax` chỉ khi đã đo được concurrency và chấp nhận chi phí GPU bổ sung.

Một endpoint dùng chung cho `retrieve` và `qa` giúp hai task dùng cùng một GPU. Nếu tạo hai Serverless endpoint độc lập, mỗi endpoint có scaling và GPU allocation riêng; không giả định hai endpoint sẽ chia sẻ an toàn cùng một RTX 4090.

Nếu dùng RunPod Flash/load-balanced endpoint, có thể expose nhiều route như `/retrieve` và `/qa` trên cùng endpoint. Với queue-based worker, dùng một handler và định tuyến bằng `input.task` như thiết kế trên.

## Environment variables trên VPS

Đặt các biến sau trong `.env` hoặc secret manager của VPS; không đưa chúng vào Dockerfile, Git hoặc frontend:

```env
RUNPOD_API_KEY=<restricted-runpod-key>
RUNPOD_ENDPOINT_ID=<serverless-endpoint-id>
```

Các biến dataset/index hiện tại:

```env
AIC_DATASET_HOST_PATH=/path/to/Feature_Dataset
AIC_VIDEO_HOST_PATH=/path/to/Dataset
AIC_INDEX_HOST_PATH=/path/to/artifacts/faiss
```

FAISS artifact được tạo offline và mount vào backend. Không build FAISS index trong Docker image hoặc khi container khởi động.

## Storage

```text
Feature_Dataset/     -> mount read-only vào VPS
Dataset/             -> mount read-only nếu cần video playback/Q&A
artifacts/faiss/     -> mount vào backend để đọc FAISS + metadata
thumbnail cache      -> thư mục writable riêng của backend
```

Video lớn nên được đặt trong object storage/CDN khi triển khai public. Không nên dùng backend API làm nơi stream toàn bộ video cho nhiều người dùng nếu có thể dùng URL/object storage có kiểm soát.

## Security

- Chỉ frontend gọi public VPS API.
- Backend gọi RunPod bằng restricted API key.
- Không expose RunPod API key cho browser.
- Xác thực request ở VPS trước khi gọi GPU worker.
- Giới hạn kích thước và số lượng frame gửi tới Q&A.
- Rate-limit `/api/search` và `/api/qa/answer`.
- Dùng HTTPS cho domain public và RunPod request.
- Pin version Docker image của GPU worker, không dùng tag thay đổi tùy ý cho production.

## Operational notes

- `retrieve` và `qa` dùng chung GPU nên cần kiểm tra VRAM khi load đồng thời OpenCLIP, FAISS GPU và VLM.
- Nếu VLM gây OOM, chỉ load model theo task hoặc tách Q&A sang endpoint/GPU riêng.
- Nếu cold start làm latency quá cao, giữ `workersMin=1` và bật model caching/FlashBoot phù hợp.
- Với request vượt thời gian interactive, dùng RunPod `/run` và poll `/status/{job_id}` thay vì chờ `/runsync`.
- Theo dõi GPU memory, queue time, execution time, error rate và chi phí theo endpoint.

## Tài liệu tham khảo

- [RunPod Serverless endpoint configuration](https://docs.runpod.io/serverless/endpoints/endpoint-configurations)
- [RunPod Serverless API requests](https://docs.runpod.io/serverless/endpoints/send-requests)
- [RunPod Flash multiple routes](https://docs.runpod.io/flash/apps/customize-app)
- [FAISS on the GPU](https://github.com/facebookresearch/faiss/wiki/Faiss-on-the-GPU)
