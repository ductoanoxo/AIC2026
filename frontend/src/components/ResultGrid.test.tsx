// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultGrid } from "./ResultGrid";
import type { SearchResult } from "../types/domain";

const result: SearchResult = {
  rank: 1,
  videoId: "video-under-test",
  frameId: 42,
  timestamp: 2.5,
  score: 0.81,
  thumbnailUrl: "",
};

describe("ResultGrid", () => {
  afterEach(() => cleanup());

  it("emits the exact result when a keyframe is selected", () => {
    const onSelect = vi.fn();
    render(
      <ResultGrid
        mode="kis"
        results={[result]}
        loading={false}
        hasSearched
        onSelect={onSelect}
        onInspect={vi.fn()}
        onCopy={vi.fn()}
        onUseVideo={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select frame 42" }));
    expect(onSelect).toHaveBeenCalledWith(result);
  });

  it("marks the selected result without changing its identifiers", () => {
    render(
      <ResultGrid
        mode="kis"
        results={[result]}
        selectedVideoId="video-under-test"
        selectedFrameId={42}
        loading={false}
        hasSearched
        onSelect={vi.fn()}
        onInspect={vi.fn()}
        onCopy={vi.fn()}
        onUseVideo={vi.fn()}
      />,
    );

    const selectButton = screen.getByRole("button", { name: "Select frame 42" });
    expect(selectButton.parentElement?.className).toContain("is-selected");
    expect(screen.getByText("video-under-test")).toBeTruthy();
    expect(screen.getByText("Frame 42")).toBeTruthy();
  });
});
