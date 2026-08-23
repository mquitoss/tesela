import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scoringFixture = require("../fixtures/scoring/neutral-parity-v1.json");
const searchFixture = require("../fixtures/search/neutral-search-v1.json");
const overlays = require("../fixtures/contracts/overlays-v1.json");
const detailFields = require("../fixtures/contracts/detail-fields-v1.json");
const providers = require("../fixtures/contracts/providers-v1.js");

const sha256Json = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("contratos objetivo de Tesela 0.3", () => {
  it("define una matriz neutral, completa y reproducible para siete presets", () => {
    expect(scoringFixture.schemaVersion).toBe(1);
    expect(scoringFixture.presets).toHaveLength(7);
    expect(new Set(scoringFixture.records.map((record) => record.id)).size)
      .toBe(scoringFixture.records.length);

    for (const preset of scoringFixture.presets) {
      const matrix = scoringFixture.expectedByPreset[preset.id];
      expect(matrix, preset.id).toHaveLength(scoringFixture.records.length);
      expect(matrix.map(([key]) => key)).toEqual(scoringFixture.records.map(({ id }) => id));
    }

    expect(sha256Json(scoringFixture.expectedByPreset)).toBe(scoringFixture.matrixHash);
  });

  it("mantiene los fixtures libres de términos del dominio consumidor", () => {
    const fixtureRoot = resolve(process.cwd(), "tests/fixtures");
    const contents = [
      "scoring/neutral-parity-v1.json",
      "search/neutral-search-v1.json",
      "contracts/overlays-v1.json",
      "contracts/detail-fields-v1.json",
      "contracts/providers-v1.js",
    ].map((path) => readFileSync(resolve(fixtureRoot, path), "utf8")).join("\n");
    expect(contents).not.toMatch(/municip|catalu|inversi|hut|inmobiliar/i);
  });

  it("congela búsqueda normalizada y orden esperado", () => {
    expect(searchFixture.schemaVersion).toBe(1);
    expect(searchFixture.cases).toEqual(expect.arrayContaining([
      expect.objectContaining({ query: "alpha", expectedIds: ["zone-1", "zone-3"] }),
      expect.objectContaining({ query: "missing", expectedIds: [] }),
    ]));
  });

  it("describe las uniones discriminadas de overlays y campos", () => {
    expect(overlays.valid.map(({ type }) => type)).toEqual(["tile", "markers"]);
    expect(detailFields.valid.map(({ format }) => format)).toEqual(["number", "boolean", "duration"]);
    expect(overlays.invalid.length).toBeGreaterThan(0);
    expect(detailFields.invalid.length).toBeGreaterThan(0);
  });

  it("describe el ciclo de vida mínimo de un provider", async () => {
    const provider = providers.valid[0];
    const controller = new AbortController();
    const raw = await provider.load({ id: "zone-1" }, { signal: controller.signal });
    expect(await provider.normalize(raw)).toEqual([raw]);
    expect(provider.attribution(raw)).toEqual({
      label: "Example",
      url: "https://example.test/item",
    });
    expect(providers.invalid[0].load).toBeUndefined();
  });
});
