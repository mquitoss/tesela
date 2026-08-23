/* =====================================================================
   Tesela · app.js — shell Leaflet/DOM dirigido por configuración
   =====================================================================
   NO contiene lógica de dominio: orquesta `Tesela.engine` y los hooks
   `Tesela.adapters`. Acepta globals `SSM_*` como compatibilidad durante 0.x.
   Vanilla JS, sin build; se carga por <script src> tras el engine y los datos.
   en el navegador (depende de Leaflet `L` y del DOM).
   ===================================================================== */
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  const Tesela = window.Tesela || window.SSM || {};
  window.Tesela = window.SSM = Tesela;
  const runtime = Tesela.runtime || {};
  const E = Tesela.engine || {};
  const A = Tesela.adapters || {};
  const UI = Tesela.ui || {};
  const CONFIG = runtime.resolveConfig
    ? runtime.resolveConfig(window)
    : (window.TESELA_CONFIG || window.SSM_CONFIG || {});
  const mounts = Object.assign(
    { rail: "ssm-rail", map: "ssm-map", detail: "ssm-detail", glossary: "ssm-glossary" },
    CONFIG.mounts || {},
  );
  const ui = CONFIG.ui || {};
  const uiLabels = ui.labels || {};

  const state = {
    zones: [],
    scoresByKey: new Map(),
    weights: {},
    preset: null,
    extent: { min: 0, max: 0 },
    selected: null,
    query: "",
    mapLayers: null,
    detailController: null,
    baseLayer: null,
    refreshSearch: null,
    map: null,
  };

  // ---- utilidades de DOM -----------------------------------------------------
  const mount = (name) => document.getElementById(mounts[name]);
  const label = (key, fallback) => uiLabels[key] != null ? String(uiLabels[key]) : fallback;
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === "class") node.className = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function") {
          node.addEventListener(k.slice(2), attrs[k]);
        } else node.setAttribute(k, attrs[k]);
      }
    }
    for (const c of children || []) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  // ---- datos: bootstrap, derive, join, score --------------------------------
  function readBundle() {
    const resolved = runtime.resolveEmbeddedData
      ? runtime.resolveEmbeddedData(window, CONFIG)
      : {
          data: window[(CONFIG.branding && CONFIG.branding.dataNamespace) || "TESELA_DATA"]
            || window.SSM_DATA,
        };
    const picked = E.selectDataSource({ embedded: resolved.data });
    return picked.bundle;
  }

  function deriveIndicators(indicators) {
    const derive = A.derive || ((x) => x);
    return (indicators || []).map((ind) => derive(ind, CONFIG) || ind);
  }

  function buildZones(bundle) {
    const level = E.getLevel(bundle, "default") || {
      geo: bundle.geo,
      indicators: bundle.indicators,
    };
    const indicators = deriveIndicators(level.indicators);
    const join = CONFIG.join || {};
    const r = E.joinByKey(level.geo, indicators, join);
    return r.zones;
  }

  function defaultWeights() {
    const w = {};
    for (const f of (CONFIG.scoring && CONFIG.scoring.factors) || []) {
      w[f.key] = f.defaultWeight != null ? f.defaultWeight : 1;
    }
    return w;
  }

  function applyPreset(presetId) {
    const presets = (CONFIG.scoring && CONFIG.scoring.presets) || [];
    const p = presets.find((x) => x.id === presetId);
    if (!p) return;
    state.preset = presetId;
    state.weights = Object.assign(defaultWeights(), p.weights);
  }

  function rescore() {
    const indicators = state.zones.map((z) => z.ind).filter(Boolean);
    const scoring = CONFIG.scoring || {};
    if (!Array.isArray(scoring.factors) || scoring.factors.length === 0) {
      state.scoresByKey = new Map();
      state.extent = computeColorExtent();
      return;
    }
    const results = E.computeScores(indicators, state.weights, {
      ...scoring,
      keyField: scoring.keyField || CONFIG.join.keyField,
    });
    state.scoresByKey = new Map(results.map((result) => [String(result.key), result]));
    state.extent = computeColorExtent();
    if (typeof state.refreshSearch === "function") state.refreshSearch();
    refreshSelectedDetail();
  }

  function scoreFor(zone) {
    return state.scoresByKey.get(String(zone.key)) || null;
  }

  function formatField(value, field) {
    return E.formatValue(value, {
      locale: ui.locale || "es-ES",
      sinDato: label("noData", "sin dato"),
      booleanLabels: ui.booleanLabels,
      durationLabels: ui.durationLabels,
      ...field,
    });
  }

  function stateSnapshot() {
    return Object.freeze({
      zones: state.zones.length,
      matched: state.zones.filter((zone) => zone.ind).length,
      weights: Object.freeze({ ...state.weights }),
      preset: state.preset,
      query: state.query,
      selected: state.selected
        ? Object.freeze({ key: state.selected.key, name: state.selected.name })
        : null,
    });
  }

  function appendExtension(container, output) {
    if (Array.isArray(output)) {
      output.forEach((item) => appendExtension(container, item));
    } else if (output && typeof output === "object" && output.nodeType) {
      container.appendChild(output);
    } else if (typeof output === "string") {
      container.appendChild(document.createTextNode(output));
    }
  }

  function renderSlot(container, slotName, extra) {
    if (!container || typeof E.runSlot !== "function") return;
    const context = Object.freeze({ config: CONFIG, state: stateSnapshot(), ...(extra || {}) });
    const result = E.runSlot([CONFIG.extensions && CONFIG.extensions.slots, A.slots], slotName, context);
    result.outputs.forEach((output) => appendExtension(container, output));
    for (const error of result.errors) console.error(`[Tesela] Error en slot ${slotName}`, error);
  }

  // Valor que colorea cada zona según config.color.metric ("score" o indicador).
  function colorValue(zone) {
    const metric = (CONFIG.color && CONFIG.color.metric) || "score";
    if (metric === "score") {
      const r = scoreFor(zone);
      return r && r.status === E.SCORE_STATUS.AVAILABLE ? r.scoreN : null;
    }
    return zone.ind ? zone.ind[metric] : null;
  }

  function computeColorExtent() {
    const metric = (CONFIG.color && CONFIG.color.metric) || "score";
    if (metric === "score") return { min: 0, max: 1 }; // scoreN normalizado
    return E.extent(state.zones, (z) => (z.ind ? z.ind[metric] : null));
  }

  // ---- render Leaflet --------------------------------------------------------
  function styleZone(zone) {
    const ramp = CONFIG.color && CONFIG.color.ramp;
    const value = colorValue(zone);
    const fill = E.colorForValue(value, state.extent, ramp);
    if (fill == null) {
      const nd = (CONFIG.color && CONFIG.color.noData) || {};
      return {
        color: nd.color || "#3a4046",
        weight: 1,
        fillColor: nd.fillColor || "#2a2f33",
        fillOpacity: 0.5,
        dashArray: nd.dashArray || "2,3",
      };
    }
    return { color: "#0a0e10", weight: 1, fillColor: fill, fillOpacity: 0.82 };
  }

  function tooltipFor(zone) {
    const metric = (CONFIG.color && CONFIG.color.metric) || "score";
    let val;
    if (metric === "score") {
      const r = scoreFor(zone);
      val = r && r.status === E.SCORE_STATUS.AVAILABLE
        ? `${r.score}/100`
        : label("noData", "sin dato");
    } else {
      const field = (CONFIG.indicators || []).find((f) => f.key === metric) || {};
      val = formatField(zone.ind ? zone.ind[metric] : null, field);
    }
    return `${zone.name || "—"} · ${val}`;
  }

  function render() {
    state.mapLayers?.refreshZoneStyles();
  }

  // ---- panel de detalle ------------------------------------------------------
  function scoreTextFor(zone) {
    const result = scoreFor(zone);
    return result?.status === E.SCORE_STATUS.AVAILABLE
      ? `${label("index", "Índice")}: ${result.score}/100`
      : null;
  }

  function refreshSelectedDetail() {
    if (!state.selected || !state.detailController) return;
    state.detailController.open({
      zone: state.selected,
      score: scoreFor(state.selected),
      scoreText: scoreTextFor(state.selected),
      focus: false,
      preserveTrigger: true,
    });
  }

  function selectZone(zone, focusDetail, trigger) {
    state.selected = zone;
    state.mapLayers?.setSelection(zone);
    state.detailController?.open({
      zone,
      score: scoreFor(zone),
      scoreText: scoreTextFor(zone),
      focus: focusDetail === true,
      trigger: trigger || null,
    });
  }

  function focusZone(zone, trigger) {
    const search = ui.search || {};
    state.mapLayers?.focusZone(zone, {
      maxZoom: search.maxZoom || 12,
      padding: [20, 20],
    });
    selectZone(zone, true, trigger);
  }

  function buildSearch() {
    const searchConfig = ui.search || {};
    if (searchConfig.enabled === false || typeof E.searchZones !== "function") return null;
    const resultsId = `${mounts.rail}-search-results`;
    const inputId = `${mounts.rail}-search-input`;
    const feedback = el("div", {
      class: "tesela-search-feedback",
      "aria-live": "polite",
    }, []);
    const resultsList = el("div", {
      id: resultsId,
      class: "tesela-search-results",
    }, []);
    let currentResults = [];
    const input = el("input", {
      id: inputId,
      type: "search",
      value: state.query,
      placeholder: label("searchPlaceholder", "Buscar zona…"),
      autocomplete: "off",
      "aria-controls": resultsId,
      oninput: (event) => {
        state.query = event.target.value;
        updateResults();
      },
      onkeydown: (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        state.query = "";
        input.value = "";
        updateResults();
      },
    });
    input.value = state.query;

    function updateResults() {
      resultsList.replaceChildren();
      const query = state.query.trim();
      if (!query) {
        currentResults = [];
        feedback.textContent = "";
        return;
      }
      currentResults = E.searchZones(state.zones, query, {
        nameFor: (zone) => zone.name,
        scoreFor: (zone) => {
          const result = scoreFor(zone);
          return result?.status === E.SCORE_STATUS.AVAILABLE ? result.score : null;
        },
        keyFor: (zone) => zone.key,
        locale: ui.locale,
        normalization: CONFIG.join?.nameNormalization,
      });
      const countLabel = label("searchResultCount", "{count} coincidencias")
        .replace("{count}", String(currentResults.length));
      feedback.textContent = countLabel;
      if (!currentResults.length) {
        resultsList.appendChild(el("p", { class: "tesela-search-empty" }, [
          label("searchNoResults", "No se han encontrado zonas."),
        ]));
        return;
      }
      for (const zone of currentResults.slice(0, searchConfig.limit || 8)) {
        resultsList.appendChild(el("button", {
          type: "button",
          class: "tesela-search-result",
          "aria-controls": mounts.detail,
          "aria-expanded": state.selected?.key === zone.key ? "true" : "false",
          onclick: (event) => focusZone(zone, event.currentTarget || event.target),
        }, [zone.name || label("zoneFallback", "Zona")]));
      }
    }

    const form = el("form", {
      class: "tesela-search",
      role: "search",
      onsubmit: (event) => {
        event.preventDefault();
        if (currentResults[0]) focusZone(currentResults[0], input);
      },
    }, [
      el("label", { class: "tesela-visually-hidden", for: inputId }, [
        label("searchLabel", "Buscar zona"),
      ]),
      input,
      feedback,
      resultsList,
    ]);
    state.refreshSearch = updateResults;
    updateResults();
    return form;
  }

  // ---- consola: presets + sliders + leyenda ----------------------------------
  function buildConsole() {
    const rail = mount("rail");
    if (!rail) return;
    state.refreshSearch = null;
    rail.replaceChildren();

    // Marca
    rail.appendChild(
      el("div", { class: "ssm-brand" }, [
        el("h1", null, [
          (CONFIG.branding && CONFIG.branding.title) || "Tesela",
          CONFIG.branding?.version
            ? el("span", { class: "tesela-version" }, [`v${CONFIG.branding.version}`])
            : null,
        ]),
        el("p", null, [(CONFIG.branding && CONFIG.branding.subtitle) || ""]),
      ]),
    );

    // Estado
    const matched = state.zones.filter((z) => z.ind).length;
    rail.appendChild(
      el("div", { class: "ssm-status" }, [
        `${state.zones.length} ${label("zones", "zonas")} · ${matched} ${label("withData", "con dato")}`,
      ]),
    );
    renderSlot(rail, "sidebar.afterStatus");

    if (typeof UI.renderMethodology === "function") {
      const methodology = UI.renderMethodology(document, CONFIG.methodology);
      if (methodology) rail.appendChild(methodology);
    }

    const search = buildSearch();
    if (search) rail.appendChild(search);

    // Presets
    const presets = (CONFIG.scoring && CONFIG.scoring.presets) || [];
    if (presets.length) {
      const grid = el("div", { class: "ssm-presets" }, []);
      for (const p of presets) {
        grid.appendChild(
          el(
            "button",
            {
              class: "ssm-preset" + (state.preset === p.id ? " active" : ""),
              "data-preset": p.id,
              onclick: () => {
                applyPreset(p.id);
                rescore();
                render();
                buildConsole();
              },
            },
            [p.label || p.id],
          ),
        );
      }
      rail.appendChild(el("div", { class: "ssm-section" }, [grid]));
    }

    // Sliders (uno por factor)
    const factors = (CONFIG.scoring && CONFIG.scoring.factors) || [];
    if (factors.length) {
      const sliders = el("div", { class: "ssm-sliders" }, []);
      const slider = Object.assign({ min: -1, max: 1, step: 0.1 }, ui.slider || {});
      for (const f of factors) {
        const value = state.weights[f.key] != null ? state.weights[f.key] : 0;
        const out = el("span", { class: "ssm-slider-val" }, [value.toFixed(1)]);
        const input = el("input", {
          type: "range",
          min: String(slider.min),
          max: String(slider.max),
          step: String(slider.step),
          value: String(value),
          oninput: (ev) => {
            state.weights[f.key] = Number(ev.target.value);
            state.preset = null;
            out.textContent = Number(ev.target.value).toFixed(1);
            rescore();
            render();
          },
        });
        sliders.appendChild(
          el("label", { class: "ssm-slider" }, [
            el("span", null, [f.label || f.key]),
            input,
            out,
          ]),
        );
      }
      rail.appendChild(el("div", { class: "ssm-section" }, [sliders]));
    }

    renderSlot(rail, "sidebar.afterControls");

    // Leyenda
    rail.appendChild(buildLegend());
  }

  function buildLegend() {
    const ramp = (CONFIG.color && CONFIG.color.ramp) || E.DEFAULT_RAMP;
    const stops = ramp
      .map((c) => `rgb(${c[0]},${c[1]},${c[2]})`)
      .join(", ");
    const metric = (CONFIG.color && CONFIG.color.metric) || "score";
    const metricLabel =
      metric === "score"
        ? label("weightedIndex", "Índice ponderado (relativo)")
        : (CONFIG.indicators || []).find((f) => f.key === metric)?.label || metric;
    return el("div", { class: "ssm-legend" }, [
      el("div", { class: "ssm-legend-label" }, [metricLabel]),
      el("div", {
        class: "ssm-legend-bar",
        style: `background:linear-gradient(90deg, ${stops});`,
      }),
      el("div", { class: "ssm-legend-ends" }, [
        el("span", null, [label("low", "bajo")]),
        el("span", null, [label("high", "alto")]),
      ]),
    ]);
  }

  // ---- arranque --------------------------------------------------------------
  function bootstrap() {
    const validation = typeof E.validateConfig === "function"
      ? E.validateConfig(CONFIG)
      : { valid: true, errors: [] };
    if (!validation.valid) {
      showStartupError([
        label("invalidConfig", "Configuración Tesela inválida."),
        ...validation.errors,
      ]);
      return;
    }
    const bundle = readBundle();
    if (!bundle) {
      const namespace = (CONFIG.branding && CONFIG.branding.dataNamespace) || "TESELA_DATA";
      showStartupError([
        `${label("missingData", "No hay datos válidos en")} window.${namespace}.`,
        label("buildHint", "Ejecuta python scripts/build_data.py."),
      ]);
      return;
    }
    state.zones = buildZones(bundle);
    if (typeof UI.createDetailController !== "function") {
      showStartupError([label("missingDetail", "Falta el componente de detalle de Tesela.")]);
      return;
    }
    if (!mount("detail") || (CONFIG.detail?.glossary?.enabled !== false
      && CONFIG.detail?.glossary && !mount("glossary"))) {
      showStartupError([label("missingDetailMount", "Falta un contenedor de detalle o glosario.")]);
      return;
    }
    state.detailController = UI.createDetailController({
      document,
      detailElement: mount("detail"),
      glossaryElement: mount("glossary"),
      detailConfig: {
        ...(CONFIG.detail || {}),
        fields: CONFIG.detail?.fields || CONFIG.indicators || [],
      },
      formatValue: formatField,
      labels: { zoneFallback: label("zoneFallback", "Zona") },
      beforeFields: (container, payload) => renderSlot(container, "detail.beforeFields", payload),
      afterFields: (container, payload) => renderSlot(container, "detail.afterFields", payload),
      onClose: () => {
        state.selected = null;
        state.mapLayers?.setSelection(null);
        if (typeof state.refreshSearch === "function") state.refreshSearch();
      },
    });
    if (CONFIG.branding?.accent && document.documentElement?.style) {
      document.documentElement.style.setProperty("--tesela-accent", CONFIG.branding.accent);
    }
    applyPreset((CONFIG.scoring && CONFIG.scoring.defaultPreset) || null);
    if (!state.preset) state.weights = defaultWeights();

    const m = CONFIG.map || {};
    state.map = L.map(mounts.map, { zoomControl: true }).setView(
      m.center || [0, 0],
      m.zoom ?? 2,
    );
    state.baseLayer = L.tileLayer((m.tiles && m.tiles.url) || "", {
      attribution: (m.tiles && m.tiles.attribution) || "",
    }).addTo(state.map);

    rescore();
    if (typeof UI.createMapLayerManager !== "function") {
      showStartupError([label("missingMapLayers", "Falta el componente de capas de Tesela.")]);
      return;
    }
    state.mapLayers = UI.createMapLayerManager({
      L,
      map: state.map,
      mapConfig: m,
      zones: state.zones,
      styleForZone: styleZone,
      tooltipForZone: tooltipFor,
      onSelect: (zone) => selectZone(zone),
      pointForZone: (zone) => E.representativePoint(zone.feature),
      accent: CONFIG.branding?.accent,
      document,
    });
    buildConsole();

    const bounds = state.mapLayers.getBounds();
    if (bounds?.isValid?.()) {
      state.map.fitBounds(bounds, { padding: [20, 20] });
    }
  }

  function rebuildMapLayers() {
    state.mapLayers?.rebuild({ zones: state.zones });
    if (state.selected) state.mapLayers?.setSelection(state.selected);
  }

  function destroy() {
    state.detailController?.destroy();
    state.mapLayers?.destroy();
    state.baseLayer?.remove?.();
    state.map?.off?.();
    state.map?.remove?.();
    state.mapLayers = null;
    state.detailController = null;
    state.baseLayer = null;
    state.map = null;
  }

  function showStartupError(messages) {
    const rail = mount("rail");
    if (!rail) return;
    rail.replaceChildren(el("div", { class: "ssm-error" }, messages.map((message) =>
      el("p", null, [message])
    )));
  }

  Tesela.app = Object.assign(Tesela.app || {}, {
    destroy,
    getState: stateSnapshot,
    rebuild: rebuildMapLayers,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
