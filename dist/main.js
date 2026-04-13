"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const notify_1 = require("./lib/notify");
const names_1 = require("./lib/names");
const state_1 = require("./lib/state");
const { console, core, event, mpv, playlist, preferences, utils } = iina;
const LOG_PREFIX = "[track-notify]";
const state = {
    lastSnapshot: null,
    pendingTimer: null,
    pendingReasons: new Set(),
    isMainWindow: true,
    lastNotificationKey: null,
    lastNotificationAt: 0,
    osascriptAvailable: true,
};
function pref(key, fallback) {
    const value = preferences.get(key);
    return value !== null && value !== void 0 ? value : fallback;
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
function shouldNotifyFromThisWindow() {
    return !pref("onlyMainWindow", true) || state.isMainWindow;
}
function buildSnapshot() {
    var _a, _b, _c, _d;
    if (core.status.idle) {
        return null;
    }
    const playlistIndexValue = mpv.getNumber("playlist-pos");
    const playlistIndex = Number.isInteger(playlistIndexValue) && Number(playlistIndexValue) >= 0
        ? Number(playlistIndexValue)
        : -1;
    const items = playlist.list();
    const item = (playlistIndex >= 0 && playlistIndex < items.length ? items[playlistIndex] : null) ||
        items.find((entry) => Boolean(entry.isPlaying)) ||
        null;
    const title = String((_a = core.status.title) !== null && _a !== void 0 ? _a : "").trim();
    const url = String((_c = (_b = core.status.url) !== null && _b !== void 0 ? _b : item === null || item === void 0 ? void 0 : item.filename) !== null && _c !== void 0 ? _c : "").trim();
    const rawFilename = String((_d = item === null || item === void 0 ? void 0 : item.filename) !== null && _d !== void 0 ? _d : url).trim();
    const displayName = (0, names_1.displayNameForCurrentItem)(title, url);
    return {
        playlistIndex,
        url,
        rawFilename,
        title,
        displayName,
        trackKey: (0, state_1.buildTrackKey)(playlistIndex, url, displayName),
        timestamp: Date.now(),
    };
}
async function maybeNotify(payload, dedupeKey) {
    if (!state.osascriptAvailable || !shouldNotifyFromThisWindow()) {
        return;
    }
    const now = Date.now();
    const dedupeMs = intPref("dedupeMs", 1000);
    if (dedupeKey && state.lastNotificationKey === dedupeKey && now - state.lastNotificationAt <= dedupeMs) {
        console.log(`${LOG_PREFIX} suppressed duplicate notification: ${dedupeKey}`);
        return;
    }
    await (0, notify_1.postNotification)(utils, {
        ...payload,
        soundName: pref("soundName", ""),
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
    const transition = (0, state_1.classifyTransition)({
        previous,
        next,
        reasons,
        allowSameTrackRestart: pref("notifyOnSameTrackRestart", false),
    });
    console.log(`${LOG_PREFIX} reasons=${reasons.join(",")} ` +
        `prev=${(_a = previous === null || previous === void 0 ? void 0 : previous.trackKey) !== null && _a !== void 0 ? _a : "none"} next=${(_b = next === null || next === void 0 ? void 0 : next.trackKey) !== null && _b !== void 0 ? _b : "none"} ` +
        `kind=${transition.kind}`);
    switch (transition.kind) {
        case "none":
            state.lastSnapshot = next;
            return;
        case "title-update":
            state.lastSnapshot = previous && next ? (0, state_1.mergeSnapshots)(previous, next) : next;
            return;
        case "initial":
            state.lastSnapshot = next;
            if (next && pref("notifyOnInitialTrack", true) && notificationMode() !== "end") {
                await maybeNotify((0, notify_1.buildInitialPayload)(next), transition.dedupeKey);
            }
            return;
        case "ended":
            state.lastSnapshot = null;
            if (previous && pref("notifyOnEndWithoutNext", false) && notificationMode() !== "start") {
                await maybeNotify((0, notify_1.buildEndedPayload)(previous), transition.dedupeKey);
            }
            return;
        case "changed":
        case "restart": {
            state.lastSnapshot = next;
            if (previous && next) {
                await maybeNotify((0, notify_1.buildTrackChangePayload)(notificationMode(), previous, next), transition.dedupeKey);
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
            console.log(`${LOG_PREFIX} error: ${String(error)}`);
        });
    }, intPref("titleDelayMs", 300));
}
state.osascriptAvailable = utils.fileInPath("/usr/bin/osascript");
if (!state.osascriptAvailable) {
    console.log(`${LOG_PREFIX} /usr/bin/osascript is unavailable; notifications are disabled`);
}
event.on("iina.window-main.changed", (status) => {
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
