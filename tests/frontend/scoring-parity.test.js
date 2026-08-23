import { describe, expect, it } from "vitest";

const scoring = require("../../src/engine/scoring.js");
const fixture = require("../fixtures/scoring/neutral-parity-v1.json");

const config = {
  keyField: fixture.keyField,
  baseMetric: fixture.baseMetric,
  minCoverage: fixture.minCoverage,
  factors: fixture.factors,
};

function contractTuple(result) {
  return [
    result.key,
    result.score,
    result.scoreN,
    result.coverage,
    result.status,
    result.missingFactors,
  ];
}

describe("paridad del scoring Tesela 0.3", () => {
  it.each(fixture.presets)("cumple la matriz de $id", (preset) => {
    const results = scoring.computeScores(fixture.records, preset.weights, config);
    expect(results.map(contractTuple)).toEqual(fixture.expectedByPreset[preset.id]);
    expect(results.every((result) => (
      result.score == null || (Number.isFinite(result.score) && Number.isFinite(result.scoreN))
    ))).toBe(true);
  });

  it("preserva contribuciones nulas y explica factores presentes y ausentes", () => {
    const preset = fixture.presets[0];
    const results = scoring.computeScores(fixture.records, preset.weights, config);
    const partial = results[2];
    const insufficient = results[3];

    expect(partial.contributions.factor_b).toBeNull();
    expect(insufficient.contributions).not.toBeNull();
    expect(scoring.explainScore(partial, preset.weights)).toEqual({
      status: "available",
      coverage: 2 / 3,
      presentFactors: ["factor_a", "factor_c"],
      missingFactors: ["factor_b"],
    });
  });

  it("distingue base ausente, cobertura insuficiente y score disponible", () => {
    const results = scoring.computeScores(fixture.records, fixture.presets[0].weights, config);
    expect(results[0].status).toBe(scoring.SCORE_STATUS.AVAILABLE);
    expect(results[4].status).toBe(scoring.SCORE_STATUS.INSUFFICIENT_COVERAGE);
    expect(results[5]).toEqual({
      key: "zone-006",
      score: null,
      scoreN: null,
      coverage: null,
      status: scoring.SCORE_STATUS.MISSING_BASE,
      contributions: null,
      missingFactors: [],
    });
  });

  it("trata cero como dato pero no convierte vacíos o booleanos en números", () => {
    expect(scoring.minmax([0, "", false, "10"])).toEqual([0, null, null, 1]);
  });

  it("solo cuenta penalties booleanos como datos disponibles", () => {
    const penaltyConfig = {
      keyField: "id",
      minCoverage: 1,
      factors: [{ key: "flag", indicator: "flag", kind: "penalty" }],
    };
    const results = scoring.computeScores(
      [{ id: "yes", flag: true }, { id: "no", flag: false }, { id: "missing", flag: null }],
      { flag: 1 },
      penaltyConfig,
    );
    expect(results.map(({ score, coverage, status }) => ({ score, coverage, status }))).toEqual([
      { score: 0, coverage: 1, status: "available" },
      { score: 100, coverage: 1, status: "available" },
      { score: null, coverage: 0, status: "insufficient_coverage" },
    ]);
  });
});
