import type { PlaylistItemLike } from "./types";

export const UNKNOWN_TRACK = "Unknown Track";

export function basename(pathOrUrl: string | null | undefined): string {
  const raw = String(pathOrUrl ?? "").trim();
  if (!raw) {
    return "";
  }

  let path = raw;

  try {
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)) {
      path = new URL(raw).pathname || raw;
    } else {
      path = raw.split(/[?#]/, 1)[0] ?? raw;
    }
  } catch {
    path = raw.split(/[?#]/, 1)[0] ?? raw;
  }

  const segment = path.split(/[\\/]/).filter(Boolean).pop() || path;

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function displayNameForCurrentItem(
  title: string | null | undefined,
  url: string | null | undefined,
): string {
  const trimmedTitle = String(title ?? "").trim();
  if (trimmedTitle) {
    return trimmedTitle;
  }

  const fromUrl = basename(url);
  return fromUrl || UNKNOWN_TRACK;
}

export function displayNameForPlaylistItem(item: PlaylistItemLike | null | undefined): string {
  const title = String(item?.title ?? "").trim();
  if (title) {
    return title;
  }

  const fromPath = basename(item?.filename);
  return fromPath || UNKNOWN_TRACK;
}
