import type {
  EvaluationReason,
  NotificationMode,
  TrackSnapshot,
  TransitionContext,
  TransitionResult,
} from "./types";

const RESTART_REASONS: EvaluationReason[] = ["mpv.file-loaded", "mpv.end-file"];

export function buildTrackKey(
  playlistIndex: number,
  sourceIdentity: string,
  displayName: string,
): string {
  if (Number.isInteger(playlistIndex) && playlistIndex >= 0) {
    return `${playlistIndex}|${sourceIdentity}`;
  }

  return `url:${sourceIdentity}|title:${displayName}`;
}

export function hasRestartSignal(reasons: EvaluationReason[]): boolean {
  return reasons.some((reason) => RESTART_REASONS.includes(reason));
}

export function shouldSuppressDuplicateNotification(
  dedupeKey: string | null,
  lastNotificationKey: string | null,
  lastNotificationAt: number,
  now: number,
  dedupeMs: number,
): boolean {
  return Boolean(dedupeKey) &&
    dedupeKey === lastNotificationKey &&
    now - lastNotificationAt <= dedupeMs;
}

export function shouldNotifyEndedTransition(
  isWindowClosing: boolean,
  notifyOnEndWithoutNext: boolean,
  mode: NotificationMode,
): boolean {
  return !isWindowClosing && notifyOnEndWithoutNext && mode !== "start";
}

export function mergeSnapshots(previous: TrackSnapshot, next: TrackSnapshot): TrackSnapshot {
  return {
    ...previous,
    ...next,
    displayName: next.displayName || previous.displayName,
  };
}

function sameNonEmpty(a: string, b: string): boolean {
  return Boolean(a) && Boolean(b) && a === b;
}

export function isSameTrackIdentity(previous: TrackSnapshot, next: TrackSnapshot): boolean {
  // IINA can reindex the current file when it expands a one-file open into a directory playlist.
  const sameSource =
    sameNonEmpty(previous.sourceIdentity, next.sourceIdentity) ||
    sameNonEmpty(previous.url, next.url) ||
    sameNonEmpty(previous.rawFilename, next.rawFilename);

  if (!sameSource) {
    return previous.trackKey === next.trackKey;
  }

  return true;
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

  if (!isSameTrackIdentity(previous, next)) {
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
