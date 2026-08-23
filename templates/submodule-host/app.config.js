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
    mounts: { rail: "map-controls", map: "map", detail: "map-detail" },
    map: {
      center: [41.5, 2],
      zoom: 8,
      tiles: {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "&copy; OpenStreetMap contributors",
      },
    },
    join: { property: "ID", keyField: "id", type: "string", nameProperty: "NAME" },
    indicators: [{ key: "value", label: "Valor", format: "number" }],
    color: {
      metric: "value",
      ramp: [[20, 46, 74], [60, 166, 150], [219, 77, 109]],
      noData: { fillColor: "#2a2f33", color: "#3a4046" },
    },
    scoring: { keyField: "id", factors: [], presets: [] },
    detail: { fields: [{ key: "value", label: "Valor", format: "number" }] },
    extensions: { slots: {} },
  };
  root.TESELA_CONFIG = root.SSM_CONFIG = config;
})(typeof self !== "undefined" ? self : this);
