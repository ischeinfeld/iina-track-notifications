import assert from "node:assert/strict";
import test from "node:test";

import type { TrackSnapshot } from "../src/lib/types";
import {
  buildTrackKey,
  classifyTransition,
  hasRestartSignal,
  isSameTrackIdentity,
  mergeSnapshots,
  shouldNotifyEndedTransition,
  shouldSuppressDuplicateNotification,
} from "../src/lib/state";

function snapshot(overrides: Partial<TrackSnapshot> = {}): TrackSnapshot {
  return {
    playlistIndex: 0,
    url: "file:///tmp/track.mp3",
    rawFilename: "/tmp/track.mp3",
    sourceIdentity: "/tmp/track.mp3",
    title: "Track",
    displayName: "Track",
    trackKey: "0|/tmp/track.mp3",
    ...overrides,
  };
}

test("buildTrackKey uses playlist position when available", () => {
  assert.equal(buildTrackKey(3, "/tmp/track.mp3", "Track"), "3|/tmp/track.mp3");
  assert.equal(
    buildTrackKey(-1, "/tmp/track.mp3", "Track"),
    "url:/tmp/track.mp3|title:Track",
  );
});

test("hasRestartSignal detects clustered restart events", () => {
  assert.equal(hasRestartSignal(["mpv.media-title.changed"]), false);
  assert.equal(hasRestartSignal(["mpv.media-title.changed", "mpv.file-loaded"]), true);
});

test("classifyTransition covers initial, change, end, title update, and restart", () => {
  const previous = snapshot();
  const next = snapshot({
    playlistIndex: 1,
    url: "file:///tmp/next.mp3",
    rawFilename: "/tmp/next.mp3",
    sourceIdentity: "/tmp/next.mp3",
    title: "Next",
    displayName: "Next",
    trackKey: "1|/tmp/next.mp3",
  });

  assert.equal(
    classifyTransition({
      previous: null,
      next,
      reasons: ["mpv.file-loaded"],
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
    snapshot({ displayName: "New", title: "New" }),
  );

  assert.equal(merged.displayName, "New");
  assert.equal(merged.title, "New");
});

test("isSameTrackIdentity treats late playlist and title stabilization as the same track", () => {
  assert.equal(
    isSameTrackIdentity(
      snapshot({
        playlistIndex: -1,
        url: "file:///tmp/track.mp3",
        rawFilename: "file:///tmp/track.mp3",
        sourceIdentity: "/tmp/track.mp3",
        title: "",
        displayName: "track",
        trackKey: "url:/tmp/track.mp3|title:track",
      }),
      snapshot({
        playlistIndex: 0,
        url: "/tmp/track.mp3",
        rawFilename: "/tmp/track.mp3",
        sourceIdentity: "/tmp/track.mp3",
        title: "Better Title",
        displayName: "Better Title",
        trackKey: "0|/tmp/track.mp3",
      }),
    ),
    true,
  );

  assert.equal(
    isSameTrackIdentity(
      snapshot(),
      snapshot({
        playlistIndex: 1,
        trackKey: "1|/tmp/track.mp3",
      }),
    ),
    true,
  );

  assert.equal(
    isSameTrackIdentity(
      snapshot(),
      snapshot({
        playlistIndex: 1,
        url: "file:///tmp/other.mp3",
        rawFilename: "/tmp/other.mp3",
        sourceIdentity: "/tmp/other.mp3",
        displayName: "Other",
        title: "Other",
        trackKey: "1|/tmp/other.mp3",
      }),
    ),
    false,
  );
});

test("classifyTransition ignores playlist reindexing for the same source", () => {
  assert.equal(
    classifyTransition({
      previous: snapshot({
        playlistIndex: 0,
        trackKey: "0|/tmp/track.mp3",
      }),
      next: snapshot({
        playlistIndex: 2,
        trackKey: "2|/tmp/track.mp3",
      }),
      reasons: ["mpv.playlist-pos.changed"],
      allowSameTrackRestart: false,
    }).kind,
    "none",
  );
});

test("classifyTransition keeps same-file metadata improvements as title updates", () => {
  assert.equal(
    classifyTransition({
      previous: snapshot({
        playlistIndex: -1,
        url: "file:///tmp/track.mp3",
        rawFilename: "file:///tmp/track.mp3",
        sourceIdentity: "/tmp/track.mp3",
        title: "",
        displayName: "track",
        trackKey: "url:/tmp/track.mp3|title:track",
      }),
      next: snapshot({
        playlistIndex: 0,
        url: "/tmp/track.mp3",
        rawFilename: "/tmp/track.mp3",
        sourceIdentity: "/tmp/track.mp3",
        title: "Better Title",
        displayName: "Better Title",
        trackKey: "0|/tmp/track.mp3",
      }),
      reasons: ["mpv.media-title.changed"],
      allowSameTrackRestart: false,
    }).kind,
    "title-update",
  );
});

test("shouldSuppressDuplicateNotification applies the dedupe window to matching keys only", () => {
  assert.equal(
    shouldSuppressDuplicateNotification("changed:a->b", "changed:a->b", 1000, 1800, 1000),
    true,
  );
  assert.equal(
    shouldSuppressDuplicateNotification("changed:a->b", "changed:a->b", 1000, 2501, 1000),
    false,
  );
  assert.equal(
    shouldSuppressDuplicateNotification("changed:a->b", "changed:b->c", 1000, 1800, 1000),
    false,
  );
  assert.equal(
    shouldSuppressDuplicateNotification(null, "changed:a->b", 1000, 1800, 1000),
    false,
  );
});

test("shouldNotifyEndedTransition suppresses shutdown noise", () => {
  assert.equal(shouldNotifyEndedTransition(true, true, "both"), false);
  assert.equal(shouldNotifyEndedTransition(false, false, "both"), false);
  assert.equal(shouldNotifyEndedTransition(false, true, "start"), false);
  assert.equal(shouldNotifyEndedTransition(false, true, "both"), true);
});
