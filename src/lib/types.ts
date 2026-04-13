export type NotificationMode = "start" | "end" | "both";

export type EvaluationReason =
  | "startup"
  | "mpv.file-loaded"
  | "mpv.playlist-pos.changed"
  | "mpv.media-title.changed"
  | "mpv.end-file";

export interface PlaylistItemLike {
  filename?: string | null;
  title?: string | null;
}

export interface TrackSnapshot {
  playlistIndex: number;
  url: string;
  rawFilename: string;
  title: string;
  displayName: string;
  trackKey: string;
  timestamp: number;
}

export interface NotificationPayload {
  title: string;
  subtitle: string;
  body: string;
  soundName?: string;
}

export interface TransitionContext {
  previous: TrackSnapshot | null;
  next: TrackSnapshot | null;
  reasons: EvaluationReason[];
  allowSameTrackRestart: boolean;
}

export type TransitionKind =
  | "none"
  | "initial"
  | "ended"
  | "changed"
  | "title-update"
  | "restart";

export interface TransitionResult {
  kind: TransitionKind;
  previous: TrackSnapshot | null;
  next: TrackSnapshot | null;
  dedupeKey: string | null;
}

export interface UtilsLike {
  fileInPath(file: string): boolean;
  exec(
    file: string,
    args: string[],
    cwd?: string,
    stdoutHook?: ((data: string) => void) | null,
    stderrHook?: ((data: string) => void) | null,
  ): Promise<{
    status: number;
    stdout: string;
    stderr: string;
  }>;
}
