const test = require("node:test");
const assert = require("node:assert/strict");

const {
  appleScriptString,
  buildAppleScript,
  buildEndedPayload,
  buildInitialPayload,
  buildTrackChangePayload,
  normalizeOneLine,
  sanitizeNotificationField,
} = require("../dist/lib/notify.js");

const snapshot = (displayName) => ({
  playlistIndex: 0,
  url: `file:///tmp/${displayName}.mp3`,
  rawFilename: `/tmp/${displayName}.mp3`,
  title: displayName,
  displayName,
  trackKey: `0|file:///tmp/${displayName}.mp3`,
  timestamp: 1,
});

test("normalizeOneLine collapses whitespace", () => {
  assert.equal(normalizeOneLine("  Hello\nWorld\tagain  "), "Hello World again");
});

test("sanitizeNotificationField truncates long fields", () => {
  const result = sanitizeNotificationField("x".repeat(200), 20);
  assert.equal(result.length, 20);
  assert.ok(result.endsWith("…"));
});

test("appleScriptString escapes quotes and backslashes", () => {
  assert.equal(appleScriptString('He said "hi" \\ again'), '"He said \\"hi\\" \\\\ again"');
});

test("payload builders match the configured notification mode", () => {
  assert.deepEqual(buildInitialPayload(snapshot("Started")), {
    title: "Now Playing",
    subtitle: "",
    body: "Started",
  });
  assert.deepEqual(buildEndedPayload(snapshot("Ended")), {
    title: "Finished",
    subtitle: "",
    body: "Ended",
  });
  assert.deepEqual(
    buildTrackChangePayload("both", snapshot("Ended"), snapshot("Started")),
    {
      title: "Track Changed",
      subtitle: "Ended: Ended",
      body: "Started: Started",
    },
  );
});

test("buildAppleScript assembles the notification command", () => {
  const script = buildAppleScript({
    title: "Track Changed",
    subtitle: "Ended: Sleep Apnea",
    body: "Started: Down the Line",
    soundName: "Frog",
  });

  assert.match(script, /^display notification /);
  assert.match(script, /with title "Track Changed"/);
  assert.match(script, /subtitle "Ended: Sleep Apnea"/);
  assert.match(script, /sound name "Frog"$/);
});
