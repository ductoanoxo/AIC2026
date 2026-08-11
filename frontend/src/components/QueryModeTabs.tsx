import type { QueryMode } from "../types/domain";

interface QueryModeTabsProps {
  mode: QueryMode;
  onChange: (mode: QueryMode) => void;
}

const modes: Array<{ value: QueryMode; label: string; description: string }> = [
  { value: "kis", label: "KIS", description: "Known item search" },
  { value: "qa", label: "Q&A", description: "Question answering" },
  { value: "trake", label: "TRAKE", description: "Temporal event alignment" },
];

export function QueryModeTabs({ mode, onChange }: QueryModeTabsProps) {
  return (
    <div className="mode-tabs" role="tablist" aria-label="Query mode">
      {modes.map((item) => (
        <button
          className={`mode-tab ${mode === item.value ? "is-active" : ""}`}
          key={item.value}
          onClick={() => onChange(item.value)}
          role="tab"
          aria-selected={mode === item.value}
          type="button"
        >
          <span>{item.label}</span>
          <small>{item.description}</small>
        </button>
      ))}
    </div>
  );
}
