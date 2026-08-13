export type QueryMode = "kis" | "qa" | "trake";
export type TranslationProvider =
  | "gemini"
  | "deep-translator"
  | "openrouter"
  | "openrouter-gemini";

export interface VideoMetadata {
  title?: string;
  description?: string;
  duration?: number;
  fps?: number;
}

export interface ObjectDetection {
  label: string;
  score?: number;
  bbox?: number[];
}

export interface FrameSelection {
  frameId: number;
  timestamp?: number;
}

export interface SearchResult extends FrameSelection {
  rank: number;
  videoId: string;
  keyframeIndex?: number;
  score?: number;
  clipScore?: number;
  objectScore?: number;
  thumbnailUrl: string;
  videoUrl?: string;
  metadata?: VideoMetadata;
  objects?: ObjectDetection[];
}

export type NearbyFrame = SearchResult;

export interface SearchRequest {
  query: string;
  topK: number;
  videoId?: string | null;
  translator?: TranslationProvider;
  filters?: {
    objects?: string[];
  };
}

export interface SearchResponse {
  query: string;
  total: number;
  results: SearchResult[];
  inferredObjects?: string[];
  objectInferenceModel?: string;
}

export interface QaAnswerRequest {
  eventDescription: string;
  question: string;
  videoId: string;
  frameId: number;
  contextFrames?: 3 | 5 | 7 | 9;
}

export interface QaAnswerResponse {
  videoId: string;
  frameId: number;
  answer: string;
  confidence: number;
  reasoning?: string;
  contextFrameIds: number[];
  evidenceFrame: SearchResult;
}

export interface ApiStatus {
  status: "online" | "offline" | "unknown";
  version?: string;
  message?: string;
}

export type TrakeEventStatus = "idle" | "loading" | "ready" | "error";

export interface TrakeEvent {
  id: string;
  description: string;
  frames: SearchResult[];
  selectedFrame?: FrameSelection;
  status: TrakeEventStatus;
  error?: string;
}

export interface CandidateEntry {
  id: string;
  videoId: string;
  frameId: number;
  timestamp?: number;
  answer?: string;
}
