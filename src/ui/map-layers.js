/* =====================================================================
   Tesela · ui/map-layers — ciclo de vida de capas Leaflet declarativas
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = g;
  g.ui = Object.assign(g.ui || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULT_PANES = {
    zones: { name: "tesela-zones", zIndex: 400, pointerEvents: "auto" },
    context: { name: "tesela-context", zIndex: 450, pointerEvents: "none" },
    selection: { name: "tesela-selection", zIndex: 610, pointerEvents: "none" },
    labels: { name: "tesela-labels", zIndex: 620, pointerEvents: "none" },
  };

  function finiteNumber(value) {
    if (value == null || typeof value === "boolean") return null;
    if (typeof value === "string" && value.trim() === "") return null;
    try {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    } catch {
      return null;
    }
  }

  function pointFrom(value) {
    if (Array.isArray(value)) {
      const lat = finiteNumber(value[0]);
      const lng = finiteNumber(value[1]);
      return lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
        ? [lat, lng]
        : null;
    }
    if (!value || typeof value !== "object") return null;
    const lat = finiteNumber(value.lat);
    const lng = finiteNumber(value.lng ?? value.lon);
    return lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? [lat, lng]
      : null;
  }

  function createMapLayerManager(options) {
    const L = options.L;
    const map = options.map;
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    const mapConfig = options.mapConfig || {};
    const paneConfig = Object.fromEntries(
      [...new Set([...Object.keys(DEFAULT_PANES), ...Object.keys(mapConfig.panes || {})])]
        .map((key) => [key, { ...(DEFAULT_PANES[key] || {}), ...(mapConfig.panes?.[key] || {}) }]),
    );
    let zones = Array.isArray(options.zones) ? options.zones : [];
    let zoneLayer = null;
    let selectionLayer = null;
    let selectedKey = null;
    let labelsLayer = null;
    let layerControl = null;
    let overlayLayers = [];
    let controlLayers = [];
    let dynamicMarkerOverlays = [];
    let destroyed = false;
    const zoneLayers = new Map();
    const listeners = [];

    function paneName(logical, fallback) {
      return paneConfig[logical]?.name || logical || fallback;
    }

    function createPanes() {
      for (const descriptor of Object.values(paneConfig)) {
        if (!descriptor?.name || typeof map.createPane !== "function") continue;
        const pane = map.getPane?.(descriptor.name) || map.createPane(descriptor.name);
        if (!pane?.style) continue;
        if (descriptor.zIndex != null) pane.style.zIndex = String(descriptor.zIndex);
        if (descriptor.pointerEvents) pane.style.pointerEvents = descriptor.pointerEvents;
      }
    }

    function context(overlay) {
      return Object.freeze({ L, map, config: mapConfig, zones, overlay });
    }

    function resolveItems(descriptor) {
      try {
        const items = typeof descriptor.items === "function"
          ? descriptor.items(context(descriptor))
          : (descriptor.items ?? zones);
        return Array.isArray(items) ? items : [];
      } catch (error) {
        console.error(`[Tesela] Error en items de ${descriptor.id || "labels"}`, error);
        return [];
      }
    }

    function resolvePoint(item, descriptor) {
      try {
        const raw = typeof descriptor.pointFor === "function"
          ? descriptor.pointFor(item, context(descriptor))
          : item;
        return pointFrom(raw) || (
          item?.feature && typeof options.pointForZone === "function"
            ? pointFrom(options.pointForZone(item))
            : null
        );
      } catch (error) {
        console.error(`[Tesela] Error en pointFor de ${descriptor.id || "labels"}`, error);
        return null;
      }
    }

    function labelNode(text, className) {
      if (!doc) return String(text ?? "");
      const node = doc.createElement("span");
      node.className = className || "tesela-map-label";
      node.textContent = String(text ?? "");
      return node;
    }

    function markerFor(item, descriptor) {
      const point = resolvePoint(item, descriptor);
      if (!point) return null;
      let label;
      try {
        label = typeof descriptor.labelFor === "function"
          ? descriptor.labelFor(item, context(descriptor))
          : (item?.name ?? item?.label ?? "");
        if (typeof descriptor.formatter === "function") {
          label = descriptor.formatter(label, item, context(descriptor));
        }
      } catch (error) {
        console.error(`[Tesela] Error en label de ${descriptor.id || "labels"}`, error);
        return null;
      }
      try {
        const style = typeof descriptor.style === "object" ? descriptor.style : {};
        const className = typeof descriptor.className === "function"
          ? descriptor.className(item, context(descriptor))
          : (descriptor.className || style.className);
        const icon = L.divIcon({
          className: descriptor.iconClassName || style.iconClassName || "tesela-map-label-icon",
          html: labelNode(label, className),
          iconSize: descriptor.iconSize || style.iconSize || [0, 0],
          iconAnchor: descriptor.iconAnchor || style.iconAnchor || [0, 0],
        });
        return L.marker(point, {
          ...(style.markerOptions || {}),
          pane: paneName(descriptor.pane, paneName("labels")),
          interactive: descriptor.interactive === true,
          icon,
        });
      } catch (error) {
        console.error(`[Tesela] Error en estilo de ${descriptor.id || "labels"}`, error);
        return null;
      }
    }

    function buildPhysicalOverlay(descriptor) {
      if (descriptor.type === "tile") {
        return L.tileLayer(descriptor.url, {
          ...(descriptor.options || {}),
          attribution: descriptor.attribution || "",
          pane: paneName(descriptor.pane, paneName("context")),
          minZoom: descriptor.minZoom,
          maxZoom: descriptor.maxZoom,
          interactive: descriptor.interactive === true,
        });
      }
      const group = L.layerGroup();
      const populate = () => {
        group.clearLayers();
        const zoom = map.getZoom?.() ?? 0;
        if (descriptor.minZoom != null && zoom < descriptor.minZoom) return;
        if (descriptor.maxZoom != null && zoom > descriptor.maxZoom) return;
        for (const item of resolveItems(descriptor)) {
          const marker = markerFor(item, descriptor);
          if (marker) group.addLayer(marker);
        }
      };
      if (descriptor.minZoom != null || descriptor.maxZoom != null) {
        dynamicMarkerOverlays.push(populate);
      } else populate();
      return group;
    }

    function buildOverlays() {
      const grouped = new Map();
      for (const descriptor of Array.isArray(mapConfig.overlays) ? mapConfig.overlays : []) {
        const physical = buildPhysicalOverlay(descriptor);
        overlayLayers.push(physical);
        const controlId = descriptor.control?.id || descriptor.id;
        let entry = grouped.get(controlId);
        if (!entry) {
          entry = {
            enabled: descriptor.enabled === true,
            label: descriptor.control?.label || descriptor.label,
            layers: [],
          };
          grouped.set(controlId, entry);
        }
        entry.layers.push(physical);
      }

      labelsLayer = L.layerGroup();
      const labels = mapConfig.labels;
      if (labels?.enabled !== false) {
        const labelEntry = {
          enabled: true,
          label: labels?.label || "Zone names",
          layers: [labelsLayer],
        };
        grouped.set("__tesela_labels", labelEntry);
      }

      const controls = {};
      for (const entry of grouped.values()) {
        const layer = entry.layers.length === 1 ? entry.layers[0] : L.layerGroup(entry.layers);
        controlLayers.push(layer);
        if (entry.enabled) layer.addTo(map);
        if (entry.label) controls[entry.label] = layer;
      }
      if (mapConfig.layerControl?.enabled !== false && Object.keys(controls).length) {
        layerControl = L.control.layers(null, controls, {
          position: mapConfig.layerControl?.position || "topright",
          collapsed: mapConfig.layerControl?.collapsed !== false,
        }).addTo(map);
      }
    }

    function refreshLabels() {
      const descriptor = mapConfig.labels;
      if (!labelsLayer || !descriptor || descriptor.enabled === false) return;
      if (typeof map.hasLayer === "function" && !map.hasLayer(labelsLayer)) return;
      labelsLayer.clearLayers();
      const zoom = map.getZoom?.() ?? 0;
      if (descriptor.minZoom != null && zoom < descriptor.minZoom) return;
      if (descriptor.maxZoom != null && zoom > descriptor.maxZoom) return;
      const bounds = map.getBounds?.();
      const visibleBounds = bounds?.pad ? bounds.pad(descriptor.boundsPadding || 0) : bounds;
      for (const item of resolveItems(descriptor)) {
        const marker = markerFor(item, descriptor);
        if (!marker) continue;
        const point = marker.getLatLng?.();
        if (visibleBounds?.contains && point && !visibleBounds.contains(point)) continue;
        labelsLayer.addLayer(marker);
      }
    }

    function refreshVisibleMarkers() {
      for (const populate of dynamicMarkerOverlays) populate();
      refreshLabels();
    }

    function listen(event, handler) {
      map.on(event, handler);
      listeners.push([event, handler]);
    }

    function buildZones() {
      const byFeature = new Map(zones.map((zone) => [zone.feature, zone]));
      zoneLayer = L.geoJSON({ type: "FeatureCollection", features: zones.map((zone) => zone.feature) }, {
        pane: paneName("zones"),
        style: (feature) => ({
          ...(options.styleForZone?.(byFeature.get(feature)) || {}),
          className: "tesela-zone-path",
        }),
        onEachFeature: (feature, layer) => {
          const zone = byFeature.get(feature);
          if (!zone) return;
          zoneLayers.set(String(zone.key), layer);
          if (options.tooltipForZone) layer.bindTooltip(options.tooltipForZone(zone), { sticky: true });
          layer.on("mouseover", () => layer.setStyle({
            weight: 2,
            color: options.accent || "#5EEAD4",
          }));
          layer.on("mouseout", () => layer.setStyle(options.styleForZone?.(zone) || {}));
          layer.on("click", () => options.onSelect?.(zone));
        },
      }).addTo(map);
    }

    function setSelection(zone) {
      if (selectionLayer) selectionLayer.remove();
      selectionLayer = null;
      selectedKey = zone?.key != null ? String(zone.key) : null;
      if (!zone || mapConfig.selection?.enabled === false) return;
      selectionLayer = L.geoJSON(zone.feature, {
        pane: paneName(mapConfig.selection?.pane, paneName("selection")),
        interactive: false,
        style: {
          color: options.accent || "#5EEAD4",
          weight: 4,
          opacity: 1,
          fill: false,
          lineCap: "round",
          lineJoin: "round",
          ...(mapConfig.selection?.style || {}),
        },
      }).addTo(map);
      selectionLayer.bringToFront?.();
    }

    function refreshZoneStyles() {
      for (const zone of zones) {
        const layer = zoneLayers.get(String(zone.key));
        layer?.setStyle(options.styleForZone?.(zone) || {});
        if (layer && options.tooltipForZone && typeof layer.setTooltipContent === "function") {
          layer.setTooltipContent(options.tooltipForZone(zone));
        }
      }
    }

    function removeManaged() {
      while (listeners.length) {
        const [event, handler] = listeners.pop();
        map.off(event, handler);
      }
      layerControl?.remove?.();
      layerControl = null;
      selectionLayer?.remove?.();
      selectionLayer = null;
      zoneLayer?.remove?.();
      zoneLayer = null;
      for (const layer of controlLayers) layer.remove?.();
      for (const layer of overlayLayers) layer.remove?.();
      labelsLayer?.remove?.();
      labelsLayer = null;
      controlLayers = [];
      overlayLayers = [];
      dynamicMarkerOverlays = [];
      zoneLayers.clear();
    }

    function rebuild(next) {
      const restoreKey = selectedKey;
      destroyed = false;
      removeManaged();
      if (Array.isArray(next?.zones)) zones = next.zones;
      createPanes();
      buildZones();
      buildOverlays();
      for (const event of ["zoomend", "moveend", "overlayadd", "overlayremove"]) {
        listen(event, refreshVisibleMarkers);
      }
      refreshVisibleMarkers();
      if (restoreKey != null) setSelection(zones.find((zone) => String(zone.key) === restoreKey) || null);
    }

    function focusZone(zone, fitOptions) {
      const layer = zoneLayers.get(String(zone.key));
      const bounds = layer?.getBounds?.();
      if (bounds?.isValid?.()) map.fitBounds(bounds, fitOptions || {});
    }

    function destroy() {
      if (destroyed) return;
      removeManaged();
      destroyed = true;
    }

    rebuild();
    return {
      destroy,
      focusZone,
      getBounds: () => zoneLayer?.getBounds?.() || null,
      getZoneLayer: (key) => zoneLayers.get(String(key)) || null,
      rebuild,
      refreshLabels,
      refreshZoneStyles,
      setSelection,
    };
  }

  return { createMapLayerManager, pointFrom };
});
