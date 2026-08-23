import { describe, expect, it } from "vitest";

const format = require("../../src/engine/format.js");
const join = require("../../src/engine/join.js");
const search = require("../../src/engine/search.js");
const fixture = require("../fixtures/search/neutral-search-v1.json");

describe("formatos declarativos", () => {
  it("formatea booleanos con etiquetas configurables", () => {
    const field = { format: "boolean", booleanLabels: { true: "Yes", false: "No" } };
    expect(format.formatValue(true, field)).toBe("Yes");
    expect(format.formatValue(false, field)).toBe("No");
    expect(format.formatValue(1, field)).toBe("sin dato");
  });

  it("formatea duraciones expresadas en minutos", () => {
    expect(format.formatDuration(0)).toBe("0 min");
    expect(format.formatDuration(45)).toBe("45 min");
    expect(format.formatDuration(60)).toBe("1 h");
    expect(format.formatDuration(95)).toBe("1 h 35 min");
    expect(format.formatDuration(90, { durationLabels: { hour: "hr", minute: "m" } }))
      .toBe("1 hr 30 m");
  });

  it("preserva huecos y nunca interpreta vacíos o booleanos como números", () => {
    for (const value of [null, "", "  ", true, false, NaN, Infinity, Symbol("missing")]) {
      expect(format.formatNumber(value, { sinDato: "n/a" })).toBe("n/a");
    }
    expect(format.formatDuration(-1, { sinDato: "n/a" })).toBe("n/a");
    expect(format.formatNumber("12", { locale: "en", decimals: 1 })).toBe("12.0");
  });

  it("limita decimales inválidos sin lanzar", () => {
    expect(() => format.formatNumber(1.25, { decimals: 999 })).not.toThrow();
    expect(() => format.formatNumber(1.25, { decimals: "invalid" })).not.toThrow();
  });
});

describe("búsqueda genérica", () => {
  const options = {
    nameFor: (zone) => zone.name,
    scoreFor: (zone) => zone.score,
    keyFor: (zone) => zone.id,
    locale: fixture.locale,
    normalization: fixture.normalization,
  };

  it.each(fixture.cases)("cumple el caso '$query'", ({ query, expectedIds }) => {
    const original = [...fixture.zones];
    const results = search.searchZones(fixture.zones, query, options);
    expect(results.map((zone) => zone.id)).toEqual(expectedIds);
    expect(results).not.toBe(fixture.zones);
    expect(fixture.zones).toEqual(original);
  });

  it("resuelve empates por nombre, clave y posición original", () => {
    const zones = [
      { id: "b", name: "Same", score: 10, marker: 1 },
      { id: "a", name: "Same", score: 10, marker: 2 },
      { id: "a", name: "Same", score: 10, marker: 3 },
    ];
    expect(search.searchZones(zones, "", options).map((zone) => zone.marker)).toEqual([2, 3, 1]);
  });

  it("no elimina artículos que solo coinciden con el inicio de una palabra", () => {
    expect(join.normalizeName("lake", { articles: ["la"] })).toBe("lake");
    expect(join.normalizeName("la Lake", { articles: ["la"] })).toBe("lake");
    expect(join.normalizeName("l'Hospital", { articles: ["l'"] })).toBe("hospital");
  });

  it("tolera locales inválidos y scores no numéricos", () => {
    const zones = [{ key: "a", name: "Zulu", score: NaN }, { key: "b", name: "Alpha", score: 2 }];
    expect(() => search.searchZones(zones, "", {
      locale: "not_a_locale",
      scoreFor: (zone) => zone.score,
    })).not.toThrow();
    expect(search.searchZones(zones, "", { scoreFor: (zone) => zone.score })[0].key).toBe("b");
  });
});
