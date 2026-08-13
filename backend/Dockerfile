# syntax=docker/dockerfile:1.7

FROM python:3.11-slim-bookworm AS builder

ENV VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

RUN --mount=type=cache,target=/root/.cache/pip \
    python -m venv "$VIRTUAL_ENV" \
    && pip install --upgrade pip setuptools wheel

# Keep dependency installation above the source copy so source-only changes
# reuse this expensive layer during rebuilds.
COPY backend/requirements.txt ./requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-deps --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip install --prefer-binary --no-compile -r requirements.txt

FROM python:3.11-slim-bookworm AS runtime

ENV VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Runtime libraries needed by the CPU PyTorch/FAISS/OpenCV wheels. The CPU
# CLIP runtime is used only to encode live user queries; dataset embeddings and
# the FAISS index are generated offline and are mounted at runtime.
RUN apt-get update \
    && apt-get install --no-install-recommends -y libgomp1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --create-home --home-dir /home/app app

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app backend/src ./src
RUN mkdir -p /home/app/.cache \
    && chown -R app:app /home/app/.cache

USER app
EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
