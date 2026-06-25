/* =====================================================================
   Self Service Map · engine/scoring — score ponderado min-max por factores
   =====================================================================
   Generaliza `computeScores` de quirat/invest-map: en vez de claves hardcodeadas
   (rend/preu/dem o p65/renda/estr/dens) itera los FACTORES declarados en la
   config. Cada factor referencia un indicador y aporta `peso · norm(indicador)`
   (kind "minmax") o resta `peso · flag` (kind "penalty"). Puro: sin DOM/red.

   Invariantes de dominio (heredados de ambos proyectos):
   - `null`/ausente es un HUECO: se EXCLUYE del min-max y aporta 0 (el factor "no
     diferencia"), NUNCA se coacciona a 0 dentro del min-max ni produce NaN.
   - Si la config define `baseMetric`, una zona sin esa métrica utilizable sale
     con `score=null` (excluida del coloreo y del ranking); nunca se le fabrica.
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.SSM || (root.SSM = {});
  g.engine = Object.assign(g.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
      const n = x == null ? NaN : Number(x);
      if (!Number.isFinite(n)) continue;
      if (n < lo) lo = n;
      if (n > hi) hi = n;
    }
    const hasRange = lo !== Infinity;
    const span = hi - lo;
    return arr.map((x) => {
      const n = x == null ? NaN : Number(x);
      if (!Number.isFinite(n)) return null;
      if (!hasRange || span === 0) return 0.5;
      return clamp((n - lo) / span, 0, 1);
    });
  }

  // ¿Tiene el indicador un valor numérico utilizable en `key`?
  function hasValue(ind, key) {
    if (ind == null || typeof ind !== "object") return false;
    const v = ind[key];
    return v != null && Number.isFinite(Number(v));
  }

  const numOr0 = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  };

  /**
   * Puntúa una lista de indicadores con la suma ponderada de factores min-max
   * (menos las penalizaciones). Devuelve un registro POR INDICADOR alineado a la
   * entrada: `{ key, score, scoreN, contributions }`, donde `contributions`
   * desglosa cada factor en el espacio del score_raw.
   *
   * Config:
   *   factors:  [{ key, indicator, kind:"minmax"|"penalty", sign?:1|-1 }]
   *   weights:  { <factor.key>: number }   (pesos actuales de la UI)
   *   baseMetric?: string  → indicador requerido para entrar al conjunto puntuado
   *   keyField?:  string   → campo de identidad del indicador (default "codi")
   *
   * Una zona sin `baseMetric` utilizable sale con score/scoreN/contributions
   * = null. Pura; nunca lanza ni produce NaN.
   *
   * @param {ReadonlyArray<Record<string, unknown>>} indicators
   * @param {Record<string, number>} weights
   * @param {{factors:Array, baseMetric?:string, keyField?:string}} cfg
   */
  function computeScores(indicators, weights, cfg) {
    const list = Array.isArray(indicators) ? indicators : [];
    const w = weights || {};
    const factors = (cfg && Array.isArray(cfg.factors) ? cfg.factors : []).filter(
      (f) => f && f.key,
    );
    const keyField = (cfg && cfg.keyField) || "codi";
    const baseMetric = cfg && cfg.baseMetric;

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

    // Contribución de cada factor en el espacio de score_raw.
    const contribs = scoredIdx.map((i, k) => {
      const ind = list[i];
      const c = {};
      for (const f of factors) {
        const weight = numOr0(w[f.key]);
        if (f.kind === "penalty") {
          // Penalización: peso · flag (0/1), SIEMPRE resta.
          const flag = ind && ind[f.indicator] ? 1 : 0;
          c[f.key] = -(Math.abs(weight) * flag);
        } else {
          const sign = f.sign === -1 ? -1 : 1;
          const norm = normByFactor.get(f.key)[k];
          c[f.key] = sign * weight * (norm == null ? 0 : norm);
        }
      }
      return c;
    });

    const raws = contribs.map((c) =>
      Object.keys(c).reduce((acc, key) => acc + c[key], 0),
    );
    const nScore = minmax(raws);

    const posByIndex = new Map();
    scoredIdx.forEach((i, k) => posByIndex.set(i, k));
    return list.map((ind, i) => {
      const key = ind && ind[keyField] != null ? ind[keyField] : null;
      if (!posByIndex.has(i)) {
        return { key, score: null, scoreN: null, contributions: null };
      }
      const k = posByIndex.get(i);
      const sN = nScore[k] == null ? 0.5 : nScore[k];
      return {
        key,
        score: Math.round(sN * 100),
        scoreN: sN,
        contributions: contribs[k],
      };
    });
  }

  return { minmax, computeScores };
});
