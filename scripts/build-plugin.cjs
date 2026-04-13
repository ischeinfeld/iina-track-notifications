const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const distDir = path.resolve(__dirname, "..", "dist");

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, "..", "src", "main.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2018"],
  outfile: path.join(distDir, "main.js"),
  logLevel: "info",
});
