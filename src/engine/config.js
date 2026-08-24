/* =====================================================================
   Tesela · engine/config — validación pura de configuración
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = g;
  g.engine = Object.assign(g.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
  const FIELD_FORMATS = new Set(["plain", "number", "percent", "boolean", "duration"]);

  function duplicateValues(items, key) {
    const seen = new Set();
    const duplicates = new Set();
    for (const item of items) {
      const value = item && item[key];
      if (!isNonEmptyString(value)) continue;
      if (seen.has(value)) duplicates.add(value);
      seen.add(value);
    }
    return [...duplicates];
  }

  function validateRamp(ramp, errors) {
    if (!Array.isArray(ramp) || ramp.length < 2) {
      errors.push("color.ramp debe contener al menos dos colores RGB");
      return;
    }
    ramp.forEach((color, index) => {
      const valid = Array.isArray(color) && color.length === 3
        && color.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255);
      if (!valid) errors.push(`color.ramp[${index}] debe ser un color [r,g,b] con canales 0..255`);
    });
  }

  function validateFields(fields, path, errors) {
    fields.forEach((field, index) => {
      const fieldPath = `${path}[${index}]`;
      if (!isObject(field)) {
        errors.push(`${fieldPath} debe ser un objeto`);
        return;
      }
      if (!isNonEmptyString(field.key)) errors.push(`${fieldPath}.key es obligatorio`);
      if (!isNonEmptyString(field.label)) errors.push(`${fieldPath}.label es obligatorio`);
      if (field.format != null && !FIELD_FORMATS.has(field.format)) {
        errors.push(`${fieldPath}.format no está soportado`);
      }
      if (field.decimals != null && (
        !Number.isInteger(Number(field.decimals))
        || Number(field.decimals) < 0
        || Number(field.decimals) > 20
      )) {
        errors.push(`${fieldPath}.decimals debe ser un entero entre 0 y 20`);
      }
      for (const key of ["unit", "sinDato", "section", "help"]) {
        if (field[key] != null && !isNonEmptyString(field[key])) {
          errors.push(`${fieldPath}.${key} debe ser texto no vacío`);
        }
      }
      for (const labelsKey of ["booleanLabels", "durationLabels"]) {
        const labels = field[labelsKey];
        if (labels == null) continue;
        const keys = labelsKey === "booleanLabels" ? ["true", "false"] : ["hour", "minute"];
        if (!isObject(labels) || keys.some((key) => !isNonEmptyString(labels[key]))) {
          errors.push(`${fieldPath}.${labelsKey} debe definir textos ${keys.join(" y ")}`);
        }
      }
    });
    for (const key of duplicateValues(fields, "key")) {
      errors.push(`${path} contiene la clave duplicada "${key}"`);
    }
  }

  function validateZoomRange(descriptor, path, errors) {
    for (const key of ["minZoom", "maxZoom"]) {
      if (descriptor[key] != null && (
        !Number.isFinite(descriptor[key]) || descriptor[key] < 0
      )) errors.push(`${path}.${key} debe ser un número no negativo`);
    }
    if (descriptor.minZoom != null && descriptor.maxZoom != null
      && descriptor.minZoom > descriptor.maxZoom) {
      errors.push(`${path}.minZoom no puede superar maxZoom`);
    }
  }

  function validateMap(map, errors) {
    if (map == null) return;
    if (!isObject(map)) {
      errors.push("map debe ser un objeto");
      return;
    }
    const panes = isObject(map.panes) ? Object.values(map.panes) : [];
    if (map.panes != null && !isObject(map.panes)) errors.push("map.panes debe ser un objeto");
    panes.forEach((pane, index) => {
      if (!isObject(pane)) errors.push(`map.panes[${index}] debe ser un objeto`);
      else {
        if (!isNonEmptyString(pane.name)) errors.push(`map.panes[${index}].name es obligatorio`);
        if (pane.zIndex != null && !Number.isFinite(pane.zIndex)) {
          errors.push(`map.panes[${index}].zIndex debe ser finito`);
        }
        if (pane.pointerEvents != null && !isNonEmptyString(pane.pointerEvents)) {
          errors.push(`map.panes[${index}].pointerEvents debe ser texto`);
        }
      }
    });
    for (const name of duplicateValues(panes, "name")) {
      errors.push(`map.panes contiene el nombre duplicado "${name}"`);
    }

    if (map.selection != null) {
      if (!isObject(map.selection)) errors.push("map.selection debe ser un objeto");
      else {
        if (map.selection.enabled != null && typeof map.selection.enabled !== "boolean") {
          errors.push("map.selection.enabled debe ser booleano");
        }
        if (map.selection.pane != null && !isNonEmptyString(map.selection.pane)) {
          errors.push("map.selection.pane debe ser texto");
        }
        if (map.selection.style != null && !isObject(map.selection.style)) {
          errors.push("map.selection.style debe ser un objeto");
        } else {
          for (const key of ["weight", "opacity", "fillOpacity"]) {
            if (map.selection.style?.[key] != null
              && !Number.isFinite(map.selection.style[key])) {
              errors.push(`map.selection.style.${key} debe ser finito`);
            }
          }
        }
      }
    }

    if (map.overlays != null && !Array.isArray(map.overlays)) {
      errors.push("map.overlays debe ser un array");
    }
    const overlays = Array.isArray(map.overlays) ? map.overlays : [];
    const controls = new Map();
    overlays.forEach((overlay, index) => {
      const path = `map.overlays[${index}]`;
      if (!isObject(overlay)) {
        errors.push(`${path} debe ser un objeto`);
        return;
      }
      if (!isNonEmptyString(overlay.id)) errors.push(`${path}.id es obligatorio`);
      if (!isNonEmptyString(overlay.label)) errors.push(`${path}.label es obligatorio`);
      if (!["tile", "markers"].includes(overlay.type)) errors.push(`${path}.type no está soportado`);
      for (const key of ["enabled", "interactive"]) {
        if (overlay[key] != null && typeof overlay[key] !== "boolean") {
          errors.push(`${path}.${key} debe ser booleano`);
        }
      }
      if (overlay.pane != null && !isNonEmptyString(overlay.pane)) {
        errors.push(`${path}.pane debe ser texto`);
      }
      validateZoomRange(overlay, path, errors);
      if (overlay.type === "tile") {
        if (!isNonEmptyString(overlay.url)) errors.push(`${path}.url es obligatoria`);
        else if (/^(?:javascript|data):/i.test(overlay.url)) errors.push(`${path}.url no es segura`);
        if (overlay.attribution != null && typeof overlay.attribution !== "string") {
          errors.push(`${path}.attribution debe ser texto`);
        }
        if (overlay.options != null && !isObject(overlay.options)) {
          errors.push(`${path}.options debe ser un objeto`);
        }
      }
      if (overlay.type === "markers") {
        if (!Array.isArray(overlay.items) && typeof overlay.items !== "function") {
          errors.push(`${path}.items debe ser un array o una función`);
        }
        if (overlay.style != null && !isObject(overlay.style)) {
          errors.push(`${path}.style debe ser un objeto`);
        }
        for (const key of ["pointFor", "labelFor", "formatter", "className"]) {
          if (overlay[key] != null && key !== "className" && typeof overlay[key] !== "function") {
            errors.push(`${path}.${key} debe ser una función`);
          }
          if (key === "className" && overlay[key] != null
            && typeof overlay[key] !== "string" && typeof overlay[key] !== "function") {
            errors.push(`${path}.className debe ser texto o función`);
          }
        }
      }
      if (overlay.control != null) {
        if (!isObject(overlay.control)
          || !isNonEmptyString(overlay.control.id)
          || !isNonEmptyString(overlay.control.label)) {
          errors.push(`${path}.control debe definir id y label`);
        } else {
          const prior = controls.get(overlay.control.id);
          const signature = `${overlay.control.label}|${overlay.enabled === true}`;
          if (prior && prior !== signature) errors.push(`${path}.control no coincide con su grupo`);
          controls.set(overlay.control.id, signature);
        }
      }
    });
    for (const id of duplicateValues(overlays, "id")) {
      errors.push(`map.overlays contiene el id duplicado "${id}"`);
    }

    if (map.labels != null) {
      const labels = map.labels;
      if (!isObject(labels)) errors.push("map.labels debe ser un objeto");
      else {
        validateZoomRange(labels, "map.labels", errors);
        if (labels.enabled != null && typeof labels.enabled !== "boolean") {
          errors.push("map.labels.enabled debe ser booleano");
        }
        if (labels.interactive != null && typeof labels.interactive !== "boolean") {
          errors.push("map.labels.interactive debe ser booleano");
        }
        for (const key of ["label", "pane", "iconClassName"]) {
          if (labels[key] != null && !isNonEmptyString(labels[key])) {
            errors.push(`map.labels.${key} debe ser texto`);
          }
        }
        if (labels.className != null && typeof labels.className !== "string"
          && typeof labels.className !== "function") {
          errors.push("map.labels.className debe ser texto o función");
        }
        if (labels.boundsPadding != null && (
          !Number.isFinite(labels.boundsPadding) || labels.boundsPadding < 0
        )) errors.push("map.labels.boundsPadding debe ser no negativo");
        if (labels.items != null && !Array.isArray(labels.items) && typeof labels.items !== "function") {
          errors.push("map.labels.items debe ser un array o una función");
        }
        for (const key of ["pointFor", "labelFor", "formatter"]) {
          if (labels[key] != null && typeof labels[key] !== "function") {
            errors.push(`map.labels.${key} debe ser una función`);
          }
        }
      }
    }
    if (map.layerControl != null) {
      const control = map.layerControl;
      if (!isObject(control)) errors.push("map.layerControl debe ser un objeto");
      else {
        for (const key of ["enabled", "collapsed"]) {
          if (control[key] != null && typeof control[key] !== "boolean") {
            errors.push(`map.layerControl.${key} debe ser booleano`);
          }
        }
        if (control.position != null
          && !["topleft", "topright", "bottomleft", "bottomright"].includes(control.position)) {
          errors.push("map.layerControl.position no está soportada");
        }
      }
    }
  }

  function validateDetail(detail, fields, errors) {
    if (detail == null) return;
    if (!isObject(detail)) {
      errors.push("detail debe ser un objeto");
      return;
    }
    if (detail.closeLabel != null && !isNonEmptyString(detail.closeLabel)) {
      errors.push("detail.closeLabel debe ser texto no vacío");
    }
    if (detail.notices != null && (
      !Array.isArray(detail.notices)
      || detail.notices.some((notice) => !isNonEmptyString(notice))
    )) errors.push("detail.notices debe ser un array de textos no vacíos");
    if (detail.glossary != null) {
      const glossary = detail.glossary;
      if (!isObject(glossary)) errors.push("detail.glossary debe ser un objeto");
      else {
        if (glossary.enabled != null && typeof glossary.enabled !== "boolean") {
          errors.push("detail.glossary.enabled debe ser booleano");
        }
        if (glossary.enabled !== false) {
          for (const key of ["triggerLabel", "title", "closeLabel"]) {
            if (!isNonEmptyString(glossary[key])) {
              errors.push(`detail.glossary.${key} es obligatorio`);
            }
          }
          if (!fields.some((field) => isNonEmptyString(field?.help))) {
            errors.push("detail.glossary requiere al menos un campo con help");
          }
        }
        for (const key of ["eyebrow", "intro"]) {
          if (glossary[key] != null && !isNonEmptyString(glossary[key])) {
            errors.push(`detail.glossary.${key} debe ser texto no vacío`);
          }
        }
      }
    }
    if (detail.providerCacheSize != null && (
      !Number.isInteger(detail.providerCacheSize) || detail.providerCacheSize <= 0
    )) errors.push("detail.providerCacheSize debe ser un entero positivo");
    if (detail.providers != null && !Array.isArray(detail.providers)) {
      errors.push("detail.providers debe ser un array");
    }
    const providers = Array.isArray(detail.providers) ? detail.providers : [];
    providers.forEach((provider, index) => {
      const path = `detail.providers[${index}]`;
      if (!isObject(provider)) {
        errors.push(`${path} debe ser un objeto`);
        return;
      }
      if (!isNonEmptyString(provider.id)) errors.push(`${path}.id es obligatorio`);
      if (provider.enabled != null && typeof provider.enabled !== "boolean") {
        errors.push(`${path}.enabled debe ser booleano`);
      }
      const builtIn = provider.type === "wikimediaCommons";
      if (!builtIn && typeof provider.load !== "function") {
        errors.push(`${path} debe definir un type soportado o load`);
      }
      if (provider.type != null && !builtIn) errors.push(`${path}.type no está soportado`);
      for (const key of ["load", "normalize", "attribution", "cacheKey", "renderItem", "subjectFor", "altFor"]) {
        if (provider[key] != null && typeof provider[key] !== "function") {
          errors.push(`${path}.${key} debe ser una función`);
        }
      }
      if (!builtIn && typeof provider.renderItem !== "function") {
        errors.push(`${path}.renderItem es obligatorio para providers visuales`);
      }
      for (const key of ["limit", "searchLimit", "radius", "thumbnailWidth"]) {
        if (provider[key] != null && (!Number.isFinite(provider[key]) || provider[key] <= 0)) {
          errors.push(`${path}.${key} debe ser positivo`);
        }
      }
      for (const key of [
        "label", "loadingLabel", "emptyLabel", "errorLabel", "note", "querySuffix",
        "unknownAuthor", "unknownLicense", "latField", "lonField",
      ]) {
        if (provider[key] != null && !isNonEmptyString(provider[key])) {
          errors.push(`${path}.${key} debe ser texto no vacío`);
        }
      }
      if (provider.endpoint != null && (
        !isNonEmptyString(provider.endpoint) || !/^https:\/\//i.test(provider.endpoint)
      )) errors.push(`${path}.endpoint debe ser una URL HTTPS`);
    });
    for (const id of duplicateValues(providers, "id")) {
      errors.push(`detail.providers contiene el id duplicado "${id}"`);
    }
  }

  function validateMethodology(methodology, errors) {
    if (methodology == null) return;
    if (!isObject(methodology)) {
      errors.push("methodology debe ser un objeto");
      return;
    }
    if (methodology.enabled != null && typeof methodology.enabled !== "boolean") {
      errors.push("methodology.enabled debe ser booleano");
    }
    if (methodology.enabled !== false && !isNonEmptyString(methodology.label)) {
      errors.push("methodology.label es obligatorio");
    }
    for (const key of ["summary", "sourcesLabel", "stepsLabel"]) {
      if (methodology[key] != null && !isNonEmptyString(methodology[key])) {
        errors.push(`methodology.${key} debe ser texto no vacío`);
      }
    }
    if (methodology.sources != null && !Array.isArray(methodology.sources)) {
      errors.push("methodology.sources debe ser un array");
    }
    (Array.isArray(methodology.sources) ? methodology.sources : []).forEach((source, index) => {
      if (!isObject(source)
        || !isNonEmptyString(source.name)
        || !isNonEmptyString(source.role)) {
        errors.push(`methodology.sources[${index}] debe definir name y role`);
      }
    });
    if (methodology.steps != null && (
      !Array.isArray(methodology.steps)
      || methodology.steps.some((step) => !isNonEmptyString(step))
    )) errors.push("methodology.steps debe ser un array de textos no vacíos");
    if (methodology.links != null && !Array.isArray(methodology.links)) {
      errors.push("methodology.links debe ser un array");
    }
    (Array.isArray(methodology.links) ? methodology.links : []).forEach((link, index) => {
      if (!isObject(link) || !isNonEmptyString(link.label)
        || !isNonEmptyString(link.url) || !/^https:\/\//i.test(link.url)) {
        errors.push(`methodology.links[${index}] debe definir label y una URL HTTPS`);
      }
    });
  }

  function validateConfig(config) {
    const errors = [];
    if (!isObject(config)) return { valid: false, errors: ["config debe ser un objeto"] };

    validateMap(config.map, errors);

    if (config.ui != null && !isObject(config.ui)) errors.push("ui debe ser un objeto");
    if (config.ui?.locale != null && !isNonEmptyString(config.ui.locale)) {
      errors.push("ui.locale debe ser un texto no vacío");
    }
    if (config.ui?.labels != null) {
      if (!isObject(config.ui.labels)) errors.push("ui.labels debe ser un objeto");
      else {
        for (const [key, value] of Object.entries(config.ui.labels)) {
          if (typeof value !== "string") errors.push(`ui.labels.${key} debe ser texto`);
        }
      }
    }
    for (const labelsKey of ["booleanLabels", "durationLabels"]) {
      const labels = config.ui?.[labelsKey];
      if (labels == null) continue;
      const keys = labelsKey === "booleanLabels" ? ["true", "false"] : ["hour", "minute"];
      if (!isObject(labels) || keys.some((key) => !isNonEmptyString(labels[key]))) {
        errors.push(`ui.${labelsKey} debe definir textos ${keys.join(" y ")}`);
      }
    }
    const search = config.ui?.search;
    if (search != null) {
      if (!isObject(search)) errors.push("ui.search debe ser un objeto");
      else {
        if (search.enabled != null && typeof search.enabled !== "boolean") {
          errors.push("ui.search.enabled debe ser booleano");
        }
        if (search.limit != null && (!Number.isInteger(search.limit) || search.limit <= 0)) {
          errors.push("ui.search.limit debe ser un entero positivo");
        }
        if (search.maxZoom != null && (!Number.isFinite(search.maxZoom) || search.maxZoom <= 0)) {
          errors.push("ui.search.maxZoom debe ser positivo");
        }
      }
    }

    if (!isObject(config.join)) errors.push("join debe ser un objeto");
    else {
      if (!isNonEmptyString(config.join.property)) errors.push("join.property es obligatorio");
      if (!isNonEmptyString(config.join.keyField)) errors.push("join.keyField es obligatorio");
      if (config.join.type && !["string", "number"].includes(config.join.type)) {
        errors.push('join.type debe ser "string" o "number"');
      }
      const normalization = config.join.nameNormalization;
      if (normalization != null && !isObject(normalization)) {
        errors.push("join.nameNormalization debe ser un objeto");
      } else if (normalization?.articles != null && (
        !Array.isArray(normalization.articles)
        || normalization.articles.some((article) => !isNonEmptyString(article))
      )) {
        errors.push("join.nameNormalization.articles debe ser un array de textos");
      }
    }

    if (config.mounts != null) {
      if (!isObject(config.mounts)) errors.push("mounts debe ser un objeto");
      else {
        for (const key of ["rail", "map", "detail", "glossary"]) {
          if (config.mounts[key] != null && !isNonEmptyString(config.mounts[key])) {
            errors.push(`mounts.${key} debe ser un id no vacío`);
          }
        }
      }
    }

    const slider = config.ui?.slider;
    if (slider != null) {
      if (!isObject(slider)) errors.push("ui.slider debe ser un objeto");
      else {
        const min = Number(slider.min);
        const max = Number(slider.max);
        const step = Number(slider.step);
        if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
          errors.push("ui.slider requiere min y max finitos con min < max");
        }
        if (!Number.isFinite(step) || step <= 0) errors.push("ui.slider.step debe ser positivo");
      }
    }

    const indicators = Array.isArray(config.indicators) ? config.indicators : [];
    if (config.indicators != null && !Array.isArray(config.indicators)) {
      errors.push("indicators debe ser un array");
    }
    validateFields(indicators, "indicators", errors);

    if (config.color != null && !isObject(config.color)) errors.push("color debe ser un objeto");
    else if (config.color?.ramp != null) validateRamp(config.color.ramp, errors);

    if (config.scoring != null && !isObject(config.scoring)) {
      errors.push("scoring debe ser un objeto");
    }
    const scoring = isObject(config.scoring) ? config.scoring : {};
    if (scoring.keyField != null && !isNonEmptyString(scoring.keyField)) {
      errors.push("scoring.keyField debe ser un texto no vacío");
    }
    if (scoring.baseMetric != null && !isNonEmptyString(scoring.baseMetric)) {
      errors.push("scoring.baseMetric debe ser un texto no vacío");
    }
    if (scoring.minCoverage != null) {
      const minCoverage = Number(scoring.minCoverage);
      if (!Number.isFinite(minCoverage) || minCoverage < 0 || minCoverage > 1) {
        errors.push("scoring.minCoverage debe ser un número entre 0 y 1");
      }
    }
    if (scoring.factors != null && !Array.isArray(scoring.factors)) {
      errors.push("scoring.factors debe ser un array");
    }
    const factors = Array.isArray(scoring.factors) ? scoring.factors : [];
    factors.forEach((factor, index) => {
      if (!isNonEmptyString(factor?.key)) errors.push(`scoring.factors[${index}].key es obligatorio`);
      if (!isNonEmptyString(factor?.indicator)) {
        errors.push(`scoring.factors[${index}].indicator es obligatorio`);
      }
      if (factor?.kind && !["minmax", "penalty"].includes(factor.kind)) {
        errors.push(`scoring.factors[${index}].kind no está soportado`);
      }
      if (factor?.sign != null && ![1, -1].includes(factor.sign)) {
        errors.push(`scoring.factors[${index}].sign debe ser 1 o -1`);
      }
      if (factor?.defaultWeight != null && !Number.isFinite(Number(factor.defaultWeight))) {
        errors.push(`scoring.factors[${index}].defaultWeight debe ser finito`);
      }
    });
    for (const key of duplicateValues(factors, "key")) {
      errors.push(`scoring.factors contiene la clave duplicada "${key}"`);
    }

    const factorKeys = new Set(factors.map((factor) => factor?.key).filter(Boolean));
    const presets = Array.isArray(scoring.presets) ? scoring.presets : [];
    for (const id of duplicateValues(presets, "id")) {
      errors.push(`scoring.presets contiene el id duplicado "${id}"`);
    }
    presets.forEach((preset, index) => {
      if (!isNonEmptyString(preset?.id)) errors.push(`scoring.presets[${index}].id es obligatorio`);
      if (preset?.weights != null && !isObject(preset.weights)) {
        errors.push(`scoring.presets[${index}].weights debe ser un objeto`);
      }
      for (const key of Object.keys(preset?.weights || {})) {
        if (!factorKeys.has(key)) errors.push(`scoring.presets[${index}].weights.${key} no referencia un factor`);
        if (!Number.isFinite(Number(preset.weights[key]))) {
          errors.push(`scoring.presets[${index}].weights.${key} debe ser finito`);
        }
      }
    });
    if (scoring.defaultPreset && !presets.some((preset) => preset.id === scoring.defaultPreset)) {
      errors.push(`scoring.defaultPreset "${scoring.defaultPreset}" no existe`);
    }

    const detailFields = config.detail?.fields;
    if (detailFields != null && !Array.isArray(detailFields)) errors.push("detail.fields debe ser un array");
    validateFields(Array.isArray(detailFields) ? detailFields : [], "detail.fields", errors);
    validateDetail(config.detail, Array.isArray(detailFields) ? detailFields : [], errors);
    validateMethodology(config.methodology, errors);

    const slots = config.extensions?.slots;
    if (slots != null && !isObject(slots)) errors.push("extensions.slots debe ser un objeto");
    else {
      for (const [name, value] of Object.entries(slots || {})) {
        const handlers = Array.isArray(value) ? value : [value];
        if (!handlers.length || handlers.some((handler) => typeof handler !== "function")) {
          errors.push(`extensions.slots.${name} debe contener funciones`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  function assertValidConfig(config) {
    const result = validateConfig(config);
    if (!result.valid) throw new Error(`Configuración Tesela inválida:\n- ${result.errors.join("\n- ")}`);
    return config;
  }

  return { validateConfig, assertValidConfig };
});
