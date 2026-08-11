import { useState } from "react";
import type { CandidateEntry, QueryMode } from "../types/domain";

interface CandidatePanelProps {
  mode: QueryMode;
  currentSubmission: string | null;
  currentLabel: string;
  candidates: CandidateEntry[];
  canAdd: boolean;
  trakeSelectionCount?: number;
  trakeEventCount?: number;
  onAdd: () => void;
  onCopy: (value: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function CandidatePanel({
  mode,
  currentSubmission,
  currentLabel,
  candidates,
  canAdd,
  trakeSelectionCount,
  trakeEventCount,
  onAdd,
  onCopy,
  onRemove,
  onClear,
}: CandidatePanelProps) {
  const [listOpen, setListOpen] = useState(false);
  const isTrake = mode === "trake";
  const countLabel = isTrake
    ? `${trakeSelectionCount ?? 0}/${trakeEventCount ?? 0} aligned`
    : `${candidates.length}/100 saved`;

  return (
    <section className="candidate-panel" aria-labelledby="candidate-heading">
      <div className="candidate-inner">
        <div className="candidate-bar">
          <h2 className="candidate-title" id="candidate-heading">{currentLabel}</h2>

          <div className={`submission-preview ${currentSubmission ? "has-value" : ""}`}>
            <code>{currentSubmission ?? "Select a frame to generate a submission string"}</code>
          </div>

          <div className="submission-actions">
            <button className="button button-secondary" type="button" disabled={!currentSubmission} onClick={() => currentSubmission && onCopy(currentSubmission)}>Copy</button>
            {!isTrake ? <button className="button button-primary" type="button" disabled={!currentSubmission || !canAdd} onClick={onAdd}>{canAdd ? "Add" : "Limit"}</button> : null}
          </div>

          <span className={`candidate-count ${!isTrake && !canAdd ? "is-limit" : ""}`}>{countLabel}</span>

          {!isTrake ? (
            <button
              className="drawer-toggle"
              type="button"
              aria-expanded={listOpen}
              onClick={() => setListOpen((open) => !open)}
            >
              <span aria-hidden="true">{listOpen ? "▾" : "▴"}</span>
              {listOpen ? "Hide list" : "Show list"}
            </button>
          ) : null}
        </div>

        {listOpen && !isTrake ? (
          <div className="candidate-drawer">
            <p className="candidate-helper">Use the original <code>frame_id</code> returned by the backend. Saved candidates are temporary and stay in this browser session.</p>
            {candidates.length > 0 ? (
              <div className="candidate-list">
                {candidates.map((candidate, index) => {
                  const value = mode === "qa" ? `${candidate.videoId},${candidate.frameId},${candidate.answer ?? ""}` : `${candidate.videoId},${candidate.frameId}`;
                  return (
                    <div className="candidate-item" key={candidate.id}>
                      <span className="candidate-index">{String(index + 1).padStart(2, "0")}</span>
                      <code>{value}</code>
                      <button type="button" className="icon-button" onClick={() => onCopy(value)} aria-label={`Copy candidate ${index + 1}`}>Copy</button>
                      <button type="button" className="icon-button danger" onClick={() => onRemove(candidate.id)} aria-label={`Remove candidate ${index + 1}`}>×</button>
                    </div>
                  );
                })}
                <button className="clear-button" type="button" onClick={onClear}>Clear saved candidates</button>
              </div>
            ) : <p className="empty-candidates">No saved candidates yet.</p>}
          </div>
        ) : null}
      </div>
    </section>
  );
}
