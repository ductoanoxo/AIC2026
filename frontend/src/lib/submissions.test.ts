import { describe, expect, it } from "vitest";
import {
  canAddCandidate,
  hasChronologicalWarning,
  serializeKisSubmission,
  serializeQaSubmission,
  serializeTrakeSubmission,
} from "./submissions";

describe("submission serialization", () => {
  it("serializes a KIS candidate with the original frame id", () => {
    expect(serializeKisSubmission("video-x", 15320)).toBe("video-x,15320");
  });

  it("preserves Unicode answers in Q&A submissions", () => {
    expect(serializeQaSubmission("video-x", 15320, "Một câu trả lời")).toBe(
      "video-x,15320,Một câu trả lời",
    );
  });

  it("supports any positive TRAKE event count without reordering", () => {
    expect(
      serializeTrakeSubmission("video-x", [
        { frameId: 100 },
        { frameId: 250 },
        { frameId: 412 },
        { frameId: 690 },
        { frameId: 812 },
      ]),
    ).toBe("video-x,100,250,412,690,812");
  });

  it("does not allow more than 100 saved candidates", () => {
    expect(canAddCandidate(99)).toBe(true);
    expect(canAddCandidate(100)).toBe(false);
    expect(canAddCandidate(120)).toBe(false);
  });

  it("flags a non-chronological selection without sorting it", () => {
    expect(hasChronologicalWarning([{ frameId: 12 }, { frameId: 7 }, { frameId: 18 }])).toBe(true);
    expect(hasChronologicalWarning([{ frameId: 12 }, { frameId: 18 }, { frameId: 24 }])).toBe(false);
  });
});
