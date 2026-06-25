/* =====================================================================
   Self Service Map · app.js — cableado Leaflet/DOM dirigido por config
   =====================================================================
   NO contiene lógica de dominio: orquesta el engine (SSM.engine) y los hooks
   (SSM.adapters) según `window.SSM_CONFIG` y `window.SSM_DATA`. Vanilla JS, sin
   build; se carga por <script src> tras el engine y los datos. Se ejecuta solo
   en el navegador (depende de Leaflet `L` y del DOM).
   ===================================================================== */
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  const E = (window.SSM && window.SSM.engine) || {};
  const A = (window.SSM && window.SSM.adapters) || {};
  const CONFIG = window.SSM_CONFIG || {};

  const state = {
    zones: [],
    scoresByKey: new Map(),
    weights: {},
    preset: null,
    extent: { min: 0, max: 0 },
    selected: null,
    layer: null,
    map: null,
  };

  // ---- utilidades de DOM -----------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        if (k === "class") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
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
    const ns = (CONFIG.branding && CONFIG.branding.dataNamespace) || "SSM_DATA";
    const picked = E.selectDataSource({ embedded: window[ns] });
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
    const results = E.computeScores(indicators, state.weights, {
      factors: scoring.factors || [],
      baseMetric: scoring.baseMetric,
      keyField: scoring.keyField || "codi",
    });
    state.scoresByKey = new Map();
    let i = 0;
    for (const z of state.zones) {
      if (!z.ind) continue;
      state.scoresByKey.set(z.key, results[i]);
      i += 1;
    }
    state.extent = computeColorExtent();
  }

  // Valor que colorea cada zona según config.color.metric ("score" o indicador).
  function colorValue(zone) {
    const metric = (CONFIG.color && CONFIG.color.metric) || "score";
    if (metric === "score") {
      const r = state.scoresByKey.get(zone.key);
      return r ? r.scoreN : null; // scoreN ya está en [0,1]
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
      const r = state.scoresByKey.get(zone.key);
      val = r && r.score != null ? `${r.score}/100` : "sin dato";
    } else {
      const field = (CONFIG.indicators || []).find((f) => f.key === metric) || {};
      val = E.formatValue(zone.ind ? zone.ind[metric] : null, field);
    }
    return `${zone.name || "—"} · ${val}`;
  }

  function render() {
    if (state.layer) state.layer.remove();
    const features = state.zones.map((z) => z.feature);
    const geo = { type: "FeatureCollection", features };
    const byFeature = new Map();
    state.zones.forEach((z) => byFeature.set(z.feature, z));
    state.layer = L.geoJSON(geo, {
      style: (f) => styleZone(byFeature.get(f) || { key: null, ind: null }),
      onEachFeature: (f, layer) => {
        const zone = byFeature.get(f);
        if (!zone) return;
        layer.bindTooltip(tooltipFor(zone), { sticky: true });
        layer.on("mouseover", () =>
          layer.setStyle({ weight: 2, color: CONFIG.branding.accent || "#5EEAD4" }),
        );
        layer.on("mouseout", () => layer.setStyle(styleZone(zone)));
        layer.on("click", () => selectZone(zone));
      },
    }).addTo(state.map);
  }

  // ---- panel de detalle ------------------------------------------------------
  function selectZone(zone) {
    state.selected = zone;
    const panel = $("#ssm-detail");
    if (!panel) return;
    const fields = (CONFIG.detail && CONFIG.detail.fields) || CONFIG.indicators || [];
    const r = state.scoresByKey.get(zone.key);
    const rows = fields.map((f) =>
      el("div", { class: "ssm-row" }, [
        el("span", { class: "ssm-row-label" }, [f.label || f.key]),
        el("span", { class: "ssm-row-value" }, [
          E.formatValue(zone.ind ? zone.ind[f.key] : null, f),
        ]),
      ]),
    );
    const scoreLine =
      r && r.score != null
        ? el("div", { class: "ssm-score" }, [`Índice: ${r.score}/100`])
        : null;
    panel.innerHTML = "";
    panel.appendChild(el("h2", null, [zone.name || "Zona"]));
    if (scoreLine) panel.appendChild(scoreLine);
    rows.forEach((row) => panel.appendChild(row));
    panel.classList.add("open");
  }

  // ---- consola: presets + sliders + leyenda ----------------------------------
  function buildConsole() {
    const rail = $("#ssm-rail");
    if (!rail) return;
    rail.innerHTML = "";

    // Marca
    rail.appendChild(
      el("div", { class: "ssm-brand" }, [
        el("h1", null, [CONFIG.branding.title || "Self Service Map"]),
        el("p", null, [CONFIG.branding.subtitle || ""]),
      ]),
    );

    // Estado
    const matched = state.zones.filter((z) => z.ind).length;
    rail.appendChild(
      el("div", { class: "ssm-status" }, [
        `${state.zones.length} zonas · ${matched} con dato`,
      ]),
    );

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
      for (const f of factors) {
        const value = state.weights[f.key] != null ? state.weights[f.key] : 0;
        const out = el("span", { class: "ssm-slider-val" }, [value.toFixed(1)]);
        const input = el("input", {
          type: "range",
          min: "-1",
          max: "1",
          step: "0.1",
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

    // Leyenda
    rail.appendChild(buildLegend());
  }

  function buildLegend() {
    const ramp = (CONFIG.color && CONFIG.color.ramp) || E.DEFAULT_RAMP;
    const stops = ramp
      .map((c) => `rgb(${c[0]},${c[1]},${c[2]})`)
      .join(", ");
    const metric = (CONFIG.color && CONFIG.color.metric) || "score";
    const label =
      metric === "score"
        ? "Índice ponderado (relativo)"
        : (CONFIG.indicators || []).find((f) => f.key === metric)?.label || metric;
    return el("div", { class: "ssm-legend" }, [
      el("div", { class: "ssm-legend-label" }, [label]),
      el("div", {
        class: "ssm-legend-bar",
        style: `background:linear-gradient(90deg, ${stops});`,
      }),
      el("div", { class: "ssm-legend-ends" }, [
        el("span", null, ["bajo"]),
        el("span", null, ["alto"]),
      ]),
    ]);
  }

  // ---- arranque --------------------------------------------------------------
  function bootstrap() {
    const bundle = readBundle();
    if (!bundle) {
      const rail = $("#ssm-rail");
      if (rail) {
        rail.innerHTML =
          '<div class="ssm-error">No hay datos válidos en <code>window.' +
          ((CONFIG.branding && CONFIG.branding.dataNamespace) || "SSM_DATA") +
          "</code>.<br>Ejecuta <code>python scripts/build_data.py</code>.</div>";
      }
      return;
    }
    state.zones = buildZones(bundle);
    applyPreset((CONFIG.scoring && CONFIG.scoring.defaultPreset) || null);
    if (!state.preset) state.weights = defaultWeights();

    const m = CONFIG.map || {};
    state.map = L.map("ssm-map", { zoomControl: true }).setView(
      m.center || [0, 0],
      m.zoom || 2,
    );
    L.tileLayer((m.tiles && m.tiles.url) || "", {
      attribution: (m.tiles && m.tiles.attribution) || "",
    }).addTo(state.map);

    rescore();
    render();
    buildConsole();

    if (state.layer && state.layer.getBounds && state.layer.getBounds().isValid()) {
      state.map.fitBounds(state.layer.getBounds(), { padding: [20, 20] });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
