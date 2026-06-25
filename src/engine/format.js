/* =====================================================================
   Self Service Map · engine/format — formateo de valores para la UI
   =====================================================================
   Funciones PURAS de presentación: number/percent/plain con coma decimal y
   marcador de "sin dato" para los HUECOS de dominio (null/NaN). No tocan el DOM.

   Patrón UMD ligero: se exporta en CommonJS (Vitest) y se cuelga del namespace
   global `SSM.engine` en el navegador (sin build, funciona bajo file://).
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.SSM || (root.SSM = {});
  g.engine = Object.assign(g.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** ¿Es `value` un número finito utilizable (no null/NaN/∞)? */
  function isNum(value) {
    return value != null && Number.isFinite(Number(value));
  }

  /**
   * Formatea un número con `decimals` decimales y coma decimal (locale es-ES por
   * defecto). Un valor null/NaN se lee como `sinDato`, NUNCA como 0 (los huecos
   * de dominio no se fabrican). Nunca lanza.
   * @param {number|null|undefined} value
   * @param {{decimals?:number, sinDato?:string, unit?:string}} [opts]
   * @returns {string}
   */
  function formatNumber(value, opts) {
    const o = opts || {};
    const sinDato = o.sinDato != null ? o.sinDato : "sin dato";
    if (!isNum(value)) return sinDato;
    const decimals = o.decimals != null ? o.decimals : 0;
    const text = Number(value).toFixed(decimals).replace(".", ",");
    return o.unit ? `${text} ${o.unit}` : text;
  }

  /**
   * Formatea un valor como porcentaje "X,X%" (1 decimal por defecto). Un valor
   * null/NaN se lee como `sinDato`. Nunca lanza.
   * @param {number|null|undefined} value
   * @param {{decimals?:number, sinDato?:string}} [opts]
   * @returns {string}
   */
  function formatPercent(value, opts) {
    const o = opts || {};
    const sinDato = o.sinDato != null ? o.sinDato : "sin dato";
    if (!isNum(value)) return sinDato;
    const decimals = o.decimals != null ? o.decimals : 1;
    return `${Number(value).toFixed(decimals).replace(".", ",")}%`;
  }

  /**
   * Despachador de formato según un descriptor declarativo de la config
   * (`{ format: "number"|"percent"|"plain", decimals?, unit?, sinDato? }`).
   * `plain` devuelve el valor tal cual (string) o el marcador de hueco.
   * @param {unknown} value
   * @param {{format?:string, decimals?:number, unit?:string, sinDato?:string}} [field]
   * @returns {string}
   */
  function formatValue(value, field) {
    const f = field || {};
    const sinDato = f.sinDato != null ? f.sinDato : "sin dato";
    if (f.format === "percent") return formatPercent(value, f);
    if (f.format === "number") return formatNumber(value, f);
    if (value == null || value === "") return sinDato;
    return String(value);
  }

  return { isNum, formatNumber, formatPercent, formatValue };
});
