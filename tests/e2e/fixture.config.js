(function (root) {
  root.TESELA_CONFIG = {
    branding: {
      title: "Tesela E2E",
      subtitle: "Static interactive map",
      accent: "#5eead4",
      dataNamespace: "TESELA_DATA",
    },
    ui: {
      locale: "en",
      search: { enabled: true, limit: 4, maxZoom: 12 },
      labels: {
        zones: "zones",
        withData: "with data",
        index: "Index",
        searchLabel: "Search zones",
        searchPlaceholder: "Search…",
        searchNoResults: "No zones found.",
        searchResultCount: "{count} matches",
      },
    },
    mounts: { rail: "ssm-rail", map: "ssm-map", detail: "ssm-detail", glossary: "ssm-glossary" },
    map: {
      center: [1, 1],
      zoom: 8,
      tiles: { url: "fixture://base", attribution: "Fixture" },
      selection: { enabled: true },
      labels: { enabled: false },
      overlays: [{
        id: "context",
        label: "Context layer",
        type: "tile",
        enabled: true,
        url: "fixture://context",
      }],
      layerControl: { enabled: true },
    },
    join: {
      property: "ID",
      keyField: "id",
      type: "string",
      nameProperty: "NAME",
      nameField: "name",
    },
    indicators: [
      { key: "value", label: "Value", format: "number" },
      { key: "quality", label: "Quality", format: "number" },
    ],
    color: {
      metric: "score",
      ramp: [[20, 46, 74], [60, 166, 150], [219, 77, 109]],
    },
    scoring: {
      keyField: "id",
      minCoverage: 0.5,
      factors: [
        { key: "value", indicator: "value", kind: "minmax", sign: 1, defaultWeight: 1 },
        { key: "quality", indicator: "quality", kind: "minmax", sign: 1, defaultWeight: 1 },
      ],
      presets: [
        { id: "balanced", label: "Balanced", weights: { value: 1, quality: 1 } },
        { id: "quality", label: "Quality first", weights: { value: 0, quality: 1 } },
      ],
      defaultPreset: "balanced",
    },
    detail: {
      closeLabel: "Close detail",
      glossary: {
        enabled: true,
        triggerLabel: "Indicator guide",
        title: "Definitions",
        closeLabel: "Close guide",
      },
      notices: ["Fixture notice"],
      fields: [
        { key: "value", label: "Value", section: "Metrics", format: "number", help: "Measured value." },
        { key: "quality", label: "Quality", format: "number", help: "Quality value." },
      ],
      providers: [{
        id: "fixture-provider",
        cacheKey: (context) => context.zone.key,
        load: async (context, { signal }) => {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 80);
            signal.addEventListener("abort", () => {
              clearTimeout(timer);
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          });
          return [{ label: `Remote ${context.zone.name}` }];
        },
        renderItem: (document, item) => {
          const element = document.createElement("article");
          element.className = "fixture-provider-item";
          element.textContent = item.label;
          return element;
        },
        ui: {
          label: "Remote content",
          loading: "Loading remote…",
          empty: "No remote content.",
          error: "Remote failed.",
        },
      }],
    },
    methodology: {
      enabled: true,
      label: "Data and methodology",
      summary: "Deterministic browser fixture.",
      steps: ["Load static data", "Join by key"],
    },
    extensions: { slots: {} },
  };
  root.SSM_CONFIG = root.TESELA_CONFIG;
})(window);
