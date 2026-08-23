/* =====================================================================
   Tesela · engine/search — búsqueda pura y estable de zonas
   ===================================================================== */
(function (root, factory) {
  const api = factory(
    typeof require === "function"
      ? require("./join.js")
      : ((root.Tesela || root.SSM) && (root.Tesela || root.SSM).engine),
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = g;
  g.engine = Object.assign(g.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function (names) {
  "use strict";

  function finiteScore(value) {
    if (value == null || typeof value === "boolean") return null;
    if (typeof value === "string" && value.trim() === "") return null;
    try {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    } catch {
      return null;
    }
  }

  function collatorFor(locale) {
    try {
      return new Intl.Collator(locale || "en", { sensitivity: "base" });
    } catch {
      return new Intl.Collator("en", { sensitivity: "base" });
    }
  }

  function searchZones(zones, query, options) {
    const opts = options || {};
    const nameFor = typeof opts.nameFor === "function" ? opts.nameFor : (zone) => zone?.name ?? "";
    const scoreFor = typeof opts.scoreFor === "function" ? opts.scoreFor : () => null;
    const keyFor = typeof opts.keyFor === "function" ? opts.keyFor : (zone) => zone?.key;
    const normalize = names && typeof names.normalizeName === "function"
      ? names.normalizeName
      : (value) => String(value ?? "").trim().toLowerCase();
    const normalizedQuery = normalize(query, opts.normalization);
    const collator = collatorFor(opts.locale);

    return (Array.isArray(zones) ? zones : [])
      .map((zone, index) => {
        const name = String(nameFor(zone) ?? "");
        return {
          zone,
          index,
          name,
          normalizedName: normalize(name, opts.normalization),
          score: finiteScore(scoreFor(zone)),
          key: String(keyFor(zone) ?? ""),
        };
      })
      .filter((item) => !normalizedQuery || item.normalizedName.includes(normalizedQuery))
      .sort((left, right) => {
        if (normalizedQuery) {
          const leftStarts = left.normalizedName.startsWith(normalizedQuery);
          const rightStarts = right.normalizedName.startsWith(normalizedQuery);
          if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
        }
        if (left.score !== right.score) {
          if (left.score == null) return 1;
          if (right.score == null) return -1;
          return right.score - left.score;
        }
        const byName = collator.compare(left.name, right.name);
        if (byName) return byName;
        if (left.key !== right.key) return left.key < right.key ? -1 : 1;
        return left.index - right.index;
      })
      .map((item) => item.zone);
  }

  return { searchZones };
});
