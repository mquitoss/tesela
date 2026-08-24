import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = process.cwd();
const templateRoot = resolve(projectRoot, "templates/submodule-host");
const manifest = require("../../tesela.assets.json");
const builder = require("../../templates/submodule-host/scripts/build_static_site.js");

function expectedScripts() {
  return [
    ...manifest.scripts.runtime,
    ...manifest.scripts.engine,
    manifest.scripts.defaultAdapter,
    manifest.scripts.entrypoint,
  ];
}

function scriptSources(path) {
  const html = readFileSync(path, "utf8");
  return [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
}

describe("distribución estática para hosts", () => {
  it("mantiene manifiesto, ejemplo y plantilla en el mismo orden", () => {
    const expected = expectedScripts();
    const main = scriptSources(resolve(projectRoot, "index.html"))
      .filter((path) => expected.includes(path));
    const host = scriptSources(resolve(templateRoot, "index.html"))
      .map((path) => path.replace(/^vendor\/tesela\//, ""))
      .filter((path) => expected.includes(path));
    expect(main).toEqual(expected);
    expect(host).toEqual(expected.filter((path) => path !== manifest.scripts.defaultAdapter));
    expect(new Set([...manifest.styles, ...expected]).size)
      .toBe(manifest.styles.length + expected.length);
  });

  it("declara assets relativos existentes dentro del límite", () => {
    expect(manifest.limits.maxAssetBytes).toBe(25 * 1024 * 1024);
    for (const path of [...manifest.styles, ...expectedScripts()]) {
      expect(() => builder.assertSafeRelativePath(path)).not.toThrow();
      const absolute = resolve(projectRoot, path);
      expect(existsSync(absolute), path).toBe(true);
      expect(statSync(absolute).size, path).toBeLessThanOrEqual(manifest.limits.maxAssetBytes);
    }
    expect(() => builder.assertSafeRelativePath("../secret")).toThrow(/Unsafe/);
    expect(() => builder.assertSafeRelativePath("/absolute")).toThrow(/Unsafe/);
  });

  it("documenta checkout recursivo en el workflow host", () => {
    const workflow = readFileSync(resolve(templateRoot, ".github/workflows/ci.yml"), "utf8");
    expect(workflow).toMatch(/submodules:\s*recursive/);
    expect(workflow).toContain("git submodule status --recursive");
    expect(workflow).toContain("npm run build");
  });

  it("construye una allowlist host sin publicar fuentes ni herramientas", () => {
    const temporary = mkdtempSync(join(tmpdir(), "tesela-host-"));
    const host = join(temporary, "host");
    try {
      cpSync(templateRoot, host, { recursive: true });
      mkdirSync(join(host, "vendor"), { recursive: true });
      symlinkSync(projectRoot, join(host, "vendor/tesela"), "dir");
      writeFileSync(join(host, "data/bundle.js"), "window.TESELA_DATA={};\n", "utf8");
      execFileSync(process.execPath, [join(host, "scripts/build_static_site.js")]);

      expect(existsSync(join(host, "dist/index.html"))).toBe(true);
      expect(existsSync(join(host, "dist/vendor/tesela/src/app.js"))).toBe(true);
      expect(existsSync(join(host, "dist/vendor/tesela/src/engine/providers.js"))).toBe(true);
      expect(existsSync(join(host, "dist/vendor/tesela/tests"))).toBe(false);
      expect(existsSync(join(host, "dist/vendor/tesela/scripts"))).toBe(false);
      expect(existsSync(join(host, "dist/vendor/tesela/.git"))).toBe(false);
      expect(existsSync(join(host, "dist/node_modules"))).toBe(false);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("falla antes de borrar dist si el submódulo no está inicializado", () => {
    const temporary = mkdtempSync(join(tmpdir(), "tesela-host-missing-"));
    const host = join(temporary, "host");
    try {
      cpSync(templateRoot, host, { recursive: true });
      mkdirSync(join(host, "dist"), { recursive: true });
      writeFileSync(join(host, "dist/previous.txt"), "keep", "utf8");
      const result = spawnSync(process.execPath, [join(host, "scripts/build_static_site.js")], {
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/submodule is not initialized/);
      expect(existsSync(join(host, "dist/previous.txt"))).toBe(true);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
