import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CandidatePanel } from "./components/CandidatePanel";
import { QueryModeTabs } from "./components/QueryModeTabs";
import { ResultGrid } from "./components/ResultGrid";
import { SearchToolbar } from "./components/SearchToolbar";
import { TrakeWorkspace } from "./components/TrakeWorkspace";
import { VideoInspector } from "./components/VideoInspector";
import { api, getErrorMessage, isAbortError } from "./services/api";
import {
  canAddCandidate,
  createClientId,
  hasChronologicalWarning,
  MAX_CANDIDATES,
  serializeKisSubmission,
  serializeQaSubmission,
  serializeTrakeSubmission,
} from "./lib/submissions";
import type {
  ApiStatus,
  CandidateEntry,
  NearbyFrame,
  QueryMode,
  SearchRequest,
  SearchResult,
  TrakeEvent,
} from "./types/domain";

function createTrakeEvent(): TrakeEvent {
  return { id: createClientId("event"), description: "", frames: [], status: "idle" };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function parseObjectFilters(value: string): string[] {
  return value.split(",").map((label) => label.trim()).filter(Boolean);
}

export default function App() {
  const [mode, setMode] = useState<QueryMode>("kis");
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(50);
  const [objectFilterText, setObjectFilterText] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [selectedResult, setSelectedResult] = useState<SearchResult>();
  const [activeFrame, setActiveFrame] = useState<NearbyFrame>();
  const [nearbyFrames, setNearbyFrames] = useState<NearbyFrame[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string>();
  const [nearbyError, setNearbyError] = useState<string>();
  const [toast, setToast] = useState<string>();
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: "unknown" });
  const [kisCandidates, setKisCandidates] = useState<CandidateEntry[]>([]);
  const [qaCandidates, setQaCandidates] = useState<CandidateEntry[]>([]);
  const [qaAnswer, setQaAnswer] = useState("");
  const [trakeEvents, setTrakeEvents] = useState<TrakeEvent[]>([createTrakeEvent()]);
  const [trakeVideoId, setTrakeVideoId] = useState<string>();
  const [trakeAligning, setTrakeAligning] = useState(false);
  const [trakeError, setTrakeError] = useState<string>();

  const searchAbortRef = useRef<AbortController | undefined>(undefined);
  const nearbyAbortRef = useRef<AbortController | undefined>(undefined);
  const trakeAbortRef = useRef<AbortController | undefined>(undefined);
  const searchSequenceRef = useRef(0);
  const toastTimerRef = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== undefined) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(undefined), 2400);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void api.getStatus(controller.signal).then(setApiStatus).catch(() => setApiStatus({ status: "offline" }));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      nearbyAbortRef.current?.abort();
      trakeAbortRef.current?.abort();
      if (toastTimerRef.current !== undefined) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const loadNearbyFrames = useCallback(async (result: SearchResult) => {
    nearbyAbortRef.current?.abort();
    const controller = new AbortController();
    nearbyAbortRef.current = controller;
    setNearbyLoading(true);
    setNearbyError(undefined);
    try {
      const frames = await api.getNearbyFrames(result.videoId, result.frameId, 2, controller.signal);
      setNearbyFrames(frames.some((frame) => frame.frameId === result.frameId) ? frames : [result, ...frames]);
    } catch (requestError) {
      if (!isAbortError(requestError)) {
        setNearbyFrames([result]);
        setNearbyError(getErrorMessage(requestError));
      }
    } finally {
      if (!controller.signal.aborted) setNearbyLoading(false);
    }
  }, []);

  const selectResult = useCallback((result: SearchResult) => {
    setSelectedResult(result);
    setActiveFrame(result);
    void loadNearbyFrames(result);
  }, [loadNearbyFrames]);

  const handleSearch = useCallback(async () => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setError("Enter a query before searching.");
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const sequence = searchSequenceRef.current + 1;
    searchSequenceRef.current = sequence;
    const request: SearchRequest = {
      query: trimmedQuery,
      topK,
      videoId: null,
      filters: { objects: parseObjectFilters(objectFilterText) },
    };
    setSearchLoading(true);
    setHasSearched(true);
    setError(undefined);
    try {
      const response = await api.search(request, controller.signal);
      if (sequence !== searchSequenceRef.current) return;
      setResults(response.results);
      setResultTotal(response.total);
      setSelectedResult(undefined);
      setActiveFrame(undefined);
      setNearbyFrames([]);
      setNearbyError(undefined);
    } catch (requestError) {
      if (!isAbortError(requestError) && sequence === searchSequenceRef.current) {
        setResults([]);
        setResultTotal(0);
        setError(getErrorMessage(requestError));
      }
    } finally {
      if (!controller.signal.aborted && sequence === searchSequenceRef.current) setSearchLoading(false);
    }
  }, [objectFilterText, query, topK]);

  const handleModeChange = (nextMode: QueryMode) => {
    setMode(nextMode);
    setError(undefined);
    setResults([]);
    setResultTotal(0);
    setHasSearched(false);
    setQaAnswer("");
    setSelectedResult(undefined);
    setActiveFrame(undefined);
    setNearbyFrames([]);
    if (nextMode !== "trake") setTrakeError(undefined);
  };

  const handleCopy = useCallback(async (value: string, successMessage = "Copied to clipboard") => {
    if (await copyText(value)) notify(successMessage);
    else notify("Clipboard unavailable in this browser context");
  }, [notify]);

  const handleCopyResult = useCallback((result: SearchResult) => {
    void handleCopy(serializeKisSubmission(result.videoId, result.frameId), "Copied video/frame pair");
  }, [handleCopy]);

  const handleRetryNearby = useCallback(() => {
    if (selectedResult) void loadNearbyFrames(selectedResult);
  }, [loadNearbyFrames, selectedResult]);

  const moveNearby = useCallback((direction: "previous" | "next") => {
    if (!activeFrame || nearbyFrames.length === 0) return;
    const index = nearbyFrames.findIndex((frame) => frame.frameId === activeFrame.frameId);
    const nextIndex = direction === "previous" ? index - 1 : index + 1;
    const nextFrame = nearbyFrames[nextIndex];
    if (nextFrame) setActiveFrame(nextFrame);
  }, [activeFrame, nearbyFrames]);

  useEffect(() => {
    const handleArrow = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowLeft") moveNearby("previous");
      if (event.key === "ArrowRight") moveNearby("next");
    };
    window.addEventListener("keydown", handleArrow);
    return () => window.removeEventListener("keydown", handleArrow);
  }, [moveNearby]);

  const currentFrame = activeFrame;
  const currentSubmission = useMemo(() => {
    if (mode === "trake") {
      return trakeVideoId ? serializeTrakeSubmission(trakeVideoId, trakeEvents.map((event) => event.selectedFrame)) : null;
    }
    if (!currentFrame) return null;
    if (mode === "qa") {
      return qaAnswer.trim() ? serializeQaSubmission(currentFrame.videoId, currentFrame.frameId, qaAnswer) : null;
    }
    return serializeKisSubmission(currentFrame.videoId, currentFrame.frameId);
  }, [currentFrame, mode, qaAnswer, trakeEvents, trakeVideoId]);

  const candidates = mode === "kis" ? kisCandidates : qaCandidates;
  const canAdd = canAddCandidate(candidates.length);

  const addCandidate = () => {
    if (!currentFrame || !canAdd) return;
    const candidate: CandidateEntry = {
      id: createClientId("candidate"),
      videoId: currentFrame.videoId,
      frameId: currentFrame.frameId,
      timestamp: currentFrame.timestamp,
      ...(mode === "qa" ? { answer: qaAnswer.trim() } : {}),
    };
    if (mode === "kis") setKisCandidates((current) => [...current, candidate]);
    else setQaCandidates((current) => [...current, candidate]);
    notify("Candidate saved");
  };

  const removeCandidate = (id: string) => {
    if (mode === "kis") setKisCandidates((current) => current.filter((candidate) => candidate.id !== id));
    else setQaCandidates((current) => current.filter((candidate) => candidate.id !== id));
  };

  const clearCandidates = () => {
    if (mode === "kis") setKisCandidates([]);
    else setQaCandidates([]);
  };

  const chooseTrakeVideo = (videoId: string) => {
    setTrakeVideoId(videoId);
    setTrakeError(undefined);
    setTrakeEvents((events) => events.map((event) => ({ ...event, frames: [], selectedFrame: undefined, status: "idle", error: undefined })));
    const representative = results.find((result) => result.videoId === videoId);
    if (representative) selectResult(representative);
    notify(`Target video selected · ${videoId}`);
  };

  const addTrakeEvent = () => setTrakeEvents((events) => [...events, createTrakeEvent()]);

  const removeTrakeEvent = (id: string) => setTrakeEvents((events) => events.length > 1 ? events.filter((event) => event.id !== id) : events);

  const moveTrakeEvent = (id: string, direction: "up" | "down") => {
    setTrakeEvents((events) => {
      const index = events.findIndex((event) => event.id === id);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= events.length) return events;
      const next = [...events];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const updateTrakeDescription = (id: string, value: string) => {
    setTrakeEvents((events) => events.map((event) => event.id === id ? { ...event, description: value, frames: [], selectedFrame: undefined, status: "idle", error: undefined } : event));
  };

  const alignTrakeEvents = async () => {
    if (!trakeVideoId) {
      setTrakeError("Select a target video from the retrieval results first.");
      return;
    }
    const incomplete = trakeEvents.find((event) => !event.description.trim());
    if (incomplete) {
      setTrakeError("Every event needs a description before alignment.");
      return;
    }

    trakeAbortRef.current?.abort();
    const controller = new AbortController();
    trakeAbortRef.current = controller;
    setTrakeAligning(true);
    setTrakeError(undefined);
    setTrakeEvents((events) => events.map((event) => ({ ...event, status: "loading", error: undefined })));
    const filters = { objects: parseObjectFilters(objectFilterText) };
    const aligned = await Promise.all(trakeEvents.map(async (event) => {
      try {
        const response = await api.search({ query: event.description.trim(), topK: 30, videoId: trakeVideoId, filters }, controller.signal);
        return { id: event.id, frames: response.results, status: "ready" as const };
      } catch (requestError) {
        if (isAbortError(requestError)) return { id: event.id, frames: [], status: "idle" as const };
        return { id: event.id, frames: [], status: "error" as const, error: getErrorMessage(requestError) };
      }
    }));
    if (!controller.signal.aborted) {
      setTrakeEvents((events) => events.map((event) => {
        const update = aligned.find((item) => item.id === event.id);
        return update ? { ...event, frames: update.frames, status: update.status, error: update.error, selectedFrame: undefined } : event;
      }));
      setTrakeAligning(false);
    }
  };

  const selectTrakeFrame = (eventId: string, frame: SearchResult) => {
    setTrakeEvents((events) => events.map((event) => event.id === eventId ? { ...event, selectedFrame: { frameId: frame.frameId, timestamp: frame.timestamp } } : event));
  };

  const trakeSelections = trakeEvents.map((event) => event.selectedFrame);
  const trakeWarning = hasChronologicalWarning(trakeSelections);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">AIC</span>
          <span className="brand-divider">/</span>
          <span className="brand-context">2026 VIDEO RETRIEVAL</span>
        </div>
        <div className="topbar-status">
          <span className={`status-dot ${apiStatus.status === "online" ? "is-online" : apiStatus.status === "offline" ? "is-offline" : ""}`} />
          <span>API {apiStatus.status === "online" ? "online" : apiStatus.status === "offline" ? "offline" : "unknown"}</span>
          <span className="topbar-separator" aria-hidden="true">·</span>
          <span className="mono-muted">{apiStatus.version ?? "environment pending"}</span>
        </div>
      </header>

      <main className="page-frame">
        <section className="command-panel panel">
          <div className="command-header">
            <div>
              <span className="eyebrow">Competition workspace</span>
              <h1>Retrieve. Inspect. Submit.</h1>
              <p>Search returned keyframes through the backend API, inspect local context, and keep submission strings exact.</p>
            </div>
            <div className="shortcut-note"><kbd>⌘ / Ctrl</kbd><span>+</span><kbd>Enter</kbd><small>run search</small></div>
          </div>
          <QueryModeTabs mode={mode} onChange={handleModeChange} />
          <SearchToolbar
            mode={mode}
            query={query}
            topK={topK}
            objectFilterText={objectFilterText}
            filtersOpen={filtersOpen}
            loading={searchLoading}
            onQueryChange={setQuery}
            onTopKChange={setTopK}
            onObjectFilterTextChange={setObjectFilterText}
            onFiltersToggle={() => setFiltersOpen((open) => !open)}
            onSearch={() => void handleSearch()}
          />
          {error ? <div className="global-error" role="alert"><span className="error-symbol">!</span><span>{error}</span><button type="button" onClick={() => setError(undefined)} aria-label="Dismiss error">×</button></div> : null}
        </section>

        <div className="workbench-grid">
          <section className="results-panel panel" aria-labelledby="results-heading">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Result matrix</span>
                <h2 id="results-heading">Search results</h2>
              </div>
              <div className="result-count"><strong>{resultTotal || results.length}</strong><span>{hasSearched ? "returned" : "waiting"}</span></div>
            </div>
            <ResultGrid
              mode={mode}
              results={results}
              selectedVideoId={selectedResult?.videoId}
              selectedFrameId={selectedResult?.frameId}
              loading={searchLoading}
              hasSearched={hasSearched}
              onSelect={selectResult}
              onInspect={selectResult}
              onCopy={handleCopyResult}
              onUseVideo={chooseTrakeVideo}
            />
          </section>

          <aside className="inspector-panel panel" aria-labelledby="inspector-heading">
            <div className="panel-heading compact-heading">
              <div>
                <span className="eyebrow">Frame context</span>
                <h2 id="inspector-heading">Video inspector</h2>
              </div>
              <span className="keyboard-hint">← → nearby</span>
            </div>
            <VideoInspector
              result={selectedResult}
              activeFrame={activeFrame}
              nearbyFrames={nearbyFrames}
              nearbyLoading={nearbyLoading}
              nearbyError={nearbyError}
              onSelectNearby={setActiveFrame}
              onRetryNearby={handleRetryNearby}
            />
          </aside>
        </div>

        {mode === "qa" && currentFrame ? (
          <section className="answer-panel panel" aria-labelledby="answer-heading">
            <div><span className="eyebrow">Manual answer</span><h2 id="answer-heading">Q&A response</h2></div>
            <div className="answer-field field-block"><label htmlFor="qa-answer">Answer</label><textarea id="qa-answer" value={qaAnswer} onChange={(event) => setQaAnswer(event.target.value)} placeholder="Type the answer in Vietnamese or English" rows={2} /><span className="helper-text">Optional backend suggestions can be shown here later; manual editing stays enabled.</span></div>
          </section>
        ) : null}

        {mode === "trake" ? (
          <TrakeWorkspace
            events={trakeEvents}
            selectedVideoId={trakeVideoId}
            aligning={trakeAligning}
            error={trakeError}
            onAddEvent={addTrakeEvent}
            onRemoveEvent={removeTrakeEvent}
            onMoveEvent={moveTrakeEvent}
            onDescriptionChange={updateTrakeDescription}
            onAlign={() => void alignTrakeEvents()}
            onSelectFrame={selectTrakeFrame}
          />
        ) : null}

        {trakeWarning ? <div className="chronology-warning" role="status"><span className="warning-symbol">!</span><span>Selected frame order appears non-chronological. Review the timeline; user order has been preserved.</span></div> : null}

        <CandidatePanel
          mode={mode}
          currentSubmission={currentSubmission}
          currentLabel={mode === "kis" ? "KIS submission" : mode === "qa" ? "Q&A submission" : "TRAKE submission"}
          candidates={candidates}
          canAdd={canAdd}
          trakeSelectionCount={trakeSelections.filter(Boolean).length}
          trakeEventCount={trakeEvents.length}
          onAdd={addCandidate}
          onCopy={(value) => void handleCopy(value, "Submission copied")}
          onRemove={removeCandidate}
          onClear={clearCandidates}
        />
      </main>

      <footer className="footer-bar">
        <span>AIC retrieval console</span>
        <span className="footer-center">API contract only · no dataset files loaded in browser</span>
        <span>max saved candidates · {MAX_CANDIDATES}</span>
      </footer>
      {toast ? <div className="toast" role="status" aria-live="polite">{toast}</div> : null}
    </div>
  );
}
