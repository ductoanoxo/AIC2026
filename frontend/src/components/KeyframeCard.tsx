import { useState } from "react";
import type { SearchResult } from "../types/domain";

interface KeyframeCardProps {
  result: SearchResult;
  selected: boolean;
  trakeMode?: boolean;
  onSelect: (result: SearchResult) => void;
  onInspect: (result: SearchResult) => void;
  onCopy: (result: SearchResult) => void;
  onUseVideo?: (videoId: string) => void;
}

function formatTime(timestamp?: number): string {
  if (timestamp === undefined) return "—";
  const minutes = Math.floor(timestamp / 60);
  const seconds = timestamp % 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function formatScore(score?: number): string {
  return score === undefined ? "—" : score.toFixed(3);
}

export function KeyframeCard({
  result,
  selected,
  trakeMode = false,
  onSelect,
  onInspect,
  onCopy,
  onUseVideo,
}: KeyframeCardProps) {
  const [imageBroken, setImageBroken] = useState(false);

  return (
    <article className={`keyframe-card ${selected ? "is-selected" : ""}`}>
      <button className="keyframe-hit-area" type="button" onClick={() => onSelect(result)} aria-label={`Select frame ${result.frameId}`}>
        <div className="keyframe-head">
          <span className="rank-label">#{String(result.rank).padStart(2, "0")}</span>
          <span className="score-label">{formatScore(result.score)}</span>
        </div>
        <div className="thumbnail-frame">
          {result.thumbnailUrl && !imageBroken ? (
            <img src={result.thumbnailUrl} alt={`Video ${result.videoId}, frame ${result.frameId}`} loading="lazy" onError={() => setImageBroken(true)} />
          ) : (
            <div className="thumbnail-fallback" role="img" aria-label="Thumbnail unavailable">
              <span>FRAME UNAVAILABLE</span>
              <strong>{result.frameId}</strong>
            </div>
          )}
          {selected ? <span className="selected-chip">Selected</span> : null}
        </div>
        <div className="keyframe-meta">
          <strong title={result.videoId}>{result.videoId}</strong>
          <span>Frame {result.frameId}</span>
          <span>{formatTime(result.timestamp)}</span>
        </div>
      </button>
      <div className="keyframe-actions">
        <button type="button" onClick={() => onInspect(result)}>Inspect</button>
        <button type="button" onClick={() => onCopy(result)}>Copy</button>
        {trakeMode && onUseVideo ? <button type="button" onClick={() => onUseVideo(result.videoId)}>Use video</button> : null}
      </div>
    </article>
  );
}

export function formatFrameTime(timestamp?: number): string {
  if (timestamp === undefined) return "—";
  const minutes = Math.floor(timestamp / 60);
  const seconds = timestamp % 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}
