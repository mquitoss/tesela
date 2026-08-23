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
        if (field[key] != null && typeof field[key] !== "string") {
          errors.push(`${fieldPath}.${key} debe ser texto`);
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

  function validateConfig(config) {
    const errors = [];
    if (!isObject(config)) return { valid: false, errors: ["config debe ser un objeto"] };

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
        for (const key of ["rail", "map", "detail"]) {
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
