import {
  buildEndedPayload,
  buildInitialPayload,
  buildTrackChangePayload,
  postNotification,
} from "./lib/notify";
import { displayNameForCurrentItem, normalizeSourceIdentity } from "./lib/names";
import {
  buildTrackKey,
  classifyTransition,
  mergeSnapshots,
  shouldNotifyEndedTransition,
  shouldSuppressDuplicateNotification,
} from "./lib/state";
import {
  DEFAULT_PREFERENCES,
  normalizeNonNegativeInteger,
  normalizeNotificationMode,
  type NumericPreferenceKey,
  type PluginPreferences,
  type PreferenceKey,
} from "./lib/preferences";
import type { EvaluationReason, NotificationMode, TrackSnapshot } from "./lib/types";

const { console: iinaConsole, core, event, mpv, playlist, preferences, utils } = iina;

const LOG_PREFIX = "[track-notify]";

interface PluginState {
  lastSnapshot: TrackSnapshot | null;
  pendingTimer: ReturnType<typeof setTimeout> | null;
  pendingReasons: Set<EvaluationReason>;
  isMainWindow: boolean;
  isWindowClosing: boolean;
  lastNotificationKey: string | null;
  lastNotificationAt: number;
  osascriptAvailable: boolean;
}

type PlaylistEntry = ReturnType<typeof playlist.list>[number];

const state: PluginState = {
  lastSnapshot: null,
  pendingTimer: null,
  pendingReasons: new Set(),
  isMainWindow: true,
  isWindowClosing: false,
  lastNotificationKey: null,
  lastNotificationAt: 0,
  osascriptAvailable: true,
};

function pref<K extends PreferenceKey>(key: K): PluginPreferences[K] {
  const value = preferences.get(key) as PluginPreferences[K] | null | undefined;
  return value ?? DEFAULT_PREFERENCES[key];
}

function intPref(key: NumericPreferenceKey): number {
  return normalizeNonNegativeInteger(preferences.get(key), DEFAULT_PREFERENCES[key]);
}

function notificationMode(): NotificationMode {
  return normalizeNotificationMode(preferences.get("notificationMode"));
}

function logDebug(message: string): void {
  iinaConsole.log(message);
}

function logWarn(message: string): void {
  iinaConsole.warn(message);
}

function shouldNotifyFromThisWindow(): boolean {
  if (!pref("onlyMainWindow")) {
    return true;
  }

  return state.isMainWindow;
}

function currentPlaylistItem(playlistIndex: number): PlaylistEntry | null {
  const items = playlist.list();
  return (
    (playlistIndex >= 0 && playlistIndex < items.length ? items[playlistIndex] : null) ||
    items.find((entry) => Boolean(entry.isPlaying)) ||
    null
  );
}

function buildSnapshot(): TrackSnapshot | null {
  if (core.status.idle) {
    return null;
  }

  const playlistIndexValue = mpv.getNumber("playlist-pos");
  const playlistIndex =
    Number.isInteger(playlistIndexValue) && Number(playlistIndexValue) >= 0
      ? Number(playlistIndexValue)
      : -1;
  const title = String(core.status.title ?? "").trim();
  const statusUrl = String(core.status.url ?? "").trim();
  const item = statusUrl ? null : currentPlaylistItem(playlistIndex);
  const rawFilename = String(item?.filename ?? statusUrl).trim();
  const url = statusUrl || rawFilename;
  const sourceIdentity = normalizeSourceIdentity(rawFilename || url);
  const displayName = displayNameForCurrentItem(title, url);

  return {
    playlistIndex,
    url,
    rawFilename,
    sourceIdentity,
    title,
    displayName,
    trackKey: buildTrackKey(playlistIndex, sourceIdentity || url, displayName),
  };
}

async function maybeNotify(
  payload:
    | ReturnType<typeof buildInitialPayload>
    | ReturnType<typeof buildEndedPayload>
    | ReturnType<typeof buildTrackChangePayload>,
  dedupeKey: string | null,
): Promise<void> {
  if (!state.osascriptAvailable || !shouldNotifyFromThisWindow()) {
    return;
  }

  const now = Date.now();
  const dedupeMs = intPref("dedupeMs");

  if (
    shouldSuppressDuplicateNotification(
      dedupeKey,
      state.lastNotificationKey,
      state.lastNotificationAt,
      now,
      dedupeMs,
    )
  ) {
    logDebug(`${LOG_PREFIX} suppressed duplicate notification: ${dedupeKey}`);
    return;
  }

  await postNotification(utils, {
    ...payload,
    soundName: pref("soundName"),
  });

  if (dedupeKey) {
    state.lastNotificationKey = dedupeKey;
    state.lastNotificationAt = now;
  }
}

async function evaluatePotentialChange(reasons: EvaluationReason[]): Promise<void> {
  const next = buildSnapshot();
  const previous = state.lastSnapshot;

  if (!pref("enabled")) {
    state.lastSnapshot = next;
    return;
  }

  const transition = classifyTransition({
    previous,
    next,
    reasons,
    allowSameTrackRestart: pref("notifyOnSameTrackRestart"),
  });

  switch (transition.kind) {
    case "none":
      state.lastSnapshot = next;
      return;
    case "title-update":
      state.lastSnapshot = previous && next ? mergeSnapshots(previous, next) : next;
      return;
    case "initial":
      state.lastSnapshot = next;
      if (next && pref("notifyOnInitialTrack") && notificationMode() !== "end") {
        await maybeNotify(buildInitialPayload(next), transition.dedupeKey);
      }
      return;
    case "ended":
      state.lastSnapshot = null;
      if (
        !shouldNotifyEndedTransition(
          state.isWindowClosing,
          pref("notifyOnEndWithoutNext"),
          notificationMode(),
        )
      ) {
        if (state.isWindowClosing) {
          logDebug(`${LOG_PREFIX} suppressed ended notification while window is closing`);
        }
        return;
      }
      if (previous) {
        await maybeNotify(buildEndedPayload(previous), transition.dedupeKey);
      }
      return;
    case "changed":
    case "restart": {
      state.lastSnapshot = next;
      if (previous && next) {
        await maybeNotify(
          buildTrackChangePayload(notificationMode(), previous, next),
          transition.dedupeKey,
        );
      }
      return;
    }
  }
}

function scheduleEvaluation(reason: EvaluationReason): void {
  state.pendingReasons.add(reason);

  if (state.pendingTimer) {
    clearTimeout(state.pendingTimer);
  }

  state.pendingTimer = setTimeout(() => {
    const reasons = Array.from(state.pendingReasons);
    state.pendingReasons.clear();
    state.pendingTimer = null;

    evaluatePotentialChange(reasons).catch((error) => {
      logWarn(`${LOG_PREFIX} error: ${String(error)}`);
    });
  }, intPref("titleDelayMs"));
}

state.osascriptAvailable = utils.fileInPath("/usr/bin/osascript");
if (!state.osascriptAvailable) {
  logWarn(`${LOG_PREFIX} /usr/bin/osascript is unavailable; notifications are disabled`);
}

event.on("iina.window-main.changed", (status: boolean) => {
  state.isMainWindow = status;
  scheduleEvaluation("iina.window-main.changed");
});

event.on("iina.window-will-close", () => {
  state.isWindowClosing = true;
  state.lastSnapshot = null;
  state.pendingReasons.clear();

  if (state.pendingTimer) {
    clearTimeout(state.pendingTimer);
    state.pendingTimer = null;
  }

  logDebug(`${LOG_PREFIX} window is closing; suppressing shutdown notifications`);
});

event.on("mpv.file-loaded", () => {
  scheduleEvaluation("mpv.file-loaded");
});

event.on("mpv.playlist-pos.changed", () => {
  scheduleEvaluation("mpv.playlist-pos.changed");
});

event.on("mpv.media-title.changed", () => {
  scheduleEvaluation("mpv.media-title.changed");
});

event.on("mpv.end-file", () => {
  scheduleEvaluation("mpv.end-file");
});
