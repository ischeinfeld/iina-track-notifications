"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTrackKey = buildTrackKey;
exports.hasRestartSignal = hasRestartSignal;
exports.mergeSnapshots = mergeSnapshots;
exports.isSameTrackIdentity = isSameTrackIdentity;
exports.classifyTransition = classifyTransition;
const RESTART_REASONS = ["mpv.file-loaded", "mpv.end-file"];
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
        displayName: next.displayName || previous.displayName,
    };
}
function sameNonEmpty(a, b) {
    return Boolean(a) && Boolean(b) && a === b;
}
function isSameTrackIdentity(previous, next) {
    const sameSource = sameNonEmpty(previous.sourceIdentity, next.sourceIdentity) ||
        sameNonEmpty(previous.url, next.url) ||
        sameNonEmpty(previous.rawFilename, next.rawFilename);
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
