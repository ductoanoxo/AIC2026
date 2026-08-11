import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";

describe("API boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("turns a network failure into a useful API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));

    await expect(api.search({ query: "scene", topK: 20, videoId: null })).rejects.toMatchObject({
      name: "ApiError",
      status: 0,
      message: "API unavailable. Check the backend connection.",
    });
  });

  it("keeps an aborted request cancellable", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));

    await expect(api.search({ query: "scene", topK: 20, videoId: null }, controller.signal)).rejects.toSatisfy(
      (error: unknown) => error instanceof DOMException && error.name === "AbortError",
    );
  });

  it("maps an HTTP error without hiding its status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "bad query" }), { status: 422 })));

    await expect(api.search({ query: "", topK: 20, videoId: null })).rejects.toEqual(new ApiError("bad query", 422));
  });

  it("normalizes a generated Q&A answer and its evidence frame", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      videoId: "L30_V001",
      frameId: 125,
      answer: "Năm",
      confidence: 0.92,
      reasoning: "Có năm người trên sân khấu.",
      contextFrameIds: [75, 100, 125, 150, 175],
      evidenceFrame: {
        rank: 1,
        videoId: "L30_V001",
        frameId: 125,
        timestamp: 5,
        thumbnailUrl: "/frame.jpg",
      },
    }), { status: 200 })));

    const response = await api.answerQuestion({
      eventDescription: "Lễ trao giải",
      question: "Có bao nhiêu người?",
      videoId: "L30_V001",
      frameId: 100,
    });

    expect(response.answer).toBe("Năm");
    expect(response.evidenceFrame.frameId).toBe(125);
    expect(response.contextFrameIds).toHaveLength(5);
  });
});
