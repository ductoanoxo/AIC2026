import { useEffect, useRef, useState } from "react";
import type { NearbyFrame, SearchResult } from "../types/domain";
import { formatFrameTime } from "./KeyframeCard";

interface VideoInspectorProps {
  result?: SearchResult;
  activeFrame?: NearbyFrame;
  nearbyFrames: NearbyFrame[];
  nearbyLoading: boolean;
  nearbyError?: string;
  onSelectNearby: (frame: NearbyFrame) => void;
  onRetryNearby: () => void;
}

function formatScore(score?: number): string {
  return score === undefined ? "—" : score.toFixed(3);
}

export function VideoInspector({
  result,
  activeFrame,
  nearbyFrames,
  nearbyLoading,
  nearbyError,
  onSelectNearby,
  onRetryNearby,
}: VideoInspectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    setVideoError(false);
    const video = videoRef.current;
    if (!video || activeFrame?.timestamp === undefined) return;
    const seek = () => {
      video.currentTime = activeFrame.timestamp ?? 0;
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
    return () => video.removeEventListener("loadedmetadata", seek);
  }, [activeFrame?.frameId, activeFrame?.timestamp, result?.videoUrl]);

  if (!result || !activeFrame) {
    return (
      <div className="inspector-empty">
        <span className="empty-glyph" aria-hidden="true">◌</span>
        <strong>Select a keyframe</strong>
        <p>Inspect a result to load its video context and nearby frames.</p>
      </div>
    );
  }

  return (
    <div className="inspector-content">
      <div className="inspector-video-wrap">
        {result.videoUrl && !videoError ? (
          <video
            ref={videoRef}
            controls
            preload="metadata"
            src={result.videoUrl}
            onError={() => setVideoError(true)}
            aria-label={`Video ${result.videoId}`}
          />
        ) : (
          <div className="video-fallback">
            <span>{videoError ? "VIDEO UNAVAILABLE" : "VIDEO URL NOT PROVIDED"}</span>
            <strong>{result.videoId}</strong>
          </div>
        )}
        <span className="inspector-timecode">{formatFrameTime(activeFrame.timestamp)}</span>
      </div>

      <div className="inspector-heading">
        <div>
          <span className="eyebrow">Selected frame</span>
          <h2>{result.videoId}</h2>
        </div>
        <span className="inspector-score">{formatScore(activeFrame.score ?? result.score)}</span>
      </div>

      <dl className="metadata-grid">
        <div><dt>video_id</dt><dd>{result.videoId}</dd></div>
        <div><dt>frame_id</dt><dd>{activeFrame.frameId}</dd></div>
        <div><dt>timestamp</dt><dd>{formatFrameTime(activeFrame.timestamp)}</dd></div>
        <div><dt>keyframe_index</dt><dd>{result.keyframeIndex ?? "—"}</dd></div>
      </dl>

      <section className="nearby-section" aria-labelledby="nearby-heading">
        <div className="subsection-heading">
          <h3 id="nearby-heading">Nearby frames</h3>
          <span>backend context</span>
        </div>
        {nearbyLoading ? <div className="nearby-loading">Loading frame neighborhood…</div> : null}
        {nearbyError ? (
          <div className="inline-error" role="alert">
            <span>{nearbyError}</span>
            <button type="button" onClick={onRetryNearby}>Retry</button>
          </div>
        ) : null}
        {!nearbyLoading && !nearbyError ? (
          <div className="nearby-strip">
            {nearbyFrames.length > 0 ? nearbyFrames.map((frame) => (
              <button
                className={`nearby-frame ${frame.frameId === activeFrame.frameId ? "is-selected" : ""}`}
                key={`${frame.videoId}-${frame.frameId}`}
                type="button"
                onClick={() => onSelectNearby(frame)}
              >
                {frame.thumbnailUrl ? <img src={frame.thumbnailUrl} alt={`Nearby frame ${frame.frameId}`} loading="lazy" /> : <span className="nearby-fallback">—</span>}
                <span>{frame.frameId}</span>
                <small>{formatFrameTime(frame.timestamp)}</small>
              </button>
            )) : <span className="muted-copy">No nearby frames returned.</span>}
          </div>
        ) : null}
      </section>

      {result.metadata ? (
        <section className="detail-section">
          <div className="subsection-heading"><h3>Metadata</h3></div>
          <p>{result.metadata.title ?? result.metadata.description ?? "No descriptive metadata provided."}</p>
          <div className="detail-inline">
            {result.metadata.duration !== undefined ? <span>duration {result.metadata.duration.toFixed(1)}s</span> : null}
            {result.metadata.fps !== undefined ? <span>fps {result.metadata.fps}</span> : null}
          </div>
        </section>
      ) : null}

      {result.objects && result.objects.length > 0 ? (
        <section className="detail-section">
          <div className="subsection-heading"><h3>Objects</h3><span>{result.objects.length} returned</span></div>
          <div className="object-list">
            {result.objects.map((object, index) => <span className="object-chip" key={`${object.label}-${index}`}>{object.label}{object.score !== undefined ? ` ${object.score.toFixed(2)}` : ""}</span>)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
