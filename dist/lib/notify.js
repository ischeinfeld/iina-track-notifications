"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeOneLine = normalizeOneLine;
exports.truncate = truncate;
exports.sanitizeNotificationField = sanitizeNotificationField;
exports.appleScriptString = appleScriptString;
exports.buildAppleScript = buildAppleScript;
exports.buildInitialPayload = buildInitialPayload;
exports.buildEndedPayload = buildEndedPayload;
exports.buildTrackChangePayload = buildTrackChangePayload;
exports.postNotification = postNotification;
const MAX_FIELD_LENGTH = 160;
function normalizeOneLine(value) {
    return String(value !== null && value !== void 0 ? value : "").replace(/\s+/g, " ").trim();
}
function truncate(value, maxLength = MAX_FIELD_LENGTH) {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
function sanitizeNotificationField(value, maxLength = MAX_FIELD_LENGTH) {
    return truncate(normalizeOneLine(value), maxLength);
}
function appleScriptString(value) {
    const safe = sanitizeNotificationField(value, 1000)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
    return `"${safe}"`;
}
function buildAppleScript(payload) {
    const title = sanitizeNotificationField(payload.title);
    const subtitle = sanitizeNotificationField(payload.subtitle);
    const body = sanitizeNotificationField(payload.body);
    const soundName = sanitizeNotificationField(payload.soundName);
    let script = `display notification ${appleScriptString(body)} ` +
        `with title ${appleScriptString(title)}`;
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
        title: "Now Playing",
        subtitle: "",
        body: next.displayName,
    };
}
function buildEndedPayload(previous) {
    return {
        title: "Finished",
        subtitle: "",
        body: previous.displayName,
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
        subtitle: `Ended: ${previous.displayName}`,
        body: `Started: ${next.displayName}`,
    };
}
async function postNotification(utils, payload) {
    const result = await utils.exec("/usr/bin/osascript", ["-e", buildAppleScript(payload)]);
    if (result.status !== 0) {
        const details = normalizeOneLine(result.stderr || result.stdout || "unknown osascript failure");
        throw new Error(`osascript exited with ${result.status}: ${details}`);
    }
}
