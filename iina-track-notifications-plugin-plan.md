# IINA Plugin Implementation Plan: Track-Change Notifications

This document lays out a practical implementation plan for an IINA plugin that posts macOS notifications whenever the currently playing **playlist item** changes. The plugin should let the user choose whether a notification shows:

- the **ending** track name,
- the **beginning** track name,
- or **both**.

It should also fall back cleanly to filenames when a friendly title is unavailable.

---

## 1. What this plugin should do

### User-facing behavior

When IINA changes from one playlist item to another, the plugin should:

- detect the transition reliably,
- resolve a human-friendly name for the old and/or new item,
- and send a macOS Notification Center notification.

The notification behavior should be configurable:

- **Beginning only**  
  Example: `Now Playing` → `Beach Fossils - Down the Line`

- **Ending only**  
  Example: `Finished` → `Beach Fossils - Sleep Apnea`

- **Both**  
  Example:  
  Title: `Track Changed`  
  Subtitle: `Ended: Beach Fossils - Sleep Apnea`  
  Body: `Started: Beach Fossils - Down the Line`

### Scope clarification: what “track” means here

For this plugin, “track” should mean **the current playlist item / media file / URL**, not the audio stream inside a single file.

That distinction matters because IINA’s `core.audio.currentTrack` API is for switching among audio tracks **within one file** (for example English vs. Japanese audio), while your feature is about transitions between playlist entries. Relevant docs:

- Audio API: <https://docs.iina.io/interfaces/IINA.API.AudioAPI.html>
- Playlist API: <https://docs.iina.io/interfaces/IINA.API.Playlist.html>

---

## 2. Core implementation strategy

## Recommendation

Build this as a **small plain-JavaScript IINA plugin** with:

- a main entry script,
- a preferences page,
- and no bundler for v1.

This plugin is small enough that you do not need React, Vue, TypeScript, or even a build step unless you want one later.

Relevant docs:

- Getting Started: <https://docs.iina.io/pages/getting-started>
- Creating Plugins: <https://docs.iina.io/pages/creating-plugins.html>
- Development Guide: <https://docs.iina.io/pages/dev-guide.html>

### Why a simple main-entry plugin is enough for v1

The main entry script has direct access to:

- `iina.event` for file / property change listeners,
- `iina.playlist` for playlist inspection,
- `iina.core.status` for the current title and URL,
- `iina.preferences` for user-configurable settings,
- `iina.utils.exec()` for calling `/usr/bin/osascript`.

That is enough to implement the whole feature.

### Why I would *not* start with a global entry

IINA supports a global entry for cross-window coordination, but you do not need it for the first version.

For v1, a simpler rule is enough:

- each player instance tracks its own transitions;
- optionally notify **only if that window is the main/frontmost IINA window**.

That frontmost-window gating can be done with `iina.window-main.changed`, which is much simpler than introducing a global coordinator immediately.

Relevant docs:

- Event API: <https://docs.iina.io/interfaces/IINA.API.Event.html>
- Global Entry Point: <https://docs.iina.io/pages/global-entry.html>

---

## 3. Package layout

A good minimal structure is:

```text
TrackChangeNotifications.iinaplugin/
├── Info.json
├── main.js
├── pref.html
├── README.md
└── lib/
    ├── names.js
    ├── notify.js
    └── state.js
```

You can keep everything in `main.js` for the very first prototype, but splitting helpers into `lib/` will make the logic easier to reason about.

IINA supports a CommonJS-style `require()` / `module.exports` module system, which is enough here:

```js
const names = require("./lib/names.js");
```

Relevant docs:

- Development Guide (module system): <https://docs.iina.io/pages/dev-guide.html>

---

## 4. `Info.json` design

Start with a deliberately minimal `Info.json`:

```json
{
  "name": "Track Change Notifications",
  "identifier": "com.example.iina-track-change-notifications",
  "version": "0.1.0",
  "description": "Send configurable macOS notifications when the current playlist item changes.",
  "author": {
    "name": "Your Name",
    "url": "https://example.com"
  },
  "entry": "main.js",
  "preferencesPage": "pref.html",
  "permissions": [
    "file-system"
  ],
  "preferenceDefaults": {
    "enabled": true,
    "notificationMode": "both",
    "onlyMainWindow": true,
    "notifyOnInitialTrack": true,
    "notifyOnEndWithoutNext": false,
    "notifyOnSameTrackRestart": false,
    "titleDelayMs": 300,
    "dedupeMs": 1000,
    "soundName": ""
  }
}
```

### Why only `file-system`

You need `file-system` because IINA documents that `iina.utils.exec()` requires it.

Relevant docs:

- Development Guide / permissions: <https://docs.iina.io/pages/dev-guide.html>
- Utils API: <https://docs.iina.io/interfaces/IINA.API.Utils.html>

You do **not** need:

- `show-osd` unless you also want on-screen messages,
- `show-alert` unless you use IINA’s native alert-dialog APIs,
- `network-request` unless the plugin itself fetches anything over the network.

### Optional future fields

If you later distribute the plugin publicly, add:

- `ghRepo`
- `ghVersion`

so IINA can update the plugin from GitHub.

Relevant docs:

- Creating Plugins: <https://docs.iina.io/pages/creating-plugins.html>

---

## 5. Important note about a current docs inconsistency

If you later add a global entry, be aware that the current IINA docs and example repos are not perfectly consistent:

- the docs/template currently use **`globalEntry`**;
- some official plugin repos still show **`global`**.

What I would do:

1. For a new plugin, prefer **`globalEntry`** because that matches the current documentation and template.
2. If your installed IINA build does not recognize it, test the alternative key on that build before shipping.

References:

- Development Guide / `Info.json`: <https://docs.iina.io/pages/dev-guide.html>
- Current template repo: <https://github.com/iina/iina-plugin-template>
- Official plugin examples:
  - <https://github.com/iina/plugin-userscript>
  - <https://github.com/iina/plugin-opensub>

This is one more reason to keep v1 to a main-entry-only design.

---

## 6. Preferences model

The preference surface should stay small and directly tied to the feature.

## Recommended preferences

| Key | Type | Default | Purpose |
|---|---|---:|---|
| `enabled` | bool | `true` | Master on/off switch |
| `notificationMode` | string | `"both"` | `"start"`, `"end"`, or `"both"` |
| `onlyMainWindow` | bool | `true` | Notify only from the frontmost IINA window |
| `notifyOnInitialTrack` | bool | `true` | Show a notification for the first loaded item |
| `notifyOnEndWithoutNext` | bool | `false` | Optional “finished” notification when playback stops at the end of the playlist |
| `notifyOnSameTrackRestart` | bool | `false` | Whether replaying the exact same item counts as a new transition |
| `titleDelayMs` | int | `300` | Debounce delay to allow better metadata / media titles to settle |
| `dedupeMs` | int | `1000` | Suppress duplicate notifications caused by clustered events |
| `soundName` | string | `""` | Optional macOS notification sound name |

### Why these preferences are enough

They cover the real UX decisions:

- **what to show**
- **when to show it**
- **whether to allow repeated / edge-case transitions**
- **whether multiple IINA windows should all speak at once**

They do not overcomplicate the plugin with formatting options the user probably does not need.

---

## 7. Preference page (`pref.html`)

IINA’s preference page is just HTML. For this plugin, keep it simple and use native form controls with IINA’s built-in preference binding.

### Recommended form layout

```html
<body>
  <div class="pref-section">
    <label>
      <input type="checkbox" data-type="bool" data-pref-key="enabled" />
      Enable track-change notifications
    </label>
  </div>

  <div class="pref-section">
    Notification mode:
    <div>
      <label><input type="radio" name="notificationMode" value="start" /> Beginning track only</label><br />
      <label><input type="radio" name="notificationMode" value="end" /> Ending track only</label><br />
      <label><input type="radio" name="notificationMode" value="both" /> Both ending and beginning</label>
    </div>
  </div>

  <div class="pref-section">
    <label>
      <input type="checkbox" data-type="bool" data-pref-key="onlyMainWindow" />
      Notify only for the main/frontmost IINA window
    </label>
  </div>

  <div class="pref-section">
    <label>
      <input type="checkbox" data-type="bool" data-pref-key="notifyOnInitialTrack" />
      Notify on the first loaded track
    </label>
  </div>

  <div class="pref-section">
    <label>
      <input type="checkbox" data-type="bool" data-pref-key="notifyOnEndWithoutNext" />
      Notify when playback ends and no next track starts
    </label>
  </div>

  <div class="pref-section">
    <label>
      <input type="checkbox" data-type="bool" data-pref-key="notifyOnSameTrackRestart" />
      Treat same-track restarts as a change
    </label>
  </div>

  <div class="pref-section">
    Delay before notification (ms):
    <input type="number" data-type="int" data-pref-key="titleDelayMs" />
    <p class="small secondary pref-help">
      A short delay helps online titles and metadata settle before the notification is sent.
    </p>
  </div>

  <div class="pref-section">
    Duplicate suppression window (ms):
    <input type="number" data-type="int" data-pref-key="dedupeMs" />
  </div>

  <div class="pref-section">
    Notification sound name:
    <input type="text" data-pref-key="soundName" />
    <p class="small secondary pref-help">
      Leave empty for no sound.
    </p>
  </div>
</body>
```

### Why this page can stay declarative

IINA’s preference binding lets you attach preferences directly via `data-pref-key`, and the values are automatically synchronized.

That means you do **not** need custom JS in `pref.html` for the first version.

Relevant docs:

- Plugin Preferences: <https://docs.iina.io/pages/plugin-preferences.html>
- Preferences API: <https://docs.iina.io/interfaces/IINA.API.Preferences.html>

### One subtle docs detail

The main entry’s `iina.preferences.get()` / `set()` API is documented synchronously, but the preference-page docs also show callback-style access in the webview environment for custom bindings. The easiest way to avoid confusion is:

- use declarative `data-pref-key` bindings in the HTML,
- use synchronous `iina.preferences.get()` in `main.js`.

---

## 8. What data the plugin should keep in memory

The core of the plugin is a **snapshot comparison** system.

### Per-player state

Each main-entry instance should keep:

```js
const state = {
  lastSnapshot: null,
  pendingTimer: null,
  isMainWindow: true,
  lastNotificationKey: null,
  lastNotificationAt: 0
};
```

### Snapshot shape

A snapshot should represent the current playlist item at a point in time:

```js
{
  playlistIndex: 3,
  url: "file:///Users/me/Music/Beach Fossils/Down the Line.mp3",
  rawFilename: "/Users/me/Music/Beach Fossils/Down the Line.mp3",
  title: "Down the Line",
  displayName: "Down the Line",
  trackKey: "3|file:///Users/me/Music/Beach Fossils/Down the Line.mp3",
  timestamp: 1712860000000
}
```

### Why the snapshot matters

When the player changes from A to B, you need **both**:

- the old item’s display name,
- and the new item’s display name.

The old one disappears as soon as the change happens. So the plugin should always keep the currently playing item’s resolved display name in memory, so that when the transition happens it already knows the “ending” name.

---

## 9. Display-name resolution rules

This is the most important part of the plugin because titles are not always available in the same way.

## Rule set

### For the currently playing item

Use this order:

1. `core.status.title` if non-empty  
2. Otherwise, derive a basename from `core.status.url`  
3. Otherwise, use `"Unknown Track"`

This is the right primary source because IINA documents `core.status.title` as the best available title for the current file.

Relevant docs:

- Status API: <https://docs.iina.io/interfaces/IINA.API.StatusAPI.html>

### For playlist entries that are *not* the current item

Use this order:

1. `playlistItem.title` if truthy  
2. Otherwise, derive a basename from `playlistItem.filename`

This matters because IINA documents that for normal local files, `PlaylistItem.title` is usually `null`, and says developers should fall back to the file path or URL instead.

Relevant docs:

- Playlist API: <https://docs.iina.io/interfaces/IINA.API.Playlist.html>
- PlaylistItem: <https://docs.iina.io/interfaces/IINA.PlaylistItem.html>

### Practical implementation rule

Use a helper like:

```js
function displayNameForCurrentItem() { ... }
function displayNameForPlaylistItem(item) { ... }
```

and never spread title-resolution logic across multiple places.

## Fallback filename logic

Implement one helper:

```js
function basename(pathOrUrl) { ... }
```

That helper should:

1. return `""` if the input is empty;
2. strip query strings and fragments for URLs;
3. split on `/` and `\`;
4. decode URL escapes where safe;
5. return the last path segment;
6. fall back to the original string if parsing fails.

Examples:

- `/Users/me/Music/track01.mp3` → `track01.mp3`
- `file:///Users/me/Music/track01.mp3` → `track01.mp3`
- `https://example.com/audio/track01.mp3?token=abc` → `track01.mp3`

### Important nuance

For the **ended** item, prefer the already stored `lastSnapshot.displayName` instead of trying to reconstruct it from the playlist after the fact. That keeps the message stable even if metadata or playlist structure changes during transition.

---

## 10. Which events to listen to

Use a small set of listeners, with a debounce layer in front of them.

## Recommended listeners

### 1. `iina.file-loaded`

Primary signal that a new file was loaded.

Use it as the main “a transition probably happened” event.

### 2. `mpv.playlist-pos.changed`

Secondary signal that the current playlist position changed.

This helps catch manual next/previous actions, jumps around the playlist, and shuffle-like transitions.

### 3. `mpv.media-title.changed`

Use this to improve name quality for online content or metadata that becomes available slightly after the file loads.

Do **not** notify directly from this event. Instead, use it to reschedule the debounced evaluation so the final notification uses the better title.

### 4. `iina.window-main.changed`

Use this only to maintain a boolean:

```js
state.isMainWindow = status;
```

Then, when `onlyMainWindow` is enabled, skip notifications from non-main windows.

### 5. Optional: `mpv.end-file`

Use this only if you decide to support `notifyOnEndWithoutNext`.

Relevant docs:

- Event API: <https://docs.iina.io/interfaces/IINA.API.Event.html>
- mpv manual: <https://mpv.io/manual/master/>

## Why a debounce is necessary

A single real-world track change can cause several signals to cluster:

- playlist position changes,
- file loads,
- title settles,
- maybe other state changes.

Without a short debounce, you will either:

- send duplicate notifications,
- or notify too early with a raw filename before a better title appears.

### Recommended debounce strategy

Use a single timer per player:

```js
function scheduleEvaluation(reason) {
  clearTimeout(state.pendingTimer);
  state.pendingTimer = setTimeout(() => {
    evaluatePotentialChange(reason);
  }, pref("titleDelayMs", 300));
}
```

### Why `300ms` is a good default

It is short enough that the notification still feels immediate, but long enough to allow many late title updates to settle.

---

## 11. How to detect a real track change

The detection logic should compare the previous snapshot to the new snapshot.

## Track identity key

A good default key is:

```js
trackKey = `${playlistIndex}|${url}`
```

If `playlistIndex` is unavailable or negative, fall back to something like:

```js
trackKey = `url:${url}|title:${title}`
```

### Why use both index and URL

- the same file can appear more than once in a playlist;
- playlist position alone is not sufficient if the playlist gets rebuilt;
- URL alone is not sufficient if the same file appears multiple times.

Using both is a reasonable balance.

## Change evaluation rules

### Case A: there was no previous snapshot

This is the first track the plugin has seen.

- If `notifyOnInitialTrack` is true and mode includes “beginning”, notify.
- Otherwise, store the snapshot and do nothing.

### Case B: old `trackKey` != new `trackKey`

This is a real transition.

- Old snapshot = ending track
- New snapshot = beginning track
- Build a notification according to the selected mode
- Store the new snapshot as `lastSnapshot`

### Case C: `trackKey` is the same but `displayName` improved

This is not a new track.

Common example:

- initially the current item resolves to `track01.mp3`
- 200ms later `core.status.title` becomes `Down the Line`

In this case:

- do **not** send another notification;
- just replace `lastSnapshot.displayName` with the better title.

### Case D: same track restarted

This can happen with loops, reopens, or replaying the current item.

- If `notifyOnSameTrackRestart` is false: do nothing
- If true: treat as an ending+beginning cycle of the same item

---

## 12. Notification content rules

Use a single formatting function that maps preference mode → title/subtitle/body.

## Suggested mapping

### Mode: `start`

- Title: `Now Playing`
- Subtitle: _(optional empty)_
- Body: `{new.displayName}`

### Mode: `end`

- Title: `Finished`
- Subtitle: _(optional empty)_
- Body: `{old.displayName}`

### Mode: `both`

- Title: `Track Changed`
- Subtitle: `Ended: {old.displayName}`
- Body: `Started: {new.displayName}`

This layout works well because AppleScript’s notification API supports:

- a main string,
- a title,
- and a subtitle.

Relevant docs:

- Apple “Displaying Notifications”: <https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/DisplayNotifications.html>

## Keep each field to one line

Before sending the notification:

- trim whitespace,
- collapse internal newlines to spaces or ` — `,
- optionally truncate very long strings with an ellipsis.

That avoids ugly multi-line wrapping in banners.

---

## 13. Sending the macOS notification

Use `/usr/bin/osascript` via `iina.utils.exec()`.

## Why this is the right path

IINA’s plugin API lets you execute external programs with `utils.exec()`, and Apple documents the `display notification` AppleScript command for Notification Center.

Relevant docs:

- Utils API: <https://docs.iina.io/interfaces/IINA.API.Utils.html>
- AppleScript notifications: <https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/DisplayNotifications.html>

## Notification helper design

Create a helper like:

```js
async function postNotification({ title, subtitle, body, soundName }) { ... }
```

Implementation outline:

1. sanitize `title`, `subtitle`, and `body`
2. convert them into safe AppleScript string literals
3. build a single AppleScript command
4. run:

```js
await utils.exec("/usr/bin/osascript", ["-e", script]);
```

### Example AppleScript shape

```applescript
display notification "Started: Down the Line" with title "Track Changed" subtitle "Ended: Sleep Apnea"
```

### Optional sound

If `soundName` is non-empty:

```applescript
display notification "Started: Down the Line" with title "Track Changed" subtitle "Ended: Sleep Apnea" sound name "Frog"
```

Apple documents `sound name` as a supported parameter.

## String escaping

Implement a dedicated helper for AppleScript string escaping:

```js
function appleScriptString(value) { ... }
```

This helper should:

- coerce null/undefined to `""`
- escape backslashes and double quotes as needed
- return a valid AppleScript string literal

Do not inline escaping logic where the notification is constructed.

## Startup sanity check

At plugin startup, optionally verify:

```js
utils.fileInPath("/usr/bin/osascript")
```

If it somehow fails, log a clear warning and disable notifications gracefully.

---

## 14. Main-entry implementation sketch

This is not meant to be the final code, but it is close enough to serve as a build plan.

```js
const { console, core, event, mpv, playlist, preferences, utils } = iina;

const state = {
  lastSnapshot: null,
  pendingTimer: null,
  isMainWindow: true,
  lastNotificationKey: null,
  lastNotificationAt: 0
};

function pref(key, fallback) {
  const value = preferences.get(key);
  return value === undefined || value === null ? fallback : value;
}

function basename(pathOrUrl) {
  // 1) guard empty
  // 2) strip query/hash
  // 3) split on / and \
  // 4) decode if reasonable
  // 5) return last segment
}

function displayNameForCurrentItem() {
  const title = (core.status.title || "").trim();
  if (title) return title;

  const url = (core.status.url || "").trim();
  const base = basename(url);
  if (base) return base;

  return "Unknown Track";
}

function displayNameForPlaylistItem(item) {
  const title = ((item && item.title) || "").trim();
  if (title) return title;

  const filename = ((item && item.filename) || "").trim();
  const base = basename(filename);
  if (base) return base;

  return "Unknown Track";
}

function buildSnapshot() {
  if (core.status.idle) return null;

  const idx = mpv.getNumber("playlist-pos");
  const items = playlist.list();
  const item = idx >= 0 && idx < items.length ? items[idx] : null;

  const url = (core.status.url || (item && item.filename) || "").trim();
  const displayName = displayNameForCurrentItem();

  const trackKey =
    idx >= 0 ? `${idx}|${url}` : `url:${url}|title:${displayName}`;

  return {
    playlistIndex: idx,
    url,
    rawFilename: item ? item.filename : url,
    title: core.status.title || "",
    displayName,
    trackKey,
    timestamp: Date.now()
  };
}

function shouldNotifyFromThisWindow() {
  return !pref("onlyMainWindow", true) || state.isMainWindow;
}

function normalizeOneLine(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function appleScriptString(s) {
  const safe = String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
  return `"${safe}"`;
}

async function postNotification({ title, subtitle, body, soundName }) {
  title = normalizeOneLine(title);
  subtitle = normalizeOneLine(subtitle);
  body = normalizeOneLine(body);

  let script = `display notification ${appleScriptString(body)} with title ${appleScriptString(title)}`;

  if (subtitle) {
    script += ` subtitle ${appleScriptString(subtitle)}`;
  }

  if (soundName) {
    script += ` sound name ${appleScriptString(soundName)}`;
  }

  await utils.exec("/usr/bin/osascript", ["-e", script]);
}

function buildNotificationPayload(oldSnap, newSnap) {
  const mode = pref("notificationMode", "both");

  if (mode === "start") {
    return {
      title: "Now Playing",
      subtitle: "",
      body: newSnap.displayName
    };
  }

  if (mode === "end") {
    return {
      title: "Finished",
      subtitle: "",
      body: oldSnap.displayName
    };
  }

  return {
    title: "Track Changed",
    subtitle: `Ended: ${oldSnap.displayName}`,
    body: `Started: ${newSnap.displayName}`
  };
}

async function evaluatePotentialChange(reason) {
  if (!pref("enabled", true)) return;

  const next = buildSnapshot();
  const prev = state.lastSnapshot;

  // initial state
  if (!prev) {
    state.lastSnapshot = next;
    if (
      next &&
      pref("notifyOnInitialTrack", true) &&
      pref("notificationMode", "both") !== "end" &&
      shouldNotifyFromThisWindow()
    ) {
      const payload = {
        title: "Now Playing",
        subtitle: "",
        body: next.displayName
      };
      await postNotification({
        ...payload,
        soundName: pref("soundName", "")
      });
    }
    return;
  }

  // stopped / playlist ended with no next track
  if (!next) {
    if (
      pref("notifyOnEndWithoutNext", false) &&
      pref("notificationMode", "both") !== "start" &&
      shouldNotifyFromThisWindow()
    ) {
      await postNotification({
        title: "Finished",
        subtitle: "",
        body: prev.displayName,
        soundName: pref("soundName", "")
      });
    }
    state.lastSnapshot = next;
    return;
  }

  // same track, maybe better title only
  if (prev.trackKey === next.trackKey) {
    state.lastSnapshot = {
      ...prev,
      ...next,
      displayName: next.displayName || prev.displayName
    };
    return;
  }

  // real transition
  if (shouldNotifyFromThisWindow()) {
    const payload = buildNotificationPayload(prev, next);
    const dedupeKey = `${prev.trackKey}->${next.trackKey}`;
    const now = Date.now();

    if (
      dedupeKey !== state.lastNotificationKey ||
      now - state.lastNotificationAt > pref("dedupeMs", 1000)
    ) {
      await postNotification({
        ...payload,
        soundName: pref("soundName", "")
      });
      state.lastNotificationKey = dedupeKey;
      state.lastNotificationAt = now;
    }
  }

  state.lastSnapshot = next;
}

function scheduleEvaluation(reason) {
  clearTimeout(state.pendingTimer);
  state.pendingTimer = setTimeout(() => {
    evaluatePotentialChange(reason).catch((err) => {
      console.log(`Track notification error (${reason}): ${String(err)}`);
    });
  }, pref("titleDelayMs", 300));
}

event.on("iina.window-main.changed", (status) => {
  state.isMainWindow = status;
});

event.on("iina.file-loaded", () => {
  scheduleEvaluation("iina.file-loaded");
});

event.on("mpv.playlist-pos.changed", () => {
  scheduleEvaluation("mpv.playlist-pos.changed");
});

event.on("mpv.media-title.changed", () => {
  scheduleEvaluation("mpv.media-title.changed");
});

// optional if you enable notifyOnEndWithoutNext
event.on("mpv.end-file", () => {
  scheduleEvaluation("mpv.end-file");
});

// initialize if something is already loaded
state.lastSnapshot = buildSnapshot();
```

---

## 15. Why this event mix is the right one

This exact combination solves the real issues you will hit:

### `iina.file-loaded`
Best primary signal that “a new playable item exists now.”

### `mpv.playlist-pos.changed`
Catches transitions driven by playlist navigation.

### `mpv.media-title.changed`
Prevents too many notifications from using raw filenames when better titles arrive shortly after load.

### `iina.window-main.changed`
Lets you avoid a noisy multi-window experience without adding a global coordinator.

This is a good practical design because it is:

- simple,
- resilient,
- and still grounded in documented APIs.

---

## 16. Development workflow

## Option A: create manually

Because the plugin is small, you can create the folder and files manually.

You only need:

- `Info.json`
- `main.js`

and then `pref.html` once you add settings.

## Option B: use IINA’s CLI

IINA also ships `iina-plugin`, which can scaffold and pack plugins.

Relevant docs:

- Creating Plugins: <https://docs.iina.io/pages/creating-plugins.html>

### Useful commands

```bash
ln -s /Applications/IINA.app/Contents/MacOS/iina-plugin /usr/local/bin/iina-plugin
iina-plugin new TrackChangeNotifications
iina-plugin pack /path/to/TrackChangeNotifications
```

## Development install

For fast iteration, symlink the folder into IINA’s plugin directory with the `.iinaplugin-dev` suffix.

Example:

```bash
ln -s /path/to/TrackChangeNotifications \
  ~/Library/Application\ Support/com.colliderli.iina/plugins/TrackChangeNotifications.iinaplugin-dev
```

Then restart IINA to reload the plugin.

Relevant docs:

- Creating Plugins: <https://docs.iina.io/pages/creating-plugins.html>
- Development Guide / debugging: <https://docs.iina.io/pages/dev-guide.html>

---

## 17. Debugging plan

Use IINA’s built-in debugging tools.

## Recommended debugging sequence

### 1. Log Viewer
Log every evaluation cycle and every final notification decision.

Examples:

```js
console.log(`[track-notify] scheduled: ${reason}`);
console.log(`[track-notify] prev=${prev && prev.trackKey} next=${next && next.trackKey}`);
console.log(`[track-notify] notifying: ${JSON.stringify(payload)}`);
```

### 2. JS Developer Tool
Inspect live values for:

- `core.status.title`
- `core.status.url`
- `mpv.getNumber("playlist-pos")`
- `playlist.list()`

### 3. Safari Web Inspector
Only needed if the preferences page misbehaves.

Relevant docs:

- Development Guide / Log Viewer, JS Dev Tool, Safari Web Inspector: <https://docs.iina.io/pages/dev-guide.html>

---

## 18. Test plan

You should explicitly test the cases that will break a naïve implementation.

## Essential test matrix

### A. Local files with no embedded metadata
- Open a folder of MP3s / videos
- Let IINA auto-build a playlist
- Confirm notifications fall back to filenames

### B. M3U or M3U8 playlist with entry titles
- Confirm playlist titles are used where available

### C. Online media / yt-dlp-backed entries
- Confirm the short delay allows better titles to appear
- Confirm you do not get double notifications

### D. Manual navigation
- Next
- Previous
- Double-click another playlist item
- Drag playback position does **not** trigger a false track-change notification

### E. First-file behavior
- Confirm `notifyOnInitialTrack` works

### F. End of playlist
- Confirm optional `notifyOnEndWithoutNext` works only when enabled

### G. Same-track replay / looping
- Confirm `notifyOnSameTrackRestart` behaves correctly

### H. Multiple IINA windows
- With `onlyMainWindow = true`, only the frontmost window should notify
- With it disabled, all windows may notify independently

### I. Titles with punctuation / escaping
- Quotes: `He Said "Hello"`
- Apostrophes
- Unicode / emoji
- Newlines in metadata

### J. Notification permissions
- Confirm notifications actually appear
- Confirm the plugin fails cleanly if the user has disabled them

---

## 19. Edge cases and mitigation

## Late metadata

**Problem:** a file starts as `track01.mp3`, then later becomes `Down the Line`.

**Mitigation:** debounce on `iina.file-loaded` + `mpv.media-title.changed`.

---

## Duplicate events

**Problem:** a real track change can produce several events close together.

**Mitigation:** one timer + dedupe key + `dedupeMs`.

---

## Multiple windows

**Problem:** two IINA players can notify at once.

**Mitigation for v1:** `onlyMainWindow`.

**Mitigation for v2:** global entry that arbitrates notifications centrally.

---

## Current-track vs playlist-track confusion

**Problem:** using `core.audio.currentTrack` would solve the wrong problem.

**Mitigation:** use playlist position + current file/title snapshot instead.

---

## Global-entry docs inconsistency

**Problem:** docs/template and example repos differ on `globalEntry` vs `global`.

**Mitigation:** avoid global entry in v1; prefer `globalEntry` if you later add one.

---

## Preference API confusion in the webview

**Problem:** main-entry preferences access and preference-page custom-binding examples look slightly different.

**Mitigation:** use declarative `data-pref-key` bindings for `pref.html`.

---

## Notification attribution / permissions

**Problem:** macOS notification identity can depend on the script host.

**Mitigation:** test on the target machine and document what the user should allow in macOS Notifications settings.

Apple notes that scripts using `display notification` are added to the Notifications list of the relevant script host.

Reference:

- Apple “Displaying Notifications”: <https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/DisplayNotifications.html>

---

## 20. Optional v2: add a global entry

Only do this if you decide you need centralized coordination across windows.

## What a global entry would add

- one place to dedupe notifications across all player windows
- policy like “only notify for the newest active player”
- future room for a plugin menu item like “Pause notifications”

## Design

### Main entry responsibilities
- detect track transitions
- send message to global instance with `{ playerID, prev, next }`

### Global entry responsibilities
- receive transition messages
- decide whether to notify
- invoke the single notification path
- optionally reply to the player

Relevant docs:

- Global Entry Point: <https://docs.iina.io/pages/global-entry.html>

## Why I would still ship v1 without it

Because it adds complexity without solving a problem most users will hit often enough to justify it.

---

## 21. Recommended implementation order

## Phase 1 — bare plugin scaffold
- create `Info.json`
- create `main.js`
- log that the plugin loads

## Phase 2 — detect transitions
- implement snapshot builder
- wire `iina.file-loaded`, `mpv.playlist-pos.changed`, `mpv.media-title.changed`
- log transition decisions only, no notifications yet

## Phase 3 — send notifications
- implement `postNotification()`
- implement AppleScript quoting
- verify notification content in real playback

## Phase 4 — add preferences
- create `pref.html`
- add defaults in `Info.json`
- wire all preference checks into main logic

## Phase 5 — edge-case polish
- same-track restart handling
- end-without-next handling
- long-title cleanup
- main-window gating

## Phase 6 — package and distribute
- add `README.md`
- optionally add `ghRepo` / `ghVersion`
- pack with `iina-plugin pack`

---

## 22. Final recommendation

The cleanest first version is:

- **main-entry only**
- **plain JavaScript**
- **`iina.file-loaded` + `mpv.playlist-pos.changed` + `mpv.media-title.changed`**
- **filename fallback via a single basename helper**
- **Notification Center delivery through `utils.exec("/usr/bin/osascript", ...)`**
- **preferences in `pref.html` with declarative bindings**
- **frontmost-window-only behavior via `iina.window-main.changed`**

That design is small, maintainable, and very likely to work well in the actual situations that matter.

---

## 23. Documentation links

### IINA
- Plugin docs home: <https://docs.iina.io/modules.html>
- Getting Started: <https://docs.iina.io/pages/getting-started>
- Creating Plugins: <https://docs.iina.io/pages/creating-plugins.html>
- Development Guide: <https://docs.iina.io/pages/dev-guide.html>
- Plugin Preferences: <https://docs.iina.io/pages/plugin-preferences.html>
- Global Entry Point: <https://docs.iina.io/pages/global-entry.html>

### IINA APIs
- Event API: <https://docs.iina.io/interfaces/IINA.API.Event.html>
- Playlist API: <https://docs.iina.io/interfaces/IINA.API.Playlist.html>
- PlaylistItem: <https://docs.iina.io/interfaces/IINA.PlaylistItem.html>
- Core / Status API: <https://docs.iina.io/interfaces/IINA.API.Core.html>
- Status API direct page: <https://docs.iina.io/interfaces/IINA.API.StatusAPI.html>
- Utils API: <https://docs.iina.io/interfaces/IINA.API.Utils.html>
- Preferences API: <https://docs.iina.io/interfaces/IINA.API.Preferences.html>
- Audio API (for the “not this kind of track” distinction): <https://docs.iina.io/interfaces/IINA.API.AudioAPI.html>

### Apple / macOS notifications
- AppleScript notifications: <https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/DisplayNotifications.html>

### mpv
- mpv manual: <https://mpv.io/manual/master/>

### IINA example repos
- IINA plugin template: <https://github.com/iina/iina-plugin-template>
- Official User Scripts plugin: <https://github.com/iina/plugin-userscript>
- Official OpenSubtitles plugin: <https://github.com/iina/plugin-opensub>
