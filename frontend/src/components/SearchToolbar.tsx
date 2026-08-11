import type { QueryMode } from "../types/domain";

interface SearchToolbarProps {
  mode: QueryMode;
  query: string;
  topK: number;
  objectFilterText: string;
  filtersOpen: boolean;
  loading: boolean;
  onQueryChange: (query: string) => void;
  onTopKChange: (topK: number) => void;
  onObjectFilterTextChange: (value: string) => void;
  onFiltersToggle: () => void;
  onSearch: () => void;
}

export function SearchToolbar({
  mode,
  query,
  topK,
  objectFilterText,
  filtersOpen,
  loading,
  onQueryChange,
  onTopKChange,
  onObjectFilterTextChange,
  onFiltersToggle,
  onSearch,
}: SearchToolbarProps) {
  const queryLabel = mode === "trake" ? "Overall video description" : "Query";
  const queryPlaceholder =
    mode === "qa"
      ? "Ask a question about the video content…"
      : mode === "trake"
        ? "Describe the target video before aligning events…"
        : "Describe the known item, scene, or action…";

  return (
    <div className="search-toolbar">
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
          <span>Natural language input · API-backed retrieval only</span>
          <kbd>Ctrl ⏎</kbd>
        </div>
      </div>

      <div className="toolbar-actions">
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

      <div className="advanced-filter">
        <button className="filter-toggle" type="button" onClick={onFiltersToggle} aria-expanded={filtersOpen}>
          <span className="filter-mark" aria-hidden="true">+</span>
          Advanced filters
          <span className="filter-note">optional</span>
        </button>
        {filtersOpen ? (
          <div className="filter-content">
            <label htmlFor="object-filters">Object labels</label>
            <input
              id="object-filters"
              value={objectFilterText}
              onChange={(event) => onObjectFilterTextChange(event.target.value)}
              placeholder="Type labels, separated by commas"
            />
            <span className="helper-text">Sent to the backend as filter labels. No labels are assumed.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
