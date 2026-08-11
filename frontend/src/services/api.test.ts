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
});
