"use strict";
(() => {
  // src/lib/notify.ts
  var MAX_FIELD_LENGTH = 160;
  function normalizeOneLine(value) {
    return String(value != null ? value : "").replace(/\s+/g, " ").trim();
  }
  function normalizeBody(value) {
    return String(value != null ? value : "").replace(/\r\n?/g, "\n").split("\n").map((line) => normalizeOneLine(line)).filter(Boolean).join("\n");
  }
  function truncate(value, maxLength = MAX_FIELD_LENGTH) {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}\u2026`;
  }
  function sanitizeNotificationField(value, maxLength = MAX_FIELD_LENGTH) {
    return truncate(normalizeOneLine(value), maxLength);
  }
  function sanitizeNotificationBody(value, maxLength = MAX_FIELD_LENGTH) {
    return normalizeBody(value).split("\n").map((line) => truncate(line, maxLength)).filter(Boolean).join("\n");
  }
  function appleScriptString(value) {
    const safe = sanitizeNotificationBody(value, 1e3).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${safe}"`;
  }
  function buildAppleScript(payload) {
    const title = sanitizeNotificationField(payload.title);
    const subtitle = sanitizeNotificationField(payload.subtitle);
    const body = sanitizeNotificationBody(payload.body);
    const soundName = sanitizeNotificationField(payload.soundName);
    let script = `display notification ${appleScriptString(body)} with title ${appleScriptString(title)}`;
    if (subtitle) {
      script += ` subtitle ${appleScriptString(subtitle)}`;
    }
    if (soundName) {
      script += ` sound name ${appleScriptString(soundName)}`;
    }
    return script;
  }
  function buildInitialPayload(next) {
    return {
      title: "Track Changed",
      subtitle: "",
      body: `Next: ${next.displayName}`
    };
  }
  function buildEndedPayload(previous) {
    return {
      title: "Track Changed",
      subtitle: "",
      body: `Previous: ${previous.displayName}`
    };
  }
  function buildTrackChangePayload(mode, previous, next) {
    if (mode === "start") {
      return buildInitialPayload(next);
    }
    if (mode === "end") {
      return buildEndedPayload(previous);
    }
    return {
      title: "Track Changed",
      subtitle: "",
      body: `Previous: ${previous.displayName}
Next: ${next.displayName}`
    };
  }
  async function postNotification(utils2, payload) {
    const result = await utils2.exec("/usr/bin/osascript", ["-e", buildAppleScript(payload)]);
    if (result.status !== 0) {
      const details = normalizeOneLine(result.stderr || result.stdout || "unknown osascript failure");
      throw new Error(`osascript exited with ${result.status}: ${details}`);
    }
  }

  // src/lib/names.ts
  var UNKNOWN_TRACK = "Unknown Track";
  function normalizeSourceIdentity(pathOrUrl) {
    var _a;
    const raw = String(pathOrUrl != null ? pathOrUrl : "").trim();
    if (!raw) {
      return "";
    }
    try {
      if (raw.startsWith("file://")) {
        return decodeURIComponent(new URL(raw).pathname);
      }
      if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)) {
        const parsed = new URL(raw);
        return `${parsed.origin}${parsed.pathname}${parsed.search}`;
      }
    } catch (e) {
    }
    const stripped = (_a = raw.split(/[?#]/, 1)[0]) != null ? _a : raw;
    try {
      return decodeURIComponent(stripped);
    } catch (e) {
      return stripped;
    }
  }
  function basename(pathOrUrl) {
    var _a, _b;
    const raw = String(pathOrUrl != null ? pathOrUrl : "").trim();
    if (!raw) {
      return "";
    }
    let path = raw;
    try {
      if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)) {
        path = new URL(raw).pathname || raw;
      } else {
        path = (_a = raw.split(/[?#]/, 1)[0]) != null ? _a : raw;
      }
    } catch (e) {
      path = (_b = raw.split(/[?#]/, 1)[0]) != null ? _b : raw;
    }
    const segment = path.split(/[\\/]/).filter(Boolean).pop() || path;
    try {
      return decodeURIComponent(segment);
    } catch (e) {
      return segment;
    }
  }
  function displayNameForCurrentItem(title, url) {
    const trimmedTitle = String(title != null ? title : "").trim();
    if (trimmedTitle) {
      return trimmedTitle;
    }
    const fromUrl = basename(url);
    return fromUrl || UNKNOWN_TRACK;
  }

  // src/lib/state.ts
  var RESTART_REASONS = ["mpv.file-loaded", "mpv.end-file"];
  function buildTrackKey(playlistIndex, url, displayName) {
    if (Number.isInteger(playlistIndex) && playlistIndex >= 0) {
      return `${playlistIndex}|${url}`;
    }
    return `url:${url}|title:${displayName}`;
  }
  function hasRestartSignal(reasons) {
    return reasons.some((reason) => RESTART_REASONS.includes(reason));
  }
  function mergeSnapshots(previous, next) {
    return {
      ...previous,
      ...next,
      displayName: next.displayName || previous.displayName
    };
  }
  function sameNonEmpty(a, b) {
    return Boolean(a) && Boolean(b) && a === b;
  }
  function isSameTrackIdentity(previous, next) {
    const sameSource = sameNonEmpty(previous.sourceIdentity, next.sourceIdentity) || sameNonEmpty(previous.url, next.url) || sameNonEmpty(previous.rawFilename, next.rawFilename);
    if (!sameSource) {
      return previous.trackKey === next.trackKey;
    }
    return true;
  }
  function classifyTransition(context) {
    const { previous, next, reasons, allowSameTrackRestart } = context;
    if (!previous && !next) {
      return { kind: "none", previous, next, dedupeKey: null };
    }
    if (!previous && next) {
      return {
        kind: "initial",
        previous,
        next,
        dedupeKey: `initial:${next.trackKey}`
      };
    }
    if (previous && !next) {
      return {
        kind: "ended",
        previous,
        next,
        dedupeKey: `ended:${previous.trackKey}`
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
        dedupeKey: `changed:${previous.trackKey}->${next.trackKey}`
      };
    }
    if (allowSameTrackRestart && hasRestartSignal(reasons)) {
      return {
        kind: "restart",
        previous,
        next,
        dedupeKey: `restart:${next.trackKey}`
      };
    }
    if (previous.displayName !== next.displayName || previous.title !== next.title) {
      return { kind: "title-update", previous, next, dedupeKey: null };
    }
    return { kind: "none", previous, next, dedupeKey: null };
  }

  // src/main.ts
  var { console: iinaConsole, core, event, mpv, playlist, preferences, utils } = iina;
  var LOG_PREFIX = "[track-notify]";
  var state = {
    lastSnapshot: null,
    pendingTimer: null,
    pendingReasons: /* @__PURE__ */ new Set(),
    isMainWindow: true,
    isWindowClosing: false,
    lastNotificationKey: null,
    lastNotificationAt: 0,
    osascriptAvailable: true
  };
  function pref(key, fallback) {
    const value = preferences.get(key);
    return value != null ? value : fallback;
  }
  function intPref(key, fallback) {
    const value = Number(pref(key, fallback));
    if (!Number.isFinite(value) || value < 0) {
      return fallback;
    }
    return Math.round(value);
  }
  function notificationMode() {
    const value = pref("notificationMode", "both");
    return value === "start" || value === "end" || value === "both" ? value : "both";
  }
  function oneLine(value) {
    return String(value != null ? value : "").replace(/\s+/g, " ").trim();
  }
  function logDebug(message) {
    iinaConsole.log(message);
  }
  function logWarn(message) {
    iinaConsole.warn(message);
  }
  function shouldNotifyFromThisWindow() {
    if (!pref("onlyMainWindow", true)) {
      return true;
    }
    return state.isMainWindow;
  }
  function buildSnapshot() {
    var _a, _b, _c, _d;
    if (core.status.idle) {
      return null;
    }
    const playlistIndexValue = mpv.getNumber("playlist-pos");
    const playlistIndex = Number.isInteger(playlistIndexValue) && Number(playlistIndexValue) >= 0 ? Number(playlistIndexValue) : -1;
    const items = playlist.list();
    const item = (playlistIndex >= 0 && playlistIndex < items.length ? items[playlistIndex] : null) || items.find((entry) => Boolean(entry.isPlaying)) || null;
    const title = String((_a = core.status.title) != null ? _a : "").trim();
    const url = String((_c = (_b = core.status.url) != null ? _b : item == null ? void 0 : item.filename) != null ? _c : "").trim();
    const rawFilename = String((_d = item == null ? void 0 : item.filename) != null ? _d : url).trim();
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
      timestamp: Date.now()
    };
  }
  async function maybeNotify(payload, dedupeKey) {
    if (!state.osascriptAvailable || !shouldNotifyFromThisWindow()) {
      return;
    }
    const now = Date.now();
    const dedupeMs = intPref("dedupeMs", 1e3);
    if (dedupeKey && state.lastNotificationKey === dedupeKey && now - state.lastNotificationAt <= dedupeMs) {
      logDebug(`${LOG_PREFIX} suppressed duplicate notification: ${dedupeKey}`);
      return;
    }
    logDebug(
      `${LOG_PREFIX} notifying key=${dedupeKey != null ? dedupeKey : "none"} title="${oneLine(payload.title)}" body="${oneLine(payload.body)}"`
    );
    await postNotification(utils, {
      ...payload,
      soundName: pref("soundName", "")
    });
    if (dedupeKey) {
      state.lastNotificationKey = dedupeKey;
      state.lastNotificationAt = now;
    }
  }
  async function evaluatePotentialChange(reasons) {
    var _a, _b;
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
      allowSameTrackRestart: pref("notifyOnSameTrackRestart", false)
    });
    logDebug(
      `${LOG_PREFIX} reasons=${reasons.join(",")} prev=${(_a = previous == null ? void 0 : previous.trackKey) != null ? _a : "none"} next=${(_b = next == null ? void 0 : next.trackKey) != null ? _b : "none"} prevName="${oneLine(previous == null ? void 0 : previous.displayName)}" nextName="${oneLine(next == null ? void 0 : next.displayName)}" kind=${transition.kind}`
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
        if (state.isWindowClosing) {
          logDebug(`${LOG_PREFIX} suppressed ended notification while window is closing`);
          return;
        }
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
            transition.dedupeKey
          );
        }
        return;
      }
    }
  }
  function scheduleEvaluation(reason) {
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
    }, intPref("titleDelayMs", 300));
  }
  state.osascriptAvailable = utils.fileInPath("/usr/bin/osascript");
  if (!state.osascriptAvailable) {
    logWarn(`${LOG_PREFIX} /usr/bin/osascript is unavailable; notifications are disabled`);
  }
  event.on("iina.window-main.changed", (status) => {
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
})();
