/* =====================================================================
   Self Service Map · adapters/domain — HOOKS de dominio (opcionales)
   =====================================================================
   Puntos de extensión para lo que la config declarativa no expresa. El agente
   los implementa cuando el prompt del usuario lo requiere; por defecto son
   identidades inertes (el framework funciona sin tocarlos).

   - derive(indicator, config) -> indicator
       Calcula métricas DERIVADAS por registro antes del join/scoring.
       Ejemplo (invest-map): rendiment = (lloguer*12)/venda*100, null si no hay
       venta fiable (un hueco NUNCA se fabrica).

   - simulate(params, config) -> result
       Simulador de dominio bajo demanda en el panel de detalle.
       Ejemplo (invest-map): compra-para-alquilar → {precio, rendiment_net, ...}.

   Mantén estas funciones PURAS (sin DOM/red) para que sean testables. Patrón
   UMD como el engine: CommonJS para Vitest + `SSM.adapters` en el navegador.
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.SSM || (root.SSM = {});
  g.adapters = Object.assign(g.adapters || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * Hook de derivación por defecto: identidad (no añade métricas). Reimplementa
   * para calcular indicadores derivados. Debe preservar los huecos (`null`) y no
   * mutar la entrada.
   * @param {Record<string, unknown>} indicator
   * @param {object} [config]
   * @returns {Record<string, unknown>}
   */
  function derive(indicator, config) {
    return indicator;
  }

  /**
   * Hook de simulación por defecto: sin simulador. Reimplementa para devolver el
   * resultado de un cálculo de dominio a partir de los parámetros de la UI.
   * @param {Record<string, unknown>} params
   * @param {object} [config]
   * @returns {null}
   */
  function simulate(params, config) {
    return null;
  }

  return { derive, simulate };
});
