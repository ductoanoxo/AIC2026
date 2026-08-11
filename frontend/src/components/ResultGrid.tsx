import type { QueryMode, SearchResult } from "../types/domain";
import { KeyframeCard } from "./KeyframeCard";

interface ResultGridProps {
  mode: QueryMode;
  results: SearchResult[];
  selectedVideoId?: string;
  selectedFrameId?: number;
  loading: boolean;
  hasSearched: boolean;
  onSelect: (result: SearchResult) => void;
  onInspect: (result: SearchResult) => void;
  onCopy: (result: SearchResult) => void;
  onUseVideo: (videoId: string) => void;
}

function ResultSkeleton() {
  return (
    <div className="result-skeleton" aria-hidden="true">
      <div className="skeleton-image" />
      <div className="skeleton-line short" />
      <div className="skeleton-line" />
    </div>
  );
}

export function ResultGrid({
  mode,
  results,
  selectedVideoId,
  selectedFrameId,
  loading,
  hasSearched,
  onSelect,
  onInspect,
  onCopy,
  onUseVideo,
}: ResultGridProps) {
  if (loading) {
    return (
      <div className="result-grid" aria-label="Loading search results" aria-busy="true">
        {Array.from({ length: 8 }, (_, index) => <ResultSkeleton key={index} />)}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-glyph" aria-hidden="true">⌁</span>
        <strong>{hasSearched ? "No keyframes returned" : "Ready for retrieval"}</strong>
        <p>{hasSearched ? "Try a more specific description or adjust the top K value." : "Run a query to populate the candidate keyframe grid."}</p>
      </div>
    );
  }

  return (
    <div className="result-grid" aria-label={`${results.length} search results`}>
      {results.map((result) => (
        <KeyframeCard
          key={`${result.videoId}-${result.frameId}-${result.rank}`}
          result={result}
          selected={selectedVideoId === result.videoId && selectedFrameId === result.frameId}
          trakeMode={mode === "trake"}
          onSelect={onSelect}
          onInspect={onInspect}
          onCopy={onCopy}
          onUseVideo={onUseVideo}
        />
      ))}
    </div>
  );
}
