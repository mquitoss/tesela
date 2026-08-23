/* =====================================================================
   Tesela · engine/scoring — score ponderado min-max por factores
   =====================================================================
   Generaliza `computeScores` de quirat/invest-map: en vez de claves hardcodeadas
   (rend/preu/dem o p65/renda/estr/dens) itera los FACTORES declarados en la
   config. Cada factor referencia un indicador y aporta `peso · norm(indicador)`
   (kind "minmax") o resta `peso · flag` (kind "penalty"). Puro: sin DOM/red.

   Invariantes de dominio (heredados de ambos proyectos):
   - `null`/ausente es un HUECO: se EXCLUYE del min-max y su contribución es
     `null`; NUNCA se coacciona a 0 ni produce NaN.
   - Si la config define `baseMetric`, una zona sin esa métrica utilizable sale
     con `score=null` (excluida del coloreo y del ranking); nunca se le fabrica.
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = g;
  g.engine = Object.assign(g.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const SCORE_STATUS = Object.freeze({
    AVAILABLE: "available",
    INSUFFICIENT_COVERAGE: "insufficient_coverage",
    MISSING_BASE: "missing_base",
  });

  function finiteNumber(value) {
    if (value == null || typeof value === "boolean") return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  /**
   * Normalización min-max a [0,1]. Los valores null/ausentes/no finitos se
   * EXCLUYEN del cálculo de min/max y producen un normalizado `null` (nunca 0).
   * Si todos los presentes son iguales (span 0) o no hay ninguno, los presentes
   * mapean a 0.5 (neutro). Devuelve un array alineado a la entrada. Pura.
   * @param {ReadonlyArray<number|null|undefined>} values
   * @returns {Array<number|null>}
   */
  function minmax(values) {
    const arr = Array.isArray(values) ? values : [];
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of arr) {
      const n = finiteNumber(x);
      if (n == null) continue;
      if (n < lo) lo = n;
      if (n > hi) hi = n;
    }
    const hasRange = lo !== Infinity;
    const span = hi - lo;
    return arr.map((x) => {
      const n = finiteNumber(x);
      if (n == null) return null;
      if (!hasRange || span === 0) return 0.5;
      return clamp((n - lo) / span, 0, 1);
    });
  }

  // ¿Tiene el indicador un valor numérico utilizable en `key`?
  function hasValue(ind, key) {
    if (ind == null || typeof ind !== "object") return false;
    return finiteNumber(ind[key]) != null;
  }

  const activeWeight = (value) => Math.max(0, finiteNumber(value) || 0);

  function factorValue(indicator, factor, normalizedValue) {
    if (factor.kind === "penalty") {
      const value = indicator && indicator[factor.indicator];
      return typeof value === "boolean" ? (value ? 1 : 0) : null;
    }
    return normalizedValue;
  }

  /**
   * Puntúa una lista de indicadores con la suma ponderada de factores min-max
   * (menos las penalizaciones). Devuelve un registro POR INDICADOR alineado a la
   * entrada con score, cobertura, estado, contribuciones y factores ausentes.
   *
   * Config:
   *   factors:  [{ key, indicator, kind:"minmax"|"penalty", sign?:1|-1 }]
   *   weights:  { <factor.key>: number }   (solo pesos positivos están activos)
   *   baseMetric?: string  → indicador requerido para entrar al conjunto puntuado
   *   keyField?:  string   → campo de identidad del indicador (default "codi")
   *
   * Una zona sin `baseMetric` utilizable sale con status `missing_base`. Pura;
   * nunca lanza ni produce NaN.
   *
   * @param {ReadonlyArray<Record<string, unknown>>} indicators
   * @param {Record<string, number>} weights
   * @param {{factors:Array, baseMetric?:string, keyField?:string, minCoverage?:number}} cfg
   */
  function computeScores(indicators, weights, cfg) {
    const list = Array.isArray(indicators) ? indicators : [];
    const w = weights || {};
    const factors = (cfg && Array.isArray(cfg.factors) ? cfg.factors : []).filter(
      (f) => f && f.key,
    );
    const keyField = (cfg && cfg.keyField) || "codi";
    const baseMetric = cfg && cfg.baseMetric;
    const minCoverage = clamp(finiteNumber(cfg && cfg.minCoverage) || 0, 0, 1);
    const weightsByFactor = new Map(factors.map((factor) => [factor.key, activeWeight(w[factor.key])]));
    const totalActiveWeight = factors.reduce(
      (total, factor) => total + weightsByFactor.get(factor.key),
      0,
    );

    // Conjunto puntuado: si hay baseMetric, solo los que la tengan utilizable.
    const scoredIdx = [];
    list.forEach((ind, i) => {
      if (!baseMetric || hasValue(ind, baseMetric)) scoredIdx.push(i);
    });

    // Normaliza cada factor "minmax" sobre el conjunto puntuado.
    const normByFactor = new Map();
    for (const f of factors) {
      if (f.kind === "penalty") continue;
      const col = scoredIdx.map((i) => {
        const ind = list[i];
        const v = ind ? ind[f.indicator] : null;
        return v == null ? null : v;
      });
      normByFactor.set(f.key, minmax(col));
    }

    // Contribución y cobertura de cada factor en el espacio de score_raw.
    const evaluated = scoredIdx.map((i, k) => {
      const ind = list[i];
      const contributions = {};
      const missingFactors = [];
      let availableWeight = 0;
      let total = 0;
      for (const f of factors) {
        const weight = weightsByFactor.get(f.key);
        if (weight === 0) {
          contributions[f.key] = 0;
          continue;
        }
        const normalizedValue = f.kind === "penalty" ? null : normByFactor.get(f.key)[k];
        const value = factorValue(ind, f, normalizedValue);
        if (value == null) {
          contributions[f.key] = null;
          missingFactors.push(f.key);
          continue;
        }
        const contribution = f.kind === "penalty"
          ? -weight * value
          : (f.sign === -1 ? -1 : 1) * weight * value;
        contributions[f.key] = contribution;
        availableWeight += weight;
        total += contribution;
      }
      const coverage = totalActiveWeight === 0 ? 0 : availableWeight / totalActiveWeight;
      const available = totalActiveWeight > 0 && coverage >= minCoverage;
      return {
        contributions,
        missingFactors,
        coverage,
        raw: available ? total / availableWeight : null,
        status: available ? SCORE_STATUS.AVAILABLE : SCORE_STATUS.INSUFFICIENT_COVERAGE,
      };
    });

    const raws = evaluated.map((item) => item.raw);
    const nScore = minmax(raws);

    const posByIndex = new Map();
    scoredIdx.forEach((i, k) => posByIndex.set(i, k));
    return list.map((ind, i) => {
      const key = ind && ind[keyField] != null ? ind[keyField] : null;
      if (!posByIndex.has(i)) {
        return {
          key,
          score: null,
          scoreN: null,
          coverage: null,
          status: SCORE_STATUS.MISSING_BASE,
          contributions: null,
          missingFactors: [],
        };
      }
      const k = posByIndex.get(i);
      const item = evaluated[k];
      const sN = nScore[k];
      return {
        key,
        score: sN == null ? null : Math.round(sN * 100),
        scoreN: sN,
        coverage: item.coverage,
        status: item.status,
        contributions: item.contributions,
        missingFactors: item.missingFactors,
      };
    });
  }

  function explainScore(result, weights) {
    const contributions = result && result.contributions;
    const activeKeys = new Set(
      Object.keys(weights || {}).filter((key) => activeWeight(weights[key]) > 0),
    );
    return {
      status: result?.status || SCORE_STATUS.INSUFFICIENT_COVERAGE,
      coverage: result?.coverage ?? null,
      presentFactors: contributions
        ? Object.keys(contributions).filter(
          (key) => activeKeys.has(key) && contributions[key] != null,
        )
        : [],
      missingFactors: Array.isArray(result?.missingFactors) ? [...result.missingFactors] : [],
    };
  }

  return { SCORE_STATUS, minmax, computeScores, explainScore };
});
