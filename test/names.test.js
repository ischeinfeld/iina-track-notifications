const test = require("node:test");
const assert = require("node:assert/strict");

const {
  UNKNOWN_TRACK,
  basename,
  displayNameForCurrentItem,
  displayNameForPlaylistItem,
} = require("../dist/lib/names.js");

test("basename handles local paths, file URLs, and query strings", () => {
  assert.equal(basename("/Users/me/Music/track01.mp3"), "track01.mp3");
  assert.equal(basename("file:///Users/me/Music/track01.mp3"), "track01.mp3");
  assert.equal(
    basename("https://example.com/audio/track%2001.mp3?token=abc#section"),
    "track 01.mp3",
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
