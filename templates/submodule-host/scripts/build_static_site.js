"use strict";

const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} = require("node:fs");
const { dirname, isAbsolute, relative, resolve, sep } = require("node:path");

const root = resolve(__dirname, "..");
const teselaRoot = resolve(root, "vendor/tesela");
const output = resolve(root, "dist");
const manifestPath = resolve(teselaRoot, "tesela.assets.json");

function assertSafeRelativePath(path) {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.split(/[\\/]/).includes("..")) {
    throw new Error(`Unsafe static asset path: ${String(path)}`);
  }
}

function validateAsset(sourceRoot, path, maxAssetBytes) {
  assertSafeRelativePath(path);
  const source = resolve(sourceRoot, path);
  const relativeSource = relative(sourceRoot, source);
  if (relativeSource.startsWith(`..${sep}`) || relativeSource === ".." || !existsSync(source)) {
    throw new Error(`Missing or unsafe static asset: ${path}`);
  }
  const stats = statSync(source);
  if (!stats.isFile()) throw new Error(`Static asset is not a file: ${path}`);
  const size = stats.size;
  if (size > maxAssetBytes) throw new Error(`Static asset exceeds ${maxAssetBytes} bytes: ${path}`);
  return source;
}

function copyChecked(sourceRoot, destinationRoot, path, maxAssetBytes) {
  const source = validateAsset(sourceRoot, path, maxAssetBytes);
  const destination = resolve(destinationRoot, path);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function build() {
  if (!existsSync(manifestPath)) {
    throw new Error(
      "Tesela submodule is not initialized; run git submodule update --init --recursive",
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const maxAssetBytes = manifest.limits?.maxAssetBytes || 25 * 1024 * 1024;
  const teselaAssets = [
    ...(manifest.styles || []),
    ...(manifest.scripts?.runtime || []),
    ...(manifest.scripts?.engine || []),
    manifest.scripts?.entrypoint,
  ].filter(Boolean);
  if (new Set(teselaAssets).size !== teselaAssets.length) {
    throw new Error("tesela.assets.json contains duplicate public assets");
  }
  const hostAssets = ["index.html", "app.config.js", "data/bundle.js", "src/domain.js"];

  for (const path of hostAssets) validateAsset(root, path, maxAssetBytes);
  validateAsset(teselaRoot, "tesela.assets.json", maxAssetBytes);
  for (const path of teselaAssets) validateAsset(teselaRoot, path, maxAssetBytes);

  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const path of hostAssets) copyChecked(root, output, path, maxAssetBytes);
  copyChecked(teselaRoot, resolve(output, "vendor/tesela"), "tesela.assets.json", maxAssetBytes);
  for (const path of teselaAssets) {
    copyChecked(teselaRoot, resolve(output, "vendor/tesela"), path, maxAssetBytes);
  }
  return { output, assets: hostAssets.length + teselaAssets.length + 1 };
}

if (require.main === module) {
  const result = build();
  console.log(`Built ${result.assets} static assets in ${result.output}`);
}

module.exports = { assertSafeRelativePath, build, copyChecked, validateAsset };
