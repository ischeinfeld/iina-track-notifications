# Track Change Notifications for IINA

Track Change Notifications is an [IINA](https://iina.io/) plugin that posts macOS notifications whenever the active playlist item changes.

The plugin can notify on:

- the beginning of a track
- the end of a track
- or both in a single notification

It prefers friendly media titles when available and falls back to filenames or URLs when it has to.

## Install

### From GitHub

In IINA:

1. Open `Preferences`.
2. Select `Plugins`.
3. Choose `Install from GitHub`.
4. Enter `https://github.com/ischeinfeld/iina-track-notifications`.

### From a Release Asset

Download the latest `.iinaplgz` asset from the GitHub releases page and open it with IINA.

## Development

Requirements:

- IINA 1.4.1 or later
- Node.js 25 or later
- npm 11 or later

Install dependencies:

```bash
npm install
```

Build the plugin:

```bash
npm run build
```

This runs TypeScript compilation for the helper modules and then bundles the actual IINA entrypoint into a single `dist/main.js` file. IINA's module loader is intentionally minimal, so the bundled entry file avoids runtime module-resolution issues.

Run type checks:

```bash
npm run check
```

Run automated tests:

```bash
npm test
```

Link the repository into IINA as a development plugin:

```bash
npm run link
```

Remove the development link:

```bash
npm run unlink
```

Pack a distributable archive:

```bash
npm run pack
```

## Preferences

- `Enable track-change notifications`: master switch.
- `Notification mode`: choose start, end, or both.
- `Notify only for the main/frontmost IINA window`: reduces multi-window noise.
- `Notify on the first loaded track`: controls whether the initial item posts a start notification.
- `Notify when playback ends and no next track starts`: optional end-of-playlist notification.
- `Treat same-track restarts as a change`: useful for loops and manual replays.
- `Delay before notification (ms)`: gives late media titles time to settle.
- `Duplicate suppression window (ms)`: prevents clustered event spam.
- `Notification sound name`: optional macOS notification sound.

## Notes

- The plugin uses `/usr/bin/osascript` through IINA's `file-system` permission to deliver notifications.
- macOS notification delivery still depends on system notification permissions for the script host on your machine.
- The repository includes the compiled `dist/` output because IINA installs plugins directly from GitHub repository contents.

## Manual Release Flow

1. Update `Info.json` version and increment `ghVersion`.
2. Run `npm test`.
3. Run `npm run pack`.
4. Commit the source and compiled `dist/` output.
5. Tag the release, for example `v0.1.0`.
6. Attach the generated `.iinaplgz` file to the GitHub release.
