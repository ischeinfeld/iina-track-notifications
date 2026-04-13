import assert from "node:assert/strict";
import test from "node:test";

import type { TrackSnapshot } from "../src/lib/types";
import {
  appleScriptString,
  buildAppleScript,
  buildEndedPayload,
  buildInitialPayload,
  buildTrackChangePayload,
  normalizeBody,
  normalizeOneLine,
  sanitizeNotificationBody,
  sanitizeNotificationField,
} from "../src/lib/notify";

function snapshot(displayName: string): TrackSnapshot {
  return {
    playlistIndex: 0,
    url: `file:///tmp/${displayName}.mp3`,
    rawFilename: `/tmp/${displayName}.mp3`,
    sourceIdentity: `/tmp/${displayName}.mp3`,
    title: displayName,
    displayName,
    trackKey: `0|/tmp/${displayName}.mp3`,
  };
}

test("normalizeOneLine collapses whitespace", () => {
  assert.equal(normalizeOneLine("  Hello\nWorld\tagain  "), "Hello World again");
});

test("normalizeBody preserves separate lines", () => {
  assert.equal(
    normalizeBody("  Previous: Foo  \n\n  Next:\tBar  "),
    "Previous: Foo\nNext: Bar",
  );
});

test("sanitizeNotificationField truncates long fields", () => {
  const result = sanitizeNotificationField("x".repeat(200), 20);
  assert.equal(result.length, 20);
  assert.ok(result.endsWith("…"));
});

test("sanitizeNotificationBody truncates per line and preserves newlines", () => {
  const result = sanitizeNotificationBody(`Previous: ${"x".repeat(200)}\nNext: Song`, 20);
  assert.equal(result.split("\n").length, 2);
  assert.ok(result.split("\n")[0]?.endsWith("…"));
  assert.equal(result.split("\n")[1], "Next: Song");
});

test("appleScriptString escapes quotes and backslashes", () => {
  assert.equal(
    appleScriptString('Previous: He said "hi" \\ again\nNext: Song'),
    '"Previous: He said \\"hi\\" \\\\ again\nNext: Song"',
  );
});

test("payload builders match the configured notification mode", () => {
  assert.deepEqual(buildInitialPayload(snapshot("Started")), {
    title: "Track Changed",
    body: "Next: Started",
  });
  assert.deepEqual(buildEndedPayload(snapshot("Ended")), {
    title: "Track Changed",
    body: "Previous: Ended",
  });
  assert.deepEqual(
    buildTrackChangePayload("both", snapshot("Ended"), snapshot("Started")),
    {
      title: "Track Changed",
      body: "Previous: Ended\nNext: Started",
    },
  );
});

test("buildAppleScript assembles the notification command", () => {
  const script = buildAppleScript({
    title: "Track Changed",
    body: "Previous: Sleep Apnea\nNext: Down the Line",
    soundName: "Frog",
  });

  assert.match(script, /^display notification /);
  assert.match(script, /with title "Track Changed"/);
  assert.doesNotMatch(script, /subtitle /);
  assert.match(script, /Previous: Sleep Apnea/);
  assert.match(script, /Next: Down the Line/);
  assert.match(script, /sound name "Frog"$/);
});
