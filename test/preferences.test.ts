import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_PREFERENCES } from "../src/lib/preferences";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function prefDefaultsFromHtml(): unknown {
  const html = readFileSync(path.join(rootDir, "pref.html"), "utf8");
  const match = html.match(
    /<script id="preference-defaults" type="application\/json">([\s\S]*?)<\/script>/,
  );

  assert.ok(match?.[1], "Expected pref.html to include a preference-defaults JSON script tag");
  return JSON.parse(match[1]);
}

test("preference defaults stay consistent across runtime Info.json and pref.html", () => {
  const info = JSON.parse(readFileSync(path.join(rootDir, "Info.json"), "utf8"));

  assert.deepEqual(info.preferenceDefaults, DEFAULT_PREFERENCES);
  assert.deepEqual(prefDefaultsFromHtml(), DEFAULT_PREFERENCES);
});
