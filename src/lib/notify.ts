import type {
  NotificationMode,
  NotificationPayload,
  TrackSnapshot,
  UtilsLike,
} from "./types";

const MAX_FIELD_LENGTH = 160;

export function normalizeOneLine(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeBody(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => normalizeOneLine(line))
    .filter(Boolean)
    .join("\n");
}

export function truncate(value: string, maxLength = MAX_FIELD_LENGTH): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function sanitizeNotificationField(
  value: string | null | undefined,
  maxLength = MAX_FIELD_LENGTH,
): string {
  return truncate(normalizeOneLine(value), maxLength);
}

export function sanitizeNotificationBody(
  value: string | null | undefined,
  maxLength = MAX_FIELD_LENGTH,
): string {
  return normalizeBody(value)
    .split("\n")
    .map((line) => truncate(line, maxLength))
    .filter(Boolean)
    .join("\n");
}

export function appleScriptString(value: string | null | undefined): string {
  const safe = sanitizeNotificationBody(value, 1000)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

  return `"${safe}"`;
}

export function buildAppleScript(payload: NotificationPayload): string {
  const title = sanitizeNotificationField(payload.title);
  const subtitle = sanitizeNotificationField(payload.subtitle);
  const body = sanitizeNotificationBody(payload.body);
  const soundName = sanitizeNotificationField(payload.soundName);

  let script =
    `display notification ${appleScriptString(body)} ` +
    `with title ${appleScriptString(title)}`;

  if (subtitle) {
    script += ` subtitle ${appleScriptString(subtitle)}`;
  }

  if (soundName) {
    script += ` sound name ${appleScriptString(soundName)}`;
  }

  return script;
}

export function buildInitialPayload(next: TrackSnapshot): NotificationPayload {
  return {
    title: "Track Changed",
    subtitle: "",
    body: `Next: ${next.displayName}`,
  };
}

export function buildEndedPayload(previous: TrackSnapshot): NotificationPayload {
  return {
    title: "Track Changed",
    subtitle: "",
    body: `Previous: ${previous.displayName}`,
  };
}

export function buildTrackChangePayload(
  mode: NotificationMode,
  previous: TrackSnapshot,
  next: TrackSnapshot,
): NotificationPayload {
  if (mode === "start") {
    return buildInitialPayload(next);
  }

  if (mode === "end") {
    return buildEndedPayload(previous);
  }

  return {
    title: "Track Changed",
    subtitle: "",
    body: `Previous: ${previous.displayName}\nNext: ${next.displayName}`,
  };
}

export async function postNotification(
  utils: UtilsLike,
  payload: NotificationPayload,
): Promise<void> {
  const result = await utils.exec("/usr/bin/osascript", ["-e", buildAppleScript(payload)]);

  if (result.status !== 0) {
    const details = normalizeOneLine(result.stderr || result.stdout || "unknown osascript failure");
    throw new Error(`osascript exited with ${result.status}: ${details}`);
  }
}
