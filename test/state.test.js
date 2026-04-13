const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTrackKey,
  classifyTransition,
  hasRestartSignal,
  mergeSnapshots,
} = require("../dist/lib/state.js");

const snapshot = (overrides = {}) => ({
  playlistIndex: 0,
  url: "file:///tmp/track.mp3",
  rawFilename: "/tmp/track.mp3",
  title: "Track",
  displayName: "Track",
  trackKey: "0|file:///tmp/track.mp3",
  timestamp: 1,
  ...overrides,
});

test("buildTrackKey uses playlist position when available", () => {
  assert.equal(buildTrackKey(3, "file:///tmp/track.mp3", "Track"), "3|file:///tmp/track.mp3");
  assert.equal(
    buildTrackKey(-1, "file:///tmp/track.mp3", "Track"),
    "url:file:///tmp/track.mp3|title:Track",
  );
});

test("hasRestartSignal detects clustered restart events", () => {
  assert.equal(hasRestartSignal(["mpv.media-title.changed"]), false);
  assert.equal(hasRestartSignal(["mpv.media-title.changed", "mpv.file-loaded"]), true);
});

test("classifyTransition covers initial, change, end, title update, and restart", () => {
  const previous = snapshot();
  const next = snapshot({ trackKey: "1|file:///tmp/next.mp3", displayName: "Next" });

  assert.equal(
    classifyTransition({
      previous: null,
      next,
      reasons: ["startup"],
      allowSameTrackRestart: false,
    }).kind,
    "initial",
  );

  assert.equal(
    classifyTransition({
      previous,
      next,
      reasons: ["mpv.playlist-pos.changed"],
      allowSameTrackRestart: false,
    }).kind,
    "changed",
  );

  assert.equal(
    classifyTransition({
      previous,
      next: null,
      reasons: ["mpv.end-file"],
      allowSameTrackRestart: false,
    }).kind,
    "ended",
  );

  assert.equal(
    classifyTransition({
      previous,
      next: snapshot({ displayName: "Better Title", title: "Better Title" }),
      reasons: ["mpv.media-title.changed"],
      allowSameTrackRestart: false,
    }).kind,
    "title-update",
  );

  assert.equal(
    classifyTransition({
      previous,
      next: snapshot(),
      reasons: ["mpv.file-loaded"],
      allowSameTrackRestart: true,
    }).kind,
    "restart",
  );
});

test("mergeSnapshots keeps the newer fields while preserving a display name", () => {
  const merged = mergeSnapshots(
    snapshot({ displayName: "Old", title: "Old" }),
    snapshot({ displayName: "New", title: "New", timestamp: 2 }),
  );

  assert.equal(merged.displayName, "New");
  assert.equal(merged.timestamp, 2);
});
