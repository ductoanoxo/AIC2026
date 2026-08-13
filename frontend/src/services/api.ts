import type {
  ApiStatus,
  ObjectDetection,
  QaAnswerRequest,
  QaAnswerResponse,
  SearchRequest,
  SearchResponse,
  SearchResult,
  VideoMetadata,
} from "../types/domain";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readMetadata(value: unknown): VideoMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const metadata: VideoMetadata = {};
  const title = readString(value.title);
  const description = readString(value.description);
  const duration = readNumber(value.duration);
  const fps = readNumber(value.fps);
  if (title) metadata.title = title;
  if (description) metadata.description = description;
  if (duration !== undefined) metadata.duration = duration;
  if (fps !== undefined) metadata.fps = fps;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function readObjects(value: unknown): ObjectDetection[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const objects = value.flatMap((item): ObjectDetection[] => {
    if (!isRecord(item)) {
      return [];
    }
    const label = readString(item.label);
    if (!label) {
      return [];
    }
    const object: ObjectDetection = { label };
    const score = readNumber(item.score);
    const bbox = Array.isArray(item.bbox)
      ? item.bbox.filter((entry): entry is number => typeof entry === "number")
      : undefined;
    if (score !== undefined) object.score = score;
    if (bbox && bbox.length > 0) object.bbox = bbox;
    return [object];
  });

  return objects.length > 0 ? objects : undefined;
}

function normalizeResult(value: unknown, index: number): SearchResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const videoId = readString(value.videoId);
  const frameId = readNumber(value.frameId);
  if (!videoId || frameId === undefined) {
    return null;
  }

  const result: SearchResult = {
    rank: readNumber(value.rank) ?? index + 1,
    videoId,
    frameId,
    thumbnailUrl: readString(value.thumbnailUrl) ?? "",
  };

  const keyframeIndex = readNumber(value.keyframeIndex);
  const timestamp = readNumber(value.timestamp);
  const score = readNumber(value.score);
  const clipScore = readNumber(value.clipScore);
  const objectScore = readNumber(value.objectScore);
  const videoUrl = readString(value.videoUrl);
  const metadata = readMetadata(value.metadata);
  const objects = readObjects(value.objects);
  if (keyframeIndex !== undefined) result.keyframeIndex = keyframeIndex;
  if (timestamp !== undefined) result.timestamp = timestamp;
  if (score !== undefined) result.score = score;
  if (clipScore !== undefined) result.clipScore = clipScore;
  if (objectScore !== undefined) result.objectScore = objectScore;
  if (videoUrl) result.videoUrl = videoUrl;
  if (metadata) result.metadata = metadata;
  if (objects) result.objects = objects;
  return result;
}

function normalizeResponse(value: unknown, fallbackQuery: string): SearchResponse {
  const payload = isRecord(value) ? value : {};
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  const results = rawResults.flatMap((item, index) => {
    const normalized = normalizeResult(item, index);
    return normalized ? [normalized] : [];
  });
  const response: SearchResponse = {
    query: readString(payload.query) ?? fallbackQuery,
    total: readNumber(payload.total) ?? results.length,
    results,
  };
  const inferredObjects = Array.isArray(payload.inferredObjects)
    ? payload.inferredObjects.filter((item): item is string => typeof item === "string")
    : [];
  if (inferredObjects.length > 0) response.inferredObjects = inferredObjects;
  const objectInferenceModel = readString(payload.objectInferenceModel);
  if (objectInferenceModel) response.objectInferenceModel = objectInferenceModel;
  return response;
}

function normalizeQaResponse(value: unknown): QaAnswerResponse {
  if (!isRecord(value)) {
    throw new ApiError("The Q&A API returned an invalid response.", 502);
  }
  const videoId = readString(value.videoId);
  const frameId = readNumber(value.frameId);
  const answer = readString(value.answer);
  const evidenceFrame = normalizeResult(value.evidenceFrame, 0);
  if (!videoId || frameId === undefined || !answer || !evidenceFrame) {
    throw new ApiError("The Q&A API returned an incomplete response.", 502);
  }
  const contextFrameIds = Array.isArray(value.contextFrameIds)
    ? value.contextFrameIds.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
  return {
    videoId,
    frameId,
    answer,
    confidence: readNumber(value.confidence) ?? 0,
    reasoning: readString(value.reasoning),
    contextFrameIds,
    evidenceFrame,
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError("API unavailable. Check the backend connection.", 0);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const body: unknown = await response.json();
      if (isRecord(body) && typeof body.message === "string") {
        message = body.message;
      } else if (isRecord(body) && typeof body.detail === "string") {
        message = body.detail;
      }
    } catch {
      // Keep the HTTP status message when the backend has no JSON error body.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  async search(requestBody: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    const raw = await request<unknown>("/search", {
      method: "POST",
      signal,
      body: JSON.stringify(requestBody),
    });
    return normalizeResponse(raw, requestBody.query);
  },

  async answerQuestion(requestBody: QaAnswerRequest, signal?: AbortSignal): Promise<QaAnswerResponse> {
    const raw = await request<unknown>("/qa/answer", {
      method: "POST",
      signal,
      body: JSON.stringify(requestBody),
    });
    return normalizeQaResponse(raw);
  },

  async getNearbyFrames(
    videoId: string,
    frameId: number,
    count: number,
    signal?: AbortSignal,
  ): Promise<SearchResult[]> {
    const params = new URLSearchParams({ frameId: String(frameId), count: String(count) });
    const raw = await request<unknown>(
      `/videos/${encodeURIComponent(videoId)}/nearby-frames?${params.toString()}`,
      { signal },
    );
    const payload = isRecord(raw) && Array.isArray(raw.frames) ? raw.frames : raw;
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload.flatMap((item, index) => {
      const normalized = normalizeResult(item, index);
      return normalized ? [normalized] : [];
    });
  },

  async getStatus(signal?: AbortSignal): Promise<ApiStatus> {
    const raw = await request<unknown>("/status", { signal });
    if (!isRecord(raw)) {
      return { status: "unknown" };
    }
    const rawStatus = readString(raw.status);
    const status: ApiStatus["status"] = rawStatus === "online" ? "online" : "unknown";
    return {
      status,
      version: readString(raw.version),
      message: readString(raw.message),
    };
  },
};

export function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError");
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong while contacting the API.";
}
