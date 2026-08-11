import type { SearchResult, TrakeEvent } from "../types/domain";
import { formatFrameTime } from "./KeyframeCard";

interface TrakeWorkspaceProps {
  events: TrakeEvent[];
  selectedVideoId?: string;
  aligning: boolean;
  error?: string;
  onAddEvent: () => void;
  onRemoveEvent: (id: string) => void;
  onMoveEvent: (id: string, direction: "up" | "down") => void;
  onDescriptionChange: (id: string, value: string) => void;
  onAlign: () => void;
  onSelectFrame: (eventId: string, frame: SearchResult) => void;
}

export function TrakeWorkspace({
  events,
  selectedVideoId,
  aligning,
  error,
  onAddEvent,
  onRemoveEvent,
  onMoveEvent,
  onDescriptionChange,
  onAlign,
  onSelectFrame,
}: TrakeWorkspaceProps) {
  return (
    <section className="trake-workspace panel" aria-labelledby="trake-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Temporal retrieval and alignment</span>
          <h2 id="trake-heading">Semantic event alignment</h2>
        </div>
        <div className="trake-target-status">
          <span className={`status-dot ${selectedVideoId ? "is-online" : ""}`} />
          {selectedVideoId ? `Target · ${selectedVideoId}` : "No target video"}
        </div>
      </div>

      <div className="trake-flow-note">
        <span>01 · Retrieve a target video</span>
        <span>02 · Align each event against that video</span>
        <span>03 · Copy the ordered frame sequence</span>
      </div>

      {error ? <div className="inline-error" role="alert"><span>{error}</span></div> : null}

      <div className="event-editor-heading">
        <div><h3>Semantic events</h3><span>{events.length} configured</span></div>
        <button className="button button-secondary" type="button" onClick={onAlign} disabled={!selectedVideoId || aligning}>
          {aligning ? "Aligning" : "Align events"}
        </button>
      </div>

      <div className="event-list">
        {events.map((event, index) => (
          <article className="event-editor" key={event.id}>
            <div className="event-number">{String(index + 1).padStart(2, "0")}</div>
            <div className="event-main">
              <label htmlFor={`event-${event.id}`}>Event {index + 1}</label>
              <textarea
                id={`event-${event.id}`}
                value={event.description}
                onChange={(change) => onDescriptionChange(event.id, change.target.value)}
                placeholder="Describe one semantic event"
                rows={2}
              />
              <div className="event-status-row">
                <span className={`event-status status-${event.status}`}>{event.status === "ready" ? `${event.frames.length} candidates` : event.status}</span>
                {event.selectedFrame ? <span className="selected-event-frame">Selected frame {event.selectedFrame.frameId}</span> : null}
              </div>
              {event.error ? <p className="error-copy">{event.error}</p> : null}
              {event.frames.length > 0 ? (
                <div className="event-frame-strip" aria-label={`Candidates for event ${index + 1}`}>
                  {event.frames.map((frame) => (
                    <button className={`event-frame ${event.selectedFrame?.frameId === frame.frameId ? "is-selected" : ""}`} key={`${event.id}-${frame.videoId}-${frame.frameId}`} type="button" onClick={() => onSelectFrame(event.id, frame)}>
                      {frame.thumbnailUrl ? <img src={frame.thumbnailUrl} alt={`Event ${index + 1}, frame ${frame.frameId}`} loading="lazy" /> : <span className="nearby-fallback">—</span>}
                      <span>{frame.frameId}</span>
                      <small>{formatFrameTime(frame.timestamp)}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="event-actions">
              <button className="icon-button" type="button" onClick={() => onMoveEvent(event.id, "up")} disabled={index === 0} aria-label={`Move event ${index + 1} up`}>↑</button>
              <button className="icon-button" type="button" onClick={() => onMoveEvent(event.id, "down")} disabled={index === events.length - 1} aria-label={`Move event ${index + 1} down`}>↓</button>
              <button className="icon-button danger" type="button" onClick={() => onRemoveEvent(event.id)} disabled={events.length === 1} aria-label={`Remove event ${index + 1}`}>×</button>
            </div>
          </article>
        ))}
      </div>

      <button className="add-event-button" type="button" onClick={onAddEvent}>＋ Add event</button>

      <div className="trake-timeline">
        <div className="subsection-heading"><h3>Selection timeline</h3><span>user order</span></div>
        <div className="timeline-list">
          {events.map((event, index) => (
            <div className="timeline-item" key={`timeline-${event.id}`}>
              <span className="timeline-index">{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{event.description || "Untitled event"}</strong><span>{event.selectedFrame ? `frame ${event.selectedFrame.frameId} · ${formatFrameTime(event.selectedFrame.timestamp)}` : "Awaiting selection"}</span></div>
              {index < events.length - 1 ? <span className="timeline-arrow" aria-hidden="true">↓</span> : null}
            </div>
          ))}
        </div>
        <p className="timeline-note">Frame order follows your event order. If the sequence appears non-chronological, the submission rail will flag it without changing it.</p>
      </div>
    </section>
  );
}
