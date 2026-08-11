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

function modeLabel(mode: QueryMode): string {
  return mode === "kis" ? "KIS" : mode === "qa" ? "Q&A" : "TRAKE";
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
  const isTrake = mode === "trake";
  const countLabel = isTrake
    ? `${trakeSelectionCount ?? 0}/${trakeEventCount ?? 0} aligned`
    : `${candidates.length}/100 saved`;

  return (
    <section className="candidate-panel panel" aria-labelledby="candidate-heading">
      <div className="panel-heading candidate-heading">
        <div>
          <span className="eyebrow">Submission rail · {modeLabel(mode)}</span>
          <h2 id="candidate-heading">Candidate output</h2>
        </div>
        <span className={`candidate-count ${!isTrake && !canAdd ? "is-limit" : ""}`}>{countLabel}</span>
      </div>

      <div className="submission-row">
        <div className={`submission-preview ${currentSubmission ? "has-value" : ""}`}>
          <span>{currentLabel}</span>
          <code>{currentSubmission ?? "Select a frame to generate a submission string"}</code>
        </div>
        <div className="submission-actions">
          <button className="button button-secondary" type="button" disabled={!currentSubmission} onClick={() => currentSubmission && onCopy(currentSubmission)}>Copy</button>
          {!isTrake ? <button className="button button-primary" type="button" disabled={!currentSubmission || !canAdd} onClick={onAdd}>{canAdd ? "Add candidate" : "Limit reached"}</button> : null}
        </div>
      </div>

      {isTrake ? (
        <p className="candidate-helper">Align every semantic event in order. The final string preserves your selection order; it is never silently sorted.</p>
      ) : (
        <>
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
        </>
      )}
    </section>
  );
}
