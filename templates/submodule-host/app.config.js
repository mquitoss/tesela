(function (root) {
  "use strict";
  const config = {
    branding: {
      title: "Mi mapa Tesela",
      subtitle: "Proyecto host de ejemplo",
      version: "0.1.0",
      accent: "#5eead4",
      dataNamespace: "TESELA_DATA",
    },
    ui: {
      locale: "es-ES",
      search: { enabled: true, limit: 8, maxZoom: 12 },
      booleanLabels: { true: "Sí", false: "No" },
      durationLabels: { hour: "h", minute: "min" },
      labels: {
        noData: "sin dato",
        searchLabel: "Buscar zona",
        searchPlaceholder: "Buscar zona…",
        searchNoResults: "No se han encontrado zonas.",
        searchResultCount: "{count} coincidencias",
      },
    },
    mounts: {
      rail: "map-controls",
      map: "map",
      detail: "map-detail",
      glossary: "map-glossary",
    },
    map: {
      center: [41.5, 2],
      zoom: 8,
      tiles: {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "&copy; OpenStreetMap contributors",
      },
      selection: { enabled: true },
      labels: { enabled: true, label: "Nombres de zonas", minZoom: 10 },
      layerControl: { enabled: true, position: "topright", collapsed: true },
    },
    join: { property: "ID", keyField: "id", type: "string", nameProperty: "NAME" },
    indicators: [{ key: "value", label: "Valor", format: "number" }],
    color: {
      metric: "value",
      ramp: [[20, 46, 74], [60, 166, 150], [219, 77, 109]],
      noData: { fillColor: "#2a2f33", color: "#3a4046" },
    },
    scoring: { keyField: "id", factors: [], presets: [] },
    detail: {
      closeLabel: "Cerrar detalle",
      glossary: {
        enabled: true,
        triggerLabel: "Guía",
        title: "Definiciones",
        closeLabel: "Cerrar guía",
      },
      fields: [{
        key: "value",
        label: "Valor",
        format: "number",
        section: "Indicadores",
        help: "Descripción del indicador proporcionada por el proyecto host.",
      }],
    },
    extensions: { slots: {} },
  };
  root.TESELA_CONFIG = root.SSM_CONFIG = config;
})(typeof self !== "undefined" ? self : this);
