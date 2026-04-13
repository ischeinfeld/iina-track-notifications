"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNKNOWN_TRACK = void 0;
exports.normalizeSourceIdentity = normalizeSourceIdentity;
exports.basename = basename;
exports.displayNameForCurrentItem = displayNameForCurrentItem;
exports.displayNameForPlaylistItem = displayNameForPlaylistItem;
exports.UNKNOWN_TRACK = "Unknown Track";
function normalizeSourceIdentity(pathOrUrl) {
    var _a;
    const raw = String(pathOrUrl !== null && pathOrUrl !== void 0 ? pathOrUrl : "").trim();
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
    }
    catch {
        // Fall through to plain-path normalization.
    }
    const stripped = (_a = raw.split(/[?#]/, 1)[0]) !== null && _a !== void 0 ? _a : raw;
    try {
        return decodeURIComponent(stripped);
    }
    catch {
        return stripped;
    }
}
function basename(pathOrUrl) {
    var _a, _b;
    const raw = String(pathOrUrl !== null && pathOrUrl !== void 0 ? pathOrUrl : "").trim();
    if (!raw) {
        return "";
    }
    let path = raw;
    try {
        if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)) {
            path = new URL(raw).pathname || raw;
        }
        else {
            path = (_a = raw.split(/[?#]/, 1)[0]) !== null && _a !== void 0 ? _a : raw;
        }
    }
    catch {
        path = (_b = raw.split(/[?#]/, 1)[0]) !== null && _b !== void 0 ? _b : raw;
    }
    const segment = path.split(/[\\/]/).filter(Boolean).pop() || path;
    try {
        return decodeURIComponent(segment);
    }
    catch {
        return segment;
    }
}
function displayNameForCurrentItem(title, url) {
    const trimmedTitle = String(title !== null && title !== void 0 ? title : "").trim();
    if (trimmedTitle) {
        return trimmedTitle;
    }
    const fromUrl = basename(url);
    return fromUrl || exports.UNKNOWN_TRACK;
}
function displayNameForPlaylistItem(item) {
    var _a;
    const title = String((_a = item === null || item === void 0 ? void 0 : item.title) !== null && _a !== void 0 ? _a : "").trim();
    if (title) {
        return title;
    }
    const fromPath = basename(item === null || item === void 0 ? void 0 : item.filename);
    return fromPath || exports.UNKNOWN_TRACK;
}
