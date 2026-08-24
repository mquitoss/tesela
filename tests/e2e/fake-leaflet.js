(function (root) {
  const maps = [];
  const bounds = {
    isValid: () => true,
    contains: () => true,
    pad() { return this; },
  };

  function basicLayer(extra) {
    return Object.assign({
      element: null,
      addTo(target) {
        if (target && typeof target.addLayer === "function") target.addLayer(this);
        else if (target?._container && this.element) target._container.appendChild(this.element);
        this._map = target;
        return this;
      },
      remove() { this.element?.remove(); this._map?.removeLayer?.(this); },
    }, extra || {});
  }

  function map(id) {
    const container = document.getElementById(id);
    const layers = new Set();
    const listeners = new Map();
    const panes = new Map();
    const instance = {
      _container: container,
      setView() { return this; },
      fitBounds() { container.dataset.fitBounds = String(Number(container.dataset.fitBounds || 0) + 1); },
      createPane(name) { const pane = document.createElement("div"); pane.style.zIndex = ""; panes.set(name, pane); return pane; },
      getPane: (name) => panes.get(name),
      hasLayer: (layer) => layers.has(layer),
      getZoom: () => 12,
      getBounds: () => bounds,
      on(event, handler) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(handler); },
      off(event, handler) { if (!event) listeners.clear(); else listeners.get(event)?.delete(handler); },
      addLayer(layer) { layers.add(layer); if (layer.element) container.appendChild(layer.element); },
      removeLayer(layer) { layers.delete(layer); layer.element?.remove(); },
      remove() { container.replaceChildren(); layers.clear(); listeners.clear(); },
    };
    maps.push(instance);
    return instance;
  }

  function geoJSON(geojson, options) {
    const rootLayer = basicLayer({
      element: null,
      getBounds: () => bounds,
      bringToFront() {},
      featureLayers: [],
    });
    if (Array.isArray(geojson.features)) {
      const group = document.createElement("div");
      group.className = "fake-zones";
      for (const feature of geojson.features) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "fake-zone";
        button.textContent = feature.properties.NAME;
        const handlers = {};
        const layer = {
          bindTooltip(text) { button.title = text; },
          setTooltipContent(text) { button.title = text; },
          on(event, handler) { handlers[event] = handler; button.addEventListener(event === "click" ? "click" : event, handler); },
          setStyle(style) { button.dataset.fill = style.fillColor || ""; },
          getBounds: () => bounds,
        };
        options.style?.(feature);
        options.onEachFeature?.(feature, layer);
        rootLayer.featureLayers.push(layer);
        group.appendChild(button);
      }
      rootLayer.element = group;
    } else if (options?.interactive === false) {
      const selection = document.createElement("div");
      selection.className = "fake-selection";
      selection.textContent = "Selected perimeter";
      rootLayer.element = selection;
    }
    return rootLayer;
  }

  function layerGroup(initial) {
    const children = [...(initial || [])];
    return basicLayer({
      children,
      addLayer(layer) { children.push(layer); return this; },
      clearLayers() { children.splice(0); return this; },
    });
  }

  root.L = {
    map,
    tileLayer: (url) => basicLayer({ url }),
    geoJSON,
    layerGroup,
    divIcon: (options) => options,
    marker: (point, options) => basicLayer({ point, options, getLatLng: () => point }),
    control: {
      layers: (_base, overlays) => {
        const element = document.createElement("div");
        element.className = "fake-layer-control";
        const control = basicLayer({
          element,
          addTo(target) {
            this._map = target;
            for (const [label, layer] of Object.entries(overlays)) {
              const button = document.createElement("button");
              button.type = "button";
              button.textContent = label;
              button.setAttribute("aria-pressed", String(target.hasLayer(layer)));
              button.addEventListener("click", () => {
                if (target.hasLayer(layer)) layer.remove();
                else layer.addTo(target);
                button.setAttribute("aria-pressed", String(target.hasLayer(layer)));
              });
              element.appendChild(button);
            }
            target.addLayer(this);
            return this;
          },
        });
        return control;
      },
    },
  };
})(window);
