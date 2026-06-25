/* =====================================================================
   Self Service Map · engine/color — rampa coroplética configurable
   =====================================================================
   Rampa de color definida por la config (`config.color.ramp`: lista de paradas
   [r,g,b]). `colorForValue` mapea un valor a un color RELATIVO a una extensión
   [min,max]; un valor null/NaN devuelve null para que el llamador aplique el
   estilo "sin dato" (los huecos NUNCA se pintan como el mínimo). Puro.
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.SSM || (root.SSM = {});
  g.engine = Object.assign(g.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Rampa por defecto frío→cálido (se usa si la config no aporta una).
  const DEFAULT_RAMP = [
    [20, 46, 74],
    [31, 107, 128],
    [60, 166, 150],
    [224, 122, 95],
    [219, 77, 109],
  ];

  function normalizeRamp(ramp) {
    const r = Array.isArray(ramp) && ramp.length >= 2 ? ramp : DEFAULT_RAMP;
    return r;
  }

  /**
   * Color `rgb(...)` de la rampa para t en [0,1] (se recorta). Interpola entre
   * las paradas de `ramp` (o la rampa por defecto). Pura.
   * @param {number} t
   * @param {ReadonlyArray<[number,number,number]>} [ramp]
   * @returns {string}
   */
  function rampColor(t, ramp) {
    const stops = normalizeRamp(ramp);
    const clamped = clamp(Number.isFinite(t) ? t : 0, 0, 1);
    const seg = clamped * (stops.length - 1);
    const i = Math.floor(seg);
    const f = seg - i;
    const a = stops[i];
    const b = stops[Math.min(i + 1, stops.length - 1)];
    const r = Math.round(lerp(a[0], b[0], f));
    const g = Math.round(lerp(a[1], b[1], f));
    const bl = Math.round(lerp(a[2], b[2], f));
    return `rgb(${r},${g},${bl})`;
  }

  /**
   * Extensión [min, max] de una métrica sobre las zonas CON dato. Las zonas cuyo
   * valor (vía `getValue`) es null/NaN se EXCLUYEN. Si no hay ninguna con dato
   * devuelve `{min:0, max:0}`.
   * @param {ReadonlyArray} zones
   * @param {(zone:any)=>number|null|undefined} getValue
   * @returns {{min:number, max:number}}
   */
  function extent(zones, getValue) {
    let min = Infinity;
    let max = -Infinity;
    for (const zone of zones || []) {
      const raw = getValue(zone);
      if (raw == null || !Number.isFinite(Number(raw))) continue;
      const v = Number(raw);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === Infinity) return { min: 0, max: 0 };
    return { min, max };
  }

  /**
   * Color coroplético de un valor según su posición RELATIVA en `ext` [min,max].
   * Un valor null/NaN devuelve null (el llamador aplica el estilo "sin dato";
   * los huecos nunca se pintan como mínimo). Pura.
   * @param {unknown} value
   * @param {{min:number, max:number}} ext
   * @param {ReadonlyArray<[number,number,number]>} [ramp]
   * @returns {string|null}
   */
  function colorForValue(value, ext, ramp) {
    if (value == null || !Number.isFinite(Number(value))) return null;
    const v = Number(value);
    const span = ext.max - ext.min;
    const t = span > 0 ? (v - ext.min) / span : 0.5;
    return rampColor(t, ramp);
  }

  return { DEFAULT_RAMP, rampColor, extent, colorForValue };
});
