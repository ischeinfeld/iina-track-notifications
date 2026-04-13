const esbuild = require("esbuild");

esbuild.buildSync({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2018"],
  outfile: "dist/main.js",
  logLevel: "info",
});
