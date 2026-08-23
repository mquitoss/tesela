/* =====================================================================
   Tesela · engine/join — join PURO indicadores ↔ geometría
   =====================================================================
   Generaliza el join de quirat/invest-map: une cada feature GeoJSON con su
   registro de indicador por una CLAVE CANÓNICA configurable (p. ej. BARRI o
   CUSEC) y, opcionalmente, por NOMBRE normalizado como fallback. No muta la
   entrada, nunca lanza, no toca el DOM.

   Invariante de dominio: un indicador con valores `null` se CONSERVA tal cual
   (los huecos son de primera clase); el join nunca fabrica datos.
   ===================================================================== */
(function (root, factory) {
  const api = factory(
    typeof require === "function"
      ? require("./geo.js")
      : ((root.Tesela || root.SSM) && (root.Tesela || root.SSM).engine),
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = g;
  g.engine = Object.assign(g.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function (geo) {
  "use strict";

  const REGEX_COMBINING = /[̀-ͯ]/g;
  const REGEX_ESPACIOS = /\s+/g;
  // Artículos iniciales a descartar (longest-first para consumir els/les antes
  // que el/la). `\s*` admite el apóstrofo de `l'` sin espacio.
  const LEGACY_ARTICLES = ["els", "les", "el", "la", "l'"];

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Normaliza un nombre para el join por nombre (fallback): minúsculas, sin
   * acentos y con espacios colapsados. Los artículos son configurables; por
   * compatibilidad se usa la lista catalana histórica si no se indica otra.
   * @param {unknown} value
   * @param {{removeArticles?:boolean, articles?:string[]}} [options]
   * @returns {string}
   */
  function normalizeName(value, options) {
    const opts = options || {};
    const sinAcentos = (value == null ? "" : String(value))
      .normalize("NFKD")
      .replace(REGEX_COMBINING, "");
    const colapsado = sinAcentos.toLowerCase().trim().replace(REGEX_ESPACIOS, " ");
    if (opts.removeArticles === false) return colapsado;
    const articles = Array.isArray(opts.articles) ? opts.articles : LEGACY_ARTICLES;
    if (!articles.length) return colapsado;
    const pattern = articles
      .map((article) => normalizeName(article, { removeArticles: false }))
      .filter(Boolean)
      .sort((left, right) => right.length - left.length)
      .map(escapeRegex)
      .join("|");
    return pattern ? colapsado.replace(new RegExp(`^(?:${pattern})\\s*`), "").trim() : colapsado;
  }

  // Clave de un indicador según el tipo de join (number → Number, si no String).
  function indicatorKey(value, type) {
    if (value == null) return null;
    if (type === "number") {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return String(value);
  }

  /**
   * Índices de búsqueda de los indicadores: por clave canónica (`keyField`) y por
   * nombre normalizado (`nameField`). El índice de nombre solo se construye si se
   * pide fallback. Pura.
   * @param {Array<Record<string, unknown>>} indicators
   * @param {{keyField:string, type?:string, nameField?:string, nameFallback?:boolean}} cfg
   */
  function indexIndicators(indicators, cfg) {
    const byKey = new Map();
    const byName = new Map();
    const duplicateKeys = new Set();
    const duplicateNames = new Set();
    const keyField = cfg.keyField;
    const nameField = cfg.nameField || "nom";
    for (const entry of indicators || []) {
      if (!entry) continue;
      const k = indicatorKey(entry[keyField], cfg.type);
      if (k != null) {
        if (byKey.has(k)) duplicateKeys.add(k);
        else byKey.set(k, entry);
      }
      if (cfg.nameFallback && entry[nameField] != null) {
        const normalized = normalizeName(entry[nameField], cfg.nameNormalization);
        if (!normalized) continue;
        if (byName.has(normalized)) duplicateNames.add(normalized);
        else byName.set(normalized, entry);
      }
    }
    return { byKey, byName, duplicateKeys: [...duplicateKeys], duplicateNames: [...duplicateNames] };
  }

  /**
   * Join PURO de indicadores sobre la geometría. Para cada feature construye una
   * zona `{ key, name, feature, ind }` resolviendo su indicador por la clave
   * canónica (primario) y, si no hay y `nameFallback`, por nombre normalizado.
   *
   * Devuelve `{ zones, matched, unmatched, usedNameFallback }`. No muta la
   * entrada y nunca lanza. Una zona sin match queda con `ind: null`.
   *
   * @param {{features?:Array}|null|undefined} geojson
   * @param {Array<Record<string, unknown>>} indicators
   * @param {{property:string, type?:string, nameProperty?:string, nameField?:string,
   *          keyField?:string, nameFallback?:boolean}} joinCfg
   */
  function joinByKey(geojson, indicators, joinCfg) {
    const cfg = joinCfg || {};
    const features =
      geojson && Array.isArray(geojson.features) ? geojson.features : [];
    const index = indexIndicators(indicators, {
      keyField: cfg.keyField || cfg.property,
      type: cfg.type,
      nameField: cfg.nameField,
      nameFallback: cfg.nameFallback,
      nameNormalization: cfg.nameNormalization,
    });
    let matched = 0;
    let usedNameFallback = 0;
    const zones = features.map((feature) => {
      const key = geo.keyFromFeature(feature, cfg.property, cfg.type);
      const name = geo.nameFromFeature(feature, cfg.nameProperty);
      let entry = key != null ? index.byKey.get(key) : undefined;
      let viaName = false;
      if (!entry && cfg.nameFallback) {
        entry = index.byName.get(normalizeName(name, cfg.nameNormalization));
        viaName = Boolean(entry);
      }
      const ind = entry || null;
      if (ind) {
        matched += 1;
        if (viaName) usedNameFallback += 1;
      }
      return { key, name, feature, ind };
    });
    return {
      zones,
      matched,
      unmatched: zones.length - matched,
      usedNameFallback,
      duplicateIndicatorKeys: index.duplicateKeys,
      duplicateIndicatorNames: index.duplicateNames,
    };
  }

  return { normalizeName, indexIndicators, joinByKey };
});
