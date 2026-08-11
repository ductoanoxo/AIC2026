import type { FrameSelection } from "../types/domain";

export const MAX_CANDIDATES = 100;

export function serializeKisSubmission(videoId: string, frameId: number): string {
  return `${videoId},${frameId}`;
}

export function serializeQaSubmission(
  videoId: string,
  frameId: number,
  answer: string,
): string {
  return `${videoId},${frameId},${answer.trim()}`;
}

export function serializeTrakeSubmission(
  videoId: string,
  selections: Array<FrameSelection | undefined>,
): string | null {
  if (selections.length === 0 || selections.some((selection) => !selection)) {
    return null;
  }

  return [videoId, ...selections.map((selection) => String(selection?.frameId))].join(",");
}

export function canAddCandidate(count: number, limit = MAX_CANDIDATES): boolean {
  return count >= 0 && count < Math.min(limit, MAX_CANDIDATES);
}

export function hasChronologicalWarning(selections: Array<FrameSelection | undefined>): boolean {
  const complete = selections.filter((selection): selection is FrameSelection => Boolean(selection));
  if (complete.length < 2 || complete.length !== selections.length) {
    return false;
  }

  for (let index = 1; index < complete.length; index += 1) {
    const previous = complete[index - 1];
    const current = complete[index];
    const previousPosition = previous.timestamp ?? previous.frameId;
    const currentPosition = current.timestamp ?? current.frameId;
    if (currentPosition < previousPosition) {
      return true;
    }
  }

  return false;
}

export function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
