import type { ReactNode } from "react";
import type { QueryMode, TranslationProvider } from "../types/domain";

interface SearchToolbarProps {
  mode: QueryMode;
  query: string;
  qaQuestion: string;
  topK: number;
  translator: TranslationProvider;
  objectFilter: string;
  inferredObjects: string[];
  loading: boolean;
  /** Rendered above the translator/top-k row; App owns the Q&A answer state. */
  answerSlot?: ReactNode;
  onQueryChange: (query: string) => void;
  onQaQuestionChange: (question: string) => void;
  onTopKChange: (topK: number) => void;
  onTranslatorChange: (translator: TranslationProvider) => void;
  onObjectFilterChange: (objects: string) => void;
  onSearch: () => void;
}

export function SearchToolbar({
  mode,
  query,
  qaQuestion,
  topK,
  translator,
  objectFilter,
  inferredObjects,
  loading,
  answerSlot,
  onQueryChange,
  onQaQuestionChange,
  onTopKChange,
  onTranslatorChange,
  onObjectFilterChange,
  onSearch,
}: SearchToolbarProps) {
  const queryLabel = mode === "qa" ? "Event description" : mode === "trake" ? "Overall video description" : "Query";
  const queryPlaceholder =
    mode === "qa"
      ? "Describe the event or scene that contains the answer…"
      : mode === "trake"
        ? "Describe the target video before aligning events…"
        : "Describe the known item, scene, or action…";

  return (
    <div className="search-toolbar">
      <div className="query-stack">
        <div className="query-field field-block">
          <label htmlFor="main-query">{queryLabel}</label>
          <textarea
            id="main-query"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                onSearch();
              }
            }}
            placeholder={queryPlaceholder}
            rows={2}
            aria-describedby="query-helper"
          />
          <div className="field-meta" id="query-helper">
            <span>{mode === "qa" ? "Used to retrieve the relevant video moment" : "Natural language input · API-backed retrieval only"}</span>
            <kbd>Ctrl ⏎</kbd>
          </div>
        </div>
        {mode === "qa" ? (
          <div className="query-field field-block">
            <label htmlFor="qa-question">Question</label>
            <textarea
              id="qa-question"
              value={qaQuestion}
              onChange={(event) => onQaQuestionChange(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  onSearch();
                }
              }}
              placeholder="What must be answered about this event?"
              rows={2}
            />
            <span className="helper-text">Gemini Vision uses this question after you select a candidate frame.</span>
          </div>
        ) : null}
      </div>

      <div className="toolbar-side">
        {answerSlot}
        <div className="toolbar-actions">
          <div className="field-block object-filter-field">
            <label htmlFor="object-filter">Objects <span className="auto-label">AI auto</span></label>
            <input
              id="object-filter"
              value={objectFilter || inferredObjects.join(", ")}
              onChange={(event) => onObjectFilterChange(event.target.value)}
              placeholder="Auto from query · optional override"
              aria-describedby="object-filter-help"
            />
            <span className="visually-hidden" id="object-filter-help">Comma-separated object names; all must match.</span>
            {inferredObjects.length > 0 && !objectFilter.trim() ? (
              <span className="inferred-objects">Auto-filled by DeepSeek</span>
            ) : null}
          </div>
          <div className="field-block translator-field">
            <label htmlFor="translator">Translator</label>
            <select
              id="translator"
              value={translator}
              onChange={(event) => onTranslatorChange(event.target.value as TranslationProvider)}
            >
              <option value="gemini">Gemini</option>
              <option value="deep-translator">Google Translate</option>
              <option value="openrouter">OpenRouter · DeepSeek</option>
              <option value="openrouter-gemini">OpenRouter · Gemini 3 Flash</option>
            </select>
          </div>
          <div className="field-block top-k-field">
            <label htmlFor="top-k">Top K</label>
            <select id="top-k" value={topK} onChange={(event) => onTopKChange(Number(event.target.value))}>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <button
            className={`button button-primary search-button ${loading ? "is-loading" : ""}`}
            type="button"
            disabled={loading}
            onClick={onSearch}
          >
            {loading ? "Searching" : "Search"}
            <span aria-hidden="true">↵</span>
          </button>
        </div>
      </div>
    </div>
  );
}
