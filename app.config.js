/* =====================================================================
   Tesela · app.config.js — CONFIGURACIÓN DECLARATIVA
   =====================================================================
   ESTE es el archivo que un agente edita para personalizar el mapa desde un
   prompt del usuario. Define TODO lo específico del dominio: marca, mapa,
   clave de join, indicadores, rampa de color, factores de scoring/presets y el
   panel de detalle. El engine (src/engine/*) es agnóstico y lee de aquí.

   Ver AGENTS.md para la guía "concepto del prompt → campo de config".

   Esta configuración de ejemplo muestra la DENSIDAD DE POBLACIÓN por barrio de
   Barcelona (dataset neutro incluido de fábrica).
   ===================================================================== */
(function (root) {
  const config = {
    // --- Marca / textos de la cabecera --------------------------------------
    branding: {
      title: "Tesela",
      subtitle: "Densidad de población · Barcelona (ejemplo)",
      accent: "#5EEAD4",
      version: "0.2.0",
      dataNamespace: "TESELA_DATA",
    },

    // --- Textos y controles del shell (localizables por proyecto) -----------
    ui: {
      locale: "es-ES",
      slider: { min: -1, max: 1, step: 0.1 },
      search: { enabled: true, limit: 8, maxZoom: 14 },
      booleanLabels: { true: "Sí", false: "No" },
      durationLabels: { hour: "h", minute: "min" },
      labels: {
        noData: "sin dato",
        index: "Índice",
        zones: "zonas",
        withData: "con dato",
        weightedIndex: "Índice ponderado (relativo)",
        low: "bajo",
        high: "alto",
        searchLabel: "Buscar zona",
        searchPlaceholder: "Buscar zona…",
        searchNoResults: "No se han encontrado zonas.",
        searchResultCount: "{count} coincidencias",
      },
    },

    // Los ids son configurables para incrustar varias apps o usar otro shell.
    mounts: { rail: "ssm-rail", map: "ssm-map", detail: "ssm-detail" },

    // --- Mapa base ----------------------------------------------------------
    map: {
      center: [41.3954, 2.162],
      zoom: 12,
      tiles: {
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
      panes: {
        zones: { name: "tesela-zones", zIndex: 400, pointerEvents: "auto" },
        context: { name: "tesela-context", zIndex: 450, pointerEvents: "none" },
        selection: { name: "tesela-selection", zIndex: 610, pointerEvents: "none" },
        labels: { name: "tesela-labels", zIndex: 620, pointerEvents: "none" },
      },
      selection: { enabled: true, pane: "selection" },
      overlays: [{
        id: "references",
        label: "Referencias cartográficas",
        type: "tile",
        enabled: false,
        pane: "context",
        interactive: false,
        url: "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
        attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      }],
      labels: {
        enabled: true,
        label: "Nombres de zonas (zoom 14+)",
        pane: "labels",
        minZoom: 14,
        boundsPadding: 0.15,
      },
      layerControl: { enabled: true, position: "topright", collapsed: true },
      bbox: [2.05, 41.32, 2.23, 41.47], // [oeste, sur, este, norte]
    },

    // --- Join indicadores ↔ geometría ---------------------------------------
    // `property`: propiedad del feature GeoJSON con la clave canónica.
    // `keyField`: campo homólogo en los registros de indicador.
    join: {
      property: "BARRI",
      keyField: "codi",
      type: "number",
      nameFallback: true,
      nameProperty: "NOM",
      nameField: "nom",
      nameNormalization: { articles: ["els", "les", "el", "la", "l'"] },
    },

    // --- Niveles geográficos (opcional, multi-nivel) ------------------------
    // Para un único nivel basta con dejar `levels: null` y usar `join` arriba.
    levels: null,

    // --- Esquema de indicadores (un registro = un objeto con estas claves) --
    indicators: [
      { key: "poblacio", label: "Población", format: "number", unit: "hab." },
      { key: "area_km2", label: "Superficie", format: "number", decimals: 2, unit: "km²" },
      {
        key: "densitat",
        label: "Densidad",
        format: "number",
        unit: "hab/km²",
      },
    ],

    // --- Coloreo coroplético -------------------------------------------------
    // `metric`: "score" (índice ponderado) o la clave de un indicador para
    // colorear por su valor crudo. La rampa va de frío (bajo) a cálido (alto).
    color: {
      metric: "densitat",
      ramp: [
        [20, 46, 74],
        [31, 107, 128],
        [60, 166, 150],
        [224, 122, 95],
        [219, 77, 109],
      ],
      noData: { fillColor: "#2a2f33", color: "#3a4046", dashArray: "2,3" },
    },

    // --- Scoring ponderado (factores + presets) -----------------------------
    // Cada factor referencia un indicador. kind "minmax" normaliza y suma
    // sign·peso·norm; kind "penalty" resta peso·flag(0/1). `baseMetric` es el
    // indicador requerido para entrar al ranking (zonas sin él → score null).
    // `minCoverage` exige una proporción mínima de peso con datos disponibles.
    scoring: {
      baseMetric: "densitat",
      keyField: "codi",
      minCoverage: 0.65,
      factors: [
        {
          key: "densidad",
          label: "Densidad",
          indicator: "densitat",
          kind: "minmax",
          sign: 1,
          defaultWeight: 1,
        },
        {
          key: "poblacion",
          label: "Población total",
          indicator: "poblacio",
          kind: "minmax",
          sign: 1,
          defaultWeight: 0.4,
        },
      ],
      presets: [
        { id: "densa", label: "Más densa", weights: { densidad: 1, poblacion: 0.2 } },
        { id: "poblada", label: "Más poblada", weights: { densidad: 0.3, poblacion: 1 } },
        { id: "equilibrio", label: "Equilibrio", weights: { densidad: 0.7, poblacion: 0.7 } },
      ],
      defaultPreset: "densa",
    },

    // --- Panel de detalle (al hacer click en una zona) ----------------------
    detail: {
      fields: [
        { key: "poblacio", label: "Población", format: "number", unit: "hab." },
        { key: "area_km2", label: "Superficie", format: "number", decimals: 2, unit: "km²" },
        { key: "densitat", label: "Densidad", format: "number", unit: "hab/km²" },
      ],
      // simulator: null,  // un dominio con simulador define aquí su descriptor
    },

    // Slots opcionales: sidebar.afterStatus, sidebar.afterControls,
    // detail.beforeFields y detail.afterFields. Cada handler devuelve un nodo
    // DOM, texto o una lista de ambos. La lógica de dominio puede vivir también
    // en `Tesela.adapters.slots`.
    extensions: { slots: {} },
  };

  // API nueva y alias compatible durante toda la serie 0.x.
  root.TESELA_CONFIG = config;
  root.SSM_CONFIG = config;
  if (typeof module !== "undefined" && module.exports) module.exports = config;
})(typeof self !== "undefined" ? self : this);
