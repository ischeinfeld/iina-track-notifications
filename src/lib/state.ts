import type {
  EvaluationReason,
  TrackSnapshot,
  TransitionContext,
  TransitionResult,
} from "./types";

const RESTART_REASONS: EvaluationReason[] = ["mpv.file-loaded", "mpv.end-file"];

export function buildTrackKey(
  playlistIndex: number,
  url: string,
  displayName: string,
): string {
  if (Number.isInteger(playlistIndex) && playlistIndex >= 0) {
    return `${playlistIndex}|${url}`;
  }

  return `url:${url}|title:${displayName}`;
}

export function hasRestartSignal(reasons: EvaluationReason[]): boolean {
  return reasons.some((reason) => RESTART_REASONS.includes(reason));
}

export function mergeSnapshots(previous: TrackSnapshot, next: TrackSnapshot): TrackSnapshot {
  return {
    ...previous,
    ...next,
    displayName: next.displayName || previous.displayName,
  };
}

export function classifyTransition(context: TransitionContext): TransitionResult {
  const { previous, next, reasons, allowSameTrackRestart } = context;

  if (!previous && !next) {
    return { kind: "none", previous, next, dedupeKey: null };
  }

  if (!previous && next) {
    return {
      kind: "initial",
      previous,
      next,
      dedupeKey: `initial:${next.trackKey}`,
    };
  }

  if (previous && !next) {
    return {
      kind: "ended",
      previous,
      next,
      dedupeKey: `ended:${previous.trackKey}`,
    };
  }

  if (!previous || !next) {
    return { kind: "none", previous, next, dedupeKey: null };
  }

  if (previous.trackKey !== next.trackKey) {
    return {
      kind: "changed",
      previous,
      next,
      dedupeKey: `changed:${previous.trackKey}->${next.trackKey}`,
    };
  }

  if (allowSameTrackRestart && hasRestartSignal(reasons)) {
    return {
      kind: "restart",
      previous,
      next,
      dedupeKey: `restart:${next.trackKey}`,
    };
  }

  if (previous.displayName !== next.displayName || previous.title !== next.title) {
    return { kind: "title-update", previous, next, dedupeKey: null };
  }

  return { kind: "none", previous, next, dedupeKey: null };
}
