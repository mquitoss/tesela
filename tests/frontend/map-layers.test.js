import { describe, expect, it, vi } from "vitest";

const { createMapLayerManager, pointFrom } = require("../../src/ui/map-layers.js");

function fakeLeaflet() {
  const layers = new Set();
  const panes = new Map();
  const listeners = new Map();
  const geoJsonCalls = [];
  const markerCalls = [];
  const controls = [];
  let zoom = 9;
  const bounds = {
    isValid: () => true,
    pad: () => bounds,
    contains: ([lat]) => lat >= 0,
  };
  const map = {
    createPane(name) { const pane = { style: {} }; panes.set(name, pane); return pane; },
    getPane: (name) => panes.get(name),
    hasLayer: (layer) => layers.has(layer),
    getZoom: () => zoom,
    setZoom(value) { zoom = value; },
    getBounds: () => bounds,
    fitBounds() {},
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
    },
    off(event, handler) { listeners.get(event)?.delete(handler); },
    fire(event) { for (const handler of listeners.get(event) || []) handler(); },
  };
  const layer = (extra = {}) => ({
    ...extra,
    removed: false,
    addTo(target) {
      if (target === map) layers.add(this);
      else target.addLayer(this);
      return this;
    },
    remove() { this.removed = true; layers.delete(this); },
  });
  const L = {
    tileLayer: (url, options) => layer({ kind: "tile", url, options }),
    divIcon: (options) => options,
    marker: (point, options) => {
      const marker = layer({ kind: "marker", point, options, getLatLng: () => point });
      markerCalls.push(marker);
      return marker;
    },
    layerGroup: (initial = []) => {
      const children = [...initial];
      return layer({
        kind: "group",
        children,
        addLayer(child) { children.push(child); return this; },
        clearLayers() { children.length = 0; return this; },
      });
    },
    geoJSON: (geojson, options) => {
      const root = layer({
        kind: "geojson",
        geojson,
        options,
        bringToFrontCalled: false,
        bringToFront() { this.bringToFrontCalled = true; },
        getBounds: () => bounds,
      });
      root.featureLayers = [];
      for (const feature of geojson.features || []) {
        const handlers = {};
        const child = {
          handlers,
          styles: [],
          bindTooltip() {},
          on(event, handler) { handlers[event] = handler; },
          setStyle(style) { this.styles.push(style); },
          getBounds: () => bounds,
        };
        options.onEachFeature(feature, child);
        root.featureLayers.push(child);
      }
      geoJsonCalls.push(root);
      return root;
    },
    control: {
      layers: (_base, overlays, options) => {
        const control = layer({ overlays, options });
        controls.push(control);
        return control;
      },
    },
  };
  return {
    L,
    map,
    layers,
    panes,
    listeners,
    geoJsonCalls,
    markerCalls,
    controls,
  };
}

const feature = (id) => ({
  type: "Feature",
  properties: { id },
  geometry: { type: "Point", coordinates: [id, id] },
});

describe("map layer manager", () => {
  it("valida coordenadas sin fabricar ceros", () => {
    expect(pointFrom({ lat: 1, lon: 2 })).toEqual([1, 2]);
    expect(pointFrom([0, 0])).toEqual([0, 0]);
    expect(pointFrom({ lat: "", lon: 2 })).toBeNull();
    expect(pointFrom({ lat: false, lon: 2 })).toBeNull();
    expect(pointFrom({ lat: 91, lon: 2 })).toBeNull();
  });

  it("crea panes, overlays agrupados, control y etiquetas según zoom", () => {
    const fake = fakeLeaflet();
    const zones = [
      { key: "a", name: "Alpha", feature: feature(1) },
      { key: "b", name: "Beta", feature: feature(2) },
    ];
    const manager = createMapLayerManager({
      L: fake.L,
      map: fake.map,
      document: { createElement: () => ({ className: "", textContent: "" }) },
      zones,
      pointForZone: (zone) => ({ lat: zone.key === "a" ? 1 : -1, lng: 2 }),
      styleForZone: () => ({ fillColor: "red" }),
      mapConfig: {
        panes: { labels: { zIndex: 700 } },
        overlays: [
          {
            id: "roads", label: "Roads", type: "tile", enabled: true,
            url: "https://tiles.example/{z}/{x}/{y}.png",
            control: { id: "context", label: "Context" },
          },
          {
            id: "places", label: "Places", type: "markers", enabled: true,
            items: [{ lat: 3, lon: 4, label: "<img src=x onerror=alert(1)>" }],
            control: { id: "context", label: "Context" },
          },
        ],
        labels: { enabled: true, label: "Names", minZoom: 10, boundsPadding: 0.15 },
        layerControl: { enabled: true },
      },
    });

    expect([...fake.panes.keys()]).toEqual([
      "tesela-zones", "tesela-context", "tesela-selection", "tesela-labels",
    ]);
    expect(fake.panes.get("tesela-labels").style.zIndex).toBe("700");
    expect(Object.keys(fake.controls[0].overlays)).toEqual(["Context", "Names"]);
    expect(fake.markerCalls).toHaveLength(1);
    expect(fake.markerCalls[0].options.icon.html.textContent).toBe("<img src=x onerror=alert(1)>");
    fake.map.setZoom(10);
    fake.map.fire("zoomend");
    expect(fake.markerCalls).toHaveLength(3);
    const labelsGroup = [...fake.layers].find((item) => item.kind === "group" && item.children.length === 1);
    expect(labelsGroup.children[0].options.interactive).toBe(false);
    manager.destroy();
  });

  it("mantiene una selección no interactiva al refrescar y reconstruir", () => {
    const fake = fakeLeaflet();
    const zones = [{ key: "a", name: "Alpha", feature: feature(1) }];
    const manager = createMapLayerManager({
      L: fake.L,
      map: fake.map,
      zones,
      styleForZone: () => ({ fillColor: "red" }),
      mapConfig: { selection: { enabled: true } },
    });
    manager.setSelection(zones[0]);
    const firstSelection = fake.geoJsonCalls.at(-1);
    expect(firstSelection.options.interactive).toBe(false);
    expect(firstSelection.bringToFrontCalled).toBe(true);
    manager.refreshZoneStyles();
    expect(firstSelection.removed).toBe(false);

    manager.rebuild();
    expect(firstSelection.removed).toBe(true);
    const restored = fake.geoJsonCalls.at(-1);
    expect(restored.geojson).toBe(zones[0].feature);
    manager.setSelection(null);
    expect(restored.removed).toBe(true);
  });

  it("respeta el rango de zoom de overlays markers", () => {
    const fake = fakeLeaflet();
    createMapLayerManager({
      L: fake.L,
      map: fake.map,
      zones: [],
      mapConfig: {
        overlays: [{
          id: "places",
          label: "Places",
          type: "markers",
          enabled: true,
          minZoom: 10,
          items: [{ lat: 1, lon: 2, label: "Place" }],
        }],
      },
    });
    expect(fake.markerCalls).toHaveLength(0);
    fake.map.setZoom(10);
    fake.map.fire("zoomend");
    expect(fake.markerCalls).toHaveLength(1);
    fake.map.setZoom(9);
    fake.map.fire("zoomend");
    const group = [...fake.layers].find((item) => item.kind === "group");
    expect(group.children).toHaveLength(0);
  });

  it("aísla callbacks inválidos sin detener el mapa", () => {
    const fake = fakeLeaflet();
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => createMapLayerManager({
      L: fake.L,
      map: fake.map,
      zones: [],
      mapConfig: {
        overlays: [{
          id: "broken",
          label: "Broken",
          type: "markers",
          enabled: true,
          items: [{ lat: 1, lon: 2 }],
          className: () => { throw new Error("broken style"); },
        }],
      },
    })).not.toThrow();
    expect(fake.markerCalls).toHaveLength(0);
    expect(report).toHaveBeenCalledOnce();
    report.mockRestore();
  });

  it("no duplica listeners y destroy es idempotente", () => {
    const fake = fakeLeaflet();
    const manager = createMapLayerManager({
      L: fake.L,
      map: fake.map,
      zones: [{ key: "a", feature: feature(1) }],
      mapConfig: { labels: { enabled: true } },
    });
    manager.rebuild();
    for (const event of ["zoomend", "moveend", "overlayadd", "overlayremove"]) {
      expect(fake.listeners.get(event)?.size).toBe(1);
    }
    manager.destroy();
    manager.destroy();
    for (const handlers of fake.listeners.values()) expect(handlers.size).toBe(0);
    expect(fake.controls.filter((control) => !control.removed)).toHaveLength(0);
  });
});
