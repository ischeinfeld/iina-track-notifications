import assert from "node:assert/strict";
import test from "node:test";

import {
  UNKNOWN_TRACK,
  basename,
  displayNameForCurrentItem,
  displayNameForPlaylistItem,
  normalizeSourceIdentity,
} from "../src/lib/names";

test("basename handles local paths, file URLs, and query strings", () => {
  assert.equal(basename("/Users/me/Music/track01.mp3"), "track01.mp3");
  assert.equal(basename("file:///Users/me/Music/track01.mp3"), "track01.mp3");
  assert.equal(
    basename("https://example.com/audio/track%2001.mp3?token=abc#section"),
    "track 01.mp3",
  );
});

test("normalizeSourceIdentity treats file URLs and local paths as the same source", () => {
  assert.equal(
    normalizeSourceIdentity("file:///Users/me/Music/track%2001.mp3"),
    "/Users/me/Music/track 01.mp3",
  );
  assert.equal(
    normalizeSourceIdentity("/Users/me/Music/track 01.mp3"),
    "/Users/me/Music/track 01.mp3",
  );
  assert.equal(
    normalizeSourceIdentity("https://example.com/audio/track.mp3?token=abc#section"),
    "https://example.com/audio/track.mp3?token=abc",
  );
});

test("displayNameForCurrentItem prefers title and falls back to basename", () => {
  assert.equal(displayNameForCurrentItem("Down the Line", "file:///tmp/raw.mp3"), "Down the Line");
  assert.equal(displayNameForCurrentItem("", "file:///tmp/raw.mp3"), "raw.mp3");
  assert.equal(displayNameForCurrentItem("", ""), UNKNOWN_TRACK);
});

test("displayNameForPlaylistItem prefers playlist title and falls back to filename", () => {
  assert.equal(
    displayNameForPlaylistItem({ title: "Playlist Name", filename: "/tmp/raw.mp3" }),
    "Playlist Name",
  );
  assert.equal(displayNameForPlaylistItem({ filename: "/tmp/raw.mp3" }), "raw.mp3");
  assert.equal(displayNameForPlaylistItem({}), UNKNOWN_TRACK);
});
