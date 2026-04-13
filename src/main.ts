import {
  buildEndedPayload,
  buildInitialPayload,
  buildTrackChangePayload,
  postNotification,
} from "./lib/notify";
import { displayNameForCurrentItem } from "./lib/names";
import { buildTrackKey, classifyTransition, mergeSnapshots } from "./lib/state";
import type { EvaluationReason, NotificationMode, TrackSnapshot } from "./lib/types";

const { console, core, event, mpv, playlist, preferences, utils } = iina;

const LOG_PREFIX = "[track-notify]";

const state: {
  lastSnapshot: TrackSnapshot | null;
  pendingTimer: ReturnType<typeof setTimeout> | null;
  pendingReasons: Set<EvaluationReason>;
  isMainWindow: boolean;
  lastNotificationKey: string | null;
  lastNotificationAt: number;
  osascriptAvailable: boolean;
} = {
  lastSnapshot: null,
  pendingTimer: null,
  pendingReasons: new Set(),
  isMainWindow: true,
  lastNotificationKey: null,
  lastNotificationAt: 0,
  osascriptAvailable: true,
};

function pref<T>(key: string, fallback: T): T {
  const value = preferences.get(key) as T | null | undefined;
  return value ?? fallback;
}

function intPref(key: string, fallback: number): number {
  const value = Number(pref<number | string>(key, fallback));
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return Math.round(value);
}

function notificationMode(): NotificationMode {
  const value = pref<string>("notificationMode", "both");
  return value === "start" || value === "end" || value === "both" ? value : "both";
}

function shouldNotifyFromThisWindow(): boolean {
  return !pref("onlyMainWindow", true) || state.isMainWindow;
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
  const items = playlist.list();
  const item =
    (playlistIndex >= 0 && playlistIndex < items.length ? items[playlistIndex] : null) ||
    items.find((entry) => Boolean(entry.isPlaying)) ||
    null;
  const title = String(core.status.title ?? "").trim();
  const url = String(core.status.url ?? item?.filename ?? "").trim();
  const rawFilename = String(item?.filename ?? url).trim();
  const displayName = displayNameForCurrentItem(title, url);

  return {
    playlistIndex,
    url,
    rawFilename,
    title,
    displayName,
    trackKey: buildTrackKey(playlistIndex, url, displayName),
    timestamp: Date.now(),
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
  const dedupeMs = intPref("dedupeMs", 1000);

  if (dedupeKey && state.lastNotificationKey === dedupeKey && now - state.lastNotificationAt <= dedupeMs) {
    console.log(`${LOG_PREFIX} suppressed duplicate notification: ${dedupeKey}`);
    return;
  }

  await postNotification(utils, {
    ...payload,
    soundName: pref("soundName", ""),
  });

  if (dedupeKey) {
    state.lastNotificationKey = dedupeKey;
    state.lastNotificationAt = now;
  }
}

async function evaluatePotentialChange(reasons: EvaluationReason[]): Promise<void> {
  const next = buildSnapshot();
  const previous = state.lastSnapshot;

  if (!pref("enabled", true)) {
    state.lastSnapshot = next;
    return;
  }

  const transition = classifyTransition({
    previous,
    next,
    reasons,
    allowSameTrackRestart: pref("notifyOnSameTrackRestart", false),
  });

  console.log(
    `${LOG_PREFIX} reasons=${reasons.join(",")} ` +
      `prev=${previous?.trackKey ?? "none"} next=${next?.trackKey ?? "none"} ` +
      `kind=${transition.kind}`,
  );

  switch (transition.kind) {
    case "none":
      state.lastSnapshot = next;
      return;
    case "title-update":
      state.lastSnapshot = previous && next ? mergeSnapshots(previous, next) : next;
      return;
    case "initial":
      state.lastSnapshot = next;
      if (next && pref("notifyOnInitialTrack", true) && notificationMode() !== "end") {
        await maybeNotify(buildInitialPayload(next), transition.dedupeKey);
      }
      return;
    case "ended":
      state.lastSnapshot = null;
      if (previous && pref("notifyOnEndWithoutNext", false) && notificationMode() !== "start") {
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
      console.log(`${LOG_PREFIX} error: ${String(error)}`);
    });
  }, intPref("titleDelayMs", 300));
}

state.osascriptAvailable = utils.fileInPath("/usr/bin/osascript");
if (!state.osascriptAvailable) {
  console.log(`${LOG_PREFIX} /usr/bin/osascript is unavailable; notifications are disabled`);
}

event.on("iina.window-main.changed", (status: boolean) => {
  state.isMainWindow = status;
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

scheduleEvaluation("startup");
