/* =====================================================================
   Self Service Map · engine/bundle — validación, fuentes y multi-nivel
   =====================================================================
   Adopción del bundle offline (`window.SSM_DATA = {geo, indicators, meta, levels?}`):
   validación de forma, escalera de fuentes (embedded → url → upload) y soporte
   multi-nivel opcional (`availableLevels`/`getLevel`). Puro: sin DOM/red.
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.SSM || (root.SSM = {});
  g.engine = Object.assign(g.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * ¿Es `bundle` una forma válida? Exige geo (FeatureCollection con features no
   * vacío) e indicators (array no vacío). `meta` es opcional. Nunca lanza.
   * @param {unknown} bundle
   * @returns {boolean}
   */
  function isValidBundle(bundle) {
    if (!bundle || typeof bundle !== "object") return false;
    const geo = bundle.geo;
    const indicators = bundle.indicators;
    const geoOk =
      !!geo &&
      typeof geo === "object" &&
      geo.type === "FeatureCollection" &&
      Array.isArray(geo.features) &&
      geo.features.length > 0;
    const indOk = Array.isArray(indicators) && indicators.length > 0;
    return geoOk && indOk;
  }

  function pickBundle(bundle) {
    return {
      geo: bundle.geo,
      indicators: bundle.indicators,
      meta: bundle.meta || {},
      levels: bundle.levels,
    };
  }

  /**
   * Escalera de fuentes: elige la PRIMERA válida en orden embedded → url →
   * upload y devuelve `{ source, bundle }` normalizado, o `{source:"none",
   * bundle:null}` si ninguna es válida. Pura; nunca lanza ni hace red/IO.
   * @param {{embedded?:unknown, url?:unknown, upload?:unknown}} [candidates]
   */
  function selectDataSource(candidates) {
    const c = candidates || {};
    const ladder = [
      { source: "embedded", bundle: c.embedded },
      { source: "url", bundle: c.url },
      { source: "upload", bundle: c.upload },
    ];
    for (const step of ladder) {
      if (isValidBundle(step.bundle)) {
        return { source: step.source, bundle: pickBundle(step.bundle) };
      }
    }
    return { source: "none", bundle: null };
  }

  /**
   * Lista los niveles disponibles en orden de presentación. Sin `levels` →
   * `["default"]`. Con `levels` objeto → los ids presentes respetando el orden
   * de `preferred` primero. Pura.
   * @param {unknown} bundle
   * @param {string[]} [preferred]
   * @returns {string[]}
   */
  function availableLevels(bundle, preferred) {
    const levels = bundle && typeof bundle === "object" ? bundle.levels : null;
    if (!levels || typeof levels !== "object") return ["default"];
    const order = Array.isArray(preferred) ? preferred.slice() : [];
    const present = order.filter(
      (id) => levels[id] && typeof levels[id] === "object",
    );
    for (const id of Object.keys(levels)) {
      if (!present.includes(id) && levels[id] && typeof levels[id] === "object") {
        present.push(id);
      }
    }
    return present.length > 0 ? present : ["default"];
  }

  /**
   * Devuelve `{geo, indicators}` del nivel pedido. Bundle multinivel → el
   * contenido de `levels[levelId]` (con fallback al primer nivel disponible si
   * falta). Bundle single-level → siempre `{geo, indicators}` del nivel superior.
   * Devuelve null si no hay nada usable. Nunca lanza.
   * @param {unknown} bundle
   * @param {string} levelId
   * @returns {{geo:object, indicators:Array}|null}
   */
  function getLevel(bundle, levelId) {
    if (!bundle || typeof bundle !== "object") return null;
    const levels = bundle.levels;
    if (levels && typeof levels === "object") {
      const lv = levels[levelId];
      if (lv && typeof lv === "object") {
        return { geo: lv.geo, indicators: lv.indicators };
      }
      const firstId = Object.keys(levels).find(
        (id) => levels[id] && typeof levels[id] === "object",
      );
      if (firstId) {
        return { geo: levels[firstId].geo, indicators: levels[firstId].indicators };
      }
      return null;
    }
    if (bundle.geo || bundle.indicators) {
      return { geo: bundle.geo, indicators: bundle.indicators };
    }
    return null;
  }

  return {
    isValidBundle,
    selectDataSource,
    availableLevels,
    getLevel,
  };
});
