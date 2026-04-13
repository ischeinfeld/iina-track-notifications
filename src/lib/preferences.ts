import type { NotificationMode } from "./types";

export interface PluginPreferences {
  enabled: boolean;
  notificationMode: NotificationMode;
  onlyMainWindow: boolean;
  notifyOnInitialTrack: boolean;
  notifyOnEndWithoutNext: boolean;
  notifyOnSameTrackRestart: boolean;
  titleDelayMs: number;
  dedupeMs: number;
  soundName: string;
}

const defaults: PluginPreferences = {
  enabled: true,
  notificationMode: "both",
  onlyMainWindow: true,
  notifyOnInitialTrack: true,
  notifyOnEndWithoutNext: false,
  notifyOnSameTrackRestart: false,
  titleDelayMs: 300,
  dedupeMs: 1000,
  soundName: "",
};

export const DEFAULT_PREFERENCES: Readonly<PluginPreferences> = Object.freeze(defaults);

export type PreferenceKey = keyof PluginPreferences;
export type NumericPreferenceKey = "titleDelayMs" | "dedupeMs";

export function normalizeNotificationMode(value: unknown): NotificationMode {
  return value === "start" || value === "end" || value === "both"
    ? value
    : DEFAULT_PREFERENCES.notificationMode;
}

export function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.round(parsed);
}
