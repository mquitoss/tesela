import { describe, it, expect } from "vitest";
import {
  existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath, resolve } from "node:path";
import vm from "node:vm";

const namespace = require("../../src/engine/namespace.js");
const configEngine = require("../../src/engine/config.js");
const extensions = require("../../src/engine/extensions.js");
const join = require("../../src/engine/join.js");
const scoring = require("../../src/engine/scoring.js");
const color = require("../../src/engine/color.js");
const geo = require("../../src/engine/geo.js");
const bundle = require("../../src/engine/bundle.js");
const format = require("../../src/engine/format.js");
const appConfig = require("../../app.config.js");
const packageConfig = require("../../package.json");
const assetManifest = require("../../tesela.assets.json");
const releaseEngine = require("../../scripts/release.js");
const projectRoot = process.cwd();

function browserContext() {
  const context = {};
  context.self = context;
  vm.createContext(context);
  return context;
}

function runBrowserScript(context, path) {
  vm.runInContext(readFileSync(resolve(process.cwd(), path), "utf8"), context);
}

function fakeBrowser() {
  const elements = new Map();
  const styles = new Map();
  const makeElement = (tag = "div") => ({
    tagName: tag.toUpperCase(),
    nodeType: 1,
    children: [],
    className: "",
    classList: { values: new Set(), add(value) { this.values.add(value); } },
    setAttribute() {},
    addEventListener() {},
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
  });
  for (const id of ["ssm-rail", "ssm-map", "ssm-detail"]) elements.set(id, makeElement());
  const document = {
    readyState: "complete",
    documentElement: { style: { setProperty: (name, value) => styles.set(name, value) } },
    createElement: makeElement,
    createTextNode: (text) => ({ nodeType: 3, textContent: text }),
    getElementById: (id) => elements.get(id) || null,
    addEventListener() {},
  };
  const bounds = { isValid: () => true };
  const map = { setView() { return this; }, fitBounds() {} };
  const L = {
    map: () => map,
    tileLayer: () => ({ addTo: () => ({}) }),
    geoJSON: (geojson, options) => {
      for (const feature of geojson.features || []) {
        options.style(feature);
        options.onEachFeature(feature, {
          bindTooltip() {},
          on() {},
          setStyle() {},
        });
      }
      return {
        addTo() { return this; },
        remove() {},
        getBounds: () => bounds,
      };
    },
  };
  const context = browserContext();
  Object.assign(context, { window: context, document, L, console });
  return { context, elements, styles };
}

describe("namespace Tesela", () => {
  it("comparte identidad con el alias SSM y publica el engine", () => {
    const context = browserContext();
    runBrowserScript(context, "src/engine/namespace.js");
    runBrowserScript(context, "src/engine/color.js");
    expect(context.Tesela).toBe(context.SSM);
    expect(typeof context.Tesela.engine.colorForValue).toBe("function");
  });

  it("expone la misma configuración bajo ambos nombres", () => {
    const context = browserContext();
    runBrowserScript(context, "app.config.js");
    expect(context.TESELA_CONFIG).toBe(context.SSM_CONFIG);
    expect(context.TESELA_CONFIG.branding.title).toBe("Tesela");
  });

  it("conserva un namespace SSM previo", () => {
    const legacy = { adapters: { legacy: true } };
    const root = { SSM: legacy };
    expect(namespace.ensureNamespace(root)).toBe(legacy);
    expect(root.Tesela).toBe(root.SSM);
  });

  it("prioriza config y datos Tesela con fallback legacy", () => {
    const root = {
      TESELA_CONFIG: { id: "new" },
      SSM_CONFIG: { id: "old" },
      TESELA_DATA: { id: "new-data" },
      SSM_DATA: { id: "old-data" },
    };
    expect(namespace.resolveConfig(root).id).toBe("new");
    expect(namespace.resolveEmbeddedData(root, {}).data.id).toBe("new-data");
    expect(namespace.resolveEmbeddedData(
      { CUSTOM_DATA: { id: "custom" }, TESELA_DATA: root.TESELA_DATA },
      { branding: { dataNamespace: "CUSTOM_DATA" } },
    ).data.id).toBe("custom");
    expect(namespace.resolveEmbeddedData({ SSM_DATA: root.SSM_DATA }, {}).data.id).toBe("old-data");
  });
});

describe("shell zero-build", () => {
  it("arranca con globals Tesela y el bundle generado", () => {
    const { context, elements, styles } = fakeBrowser();
    for (const path of [
      "src/engine/namespace.js", "app.config.js", "data/bundle.js",
      "src/engine/format.js", "src/engine/geo.js", "src/engine/join.js",
      "src/engine/scoring.js", "src/engine/color.js", "src/engine/bundle.js",
      "src/engine/config.js", "src/engine/extensions.js", "src/adapters/domain.js",
      "src/app.js",
    ]) runBrowserScript(context, path);

    expect(context.Tesela).toBe(context.SSM);
    expect(context.TESELA_DATA).toBe(context.SSM_DATA);
    expect(context.Tesela.app.getState().zones).toBe(73);
    expect(elements.get("ssm-rail").children.length).toBeGreaterThan(0);
    expect(styles.get("--tesela-accent")).toBe("#5EEAD4");
  });

  it("abre un bundle legacy que solo expone SSM_DATA", () => {
    const { context } = fakeBrowser();
    runBrowserScript(context, "src/engine/namespace.js");
    runBrowserScript(context, "app.config.js");
    const legacyFeature = square(1, "Zona legacy");
    legacyFeature.properties.BARRI = 1;
    context.SSM_DATA = {
      geo: { type: "FeatureCollection", features: [legacyFeature] },
      indicators: [{ codi: 1, nom: "Zona legacy", poblacio: 10, area_km2: 1, densitat: 10 }],
    };
    for (const path of [
      "src/engine/format.js", "src/engine/geo.js", "src/engine/join.js",
      "src/engine/scoring.js", "src/engine/color.js", "src/engine/bundle.js",
      "src/engine/config.js", "src/engine/extensions.js", "src/adapters/domain.js",
      "src/app.js",
    ]) runBrowserScript(context, path);
    expect(context.Tesela.app.getState().zones).toBe(1);
    expect(context.Tesela.app.getState().matched).toBe(1);
  });
});

describe("distribución como submódulo", () => {
  it("publica un manifiesto versionado cuyos assets existen", () => {
    expect(assetManifest.version).toBe(packageConfig.version);
    for (const path of [
      ...assetManifest.styles,
      ...assetManifest.scripts.runtime,
      ...assetManifest.scripts.engine,
      assetManifest.scripts.defaultAdapter,
      assetManifest.scripts.entrypoint,
    ]) {
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(true);
    }
  });

  it("mantiene estilos fuera del HTML y ofrece una plantilla de host", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain('href="src/ui/tesela.css"');
    expect(html).not.toContain("<style>");
    expect(existsSync(resolve(process.cwd(), "templates/submodule-host/index.html"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "templates/submodule-host/scripts/source.py"))).toBe(true);
  });

  it("incluye una configuración host válida con mounts propios", () => {
    const context = browserContext();
    runBrowserScript(context, "templates/submodule-host/app.config.js");
    expect(configEngine.validateConfig(context.TESELA_CONFIG).valid).toBe(true);
    expect(context.TESELA_CONFIG.mounts.map).toBe("map");
  });
});

describe("configuración", () => {
  it("valida la configuración de ejemplo", () => {
    expect(configEngine.validateConfig(appConfig)).toEqual({ valid: true, errors: [] });
    expect(appConfig.branding.title).toBe("Tesela");
    expect(appConfig.branding.version).toBe(packageConfig.version);
    expect(readFileSync(resolve(projectRoot, "pyproject.toml"), "utf8")).toContain(
      `version = "${packageConfig.version}"`,
    );
    expect(require("../../package-lock.json").version).toBe(packageConfig.version);
  });

  it("detecta duplicados y referencias de preset inválidas", () => {
    const invalid = {
      join: { property: "ID", keyField: "id" },
      indicators: [{ key: "value" }, { key: "value" }],
      scoring: {
        factors: [{ key: "quality", indicator: "value" }],
        presets: [{ id: "default", weights: { missing: 1 } }],
        defaultPreset: "unknown",
      },
      color: { ramp: [[0, 0, 0], [999, 0, 0]] },
    };
    const result = configEngine.validateConfig(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/duplicada/);
    expect(result.errors.join(" ")).toMatch(/no referencia un factor/);
    expect(result.errors.join(" ")).toMatch(/no existe/);
    expect(result.errors.join(" ")).toMatch(/canales 0\.\.255/);
  });

  it("valida el contrato de scoring explicable", () => {
    const invalid = {
      join: { property: "ID", keyField: "id" },
      scoring: {
        keyField: "",
        baseMetric: 42,
        minCoverage: 1.1,
        factors: [{
          key: "quality",
          indicator: "value",
          kind: "unknown",
          sign: 0,
          defaultWeight: Infinity,
        }],
        presets: [{ id: "default", weights: { quality: NaN } }],
      },
    };
    const errors = configEngine.validateConfig(invalid).errors.join(" ");
    expect(errors).toMatch(/scoring\.keyField/);
    expect(errors).toMatch(/scoring\.baseMetric/);
    expect(errors).toMatch(/scoring\.minCoverage/);
    expect(errors).toMatch(/kind no está soportado/);
    expect(errors).toMatch(/sign debe ser 1 o -1/);
    expect(errors).toMatch(/defaultWeight debe ser finito/);
    expect(errors).toMatch(/weights\.quality debe ser finito/);
  });
});

describe("sistema de releases", () => {
  it("valida y ordena versiones semánticas estables", () => {
    expect(releaseEngine.compareVersions("0.3.0", "0.2.9")).toBe(1);
    expect(releaseEngine.compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(() => releaseEngine.parseVersion("v1.0.0")).toThrow(/inválida/);
    expect(() => releaseEngine.parseVersion("1.0")).toThrow(/inválida/);
  });

  it("convierte Unreleased y permite publicar la versión bootstrap", () => {
    expect(releaseEngine.updateChangelog(
      "# Changelog\n\n## [Unreleased]\n\n### Añadido\n- Cambio\n",
      "0.3.0",
      "2026-08-23",
    )).toContain("## [0.3.0] - 2026-08-23\n\n### Añadido");
    expect(releaseEngine.updateChangelog(
      "# Changelog\n\n## 0.2.0 — sin publicar\n\n- Inicial\n",
      "0.2.0",
      "2026-08-23",
    )).toContain("## [Unreleased]\n\n## [0.2.0] - 2026-08-23");
    expect(() => releaseEngine.updateChangelog(
      "# Changelog\n\n## [Unreleased]\n",
      "0.3.0",
      "2026-08-23",
    )).toThrow(/vacía/);
  });

  it("sincroniza todos los ficheros versionados", () => {
    const root = mkdtempSync(joinPath(tmpdir(), "tesela-release-"));
    try {
      writeFileSync(joinPath(root, "package.json"), '{"name":"tesela","version":"0.2.0"}\n');
      writeFileSync(joinPath(root, "package-lock.json"), '{"version":"0.2.0","packages":{"":{"version":"0.2.0"}}}\n');
      writeFileSync(joinPath(root, "tesela.assets.json"), '{"version":"0.2.0"}\n');
      writeFileSync(joinPath(root, "pyproject.toml"), '[project]\nversion = "0.2.0"\n\n[tool]\npython_version = "3.10"\n');
      writeFileSync(joinPath(root, "app.config.js"), 'const x={branding:{\n  version: "0.2.0",\n}};\n');
      writeFileSync(joinPath(root, "CHANGELOG.md"), '# Changelog\n\n## [Unreleased]\n\n- Cambio\n');

      releaseEngine.synchronizeVersion(root, "0.3.0", "2026-08-23");

      expect(JSON.parse(readFileSync(joinPath(root, "package.json"), "utf8")).version).toBe("0.3.0");
      expect(JSON.parse(readFileSync(joinPath(root, "package-lock.json"), "utf8")).packages[""].version).toBe("0.3.0");
      expect(JSON.parse(readFileSync(joinPath(root, "tesela.assets.json"), "utf8")).version).toBe("0.3.0");
      expect(readFileSync(joinPath(root, "pyproject.toml"), "utf8")).toContain('version = "0.3.0"');
      expect(readFileSync(joinPath(root, "pyproject.toml"), "utf8")).toContain('python_version = "3.10"');
      expect(readFileSync(joinPath(root, "app.config.js"), "utf8")).toContain('version: "0.3.0"');
      expect(releaseEngine.assertVersionSynchronized(root, "0.3.0", true)).toBe(true);
      writeFileSync(joinPath(root, "tesela.assets.json"), '{"version":"9.9.9"}\n');
      expect(() => releaseEngine.assertVersionSynchronized(root, "0.3.0", true)).toThrow(
        /tesela\.assets\.json/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("planifica nombres de rama y tag sin modificar Git", () => {
    const root = mkdtempSync(joinPath(tmpdir(), "tesela-release-plan-"));
    try {
      writeFileSync(joinPath(root, "package.json"), '{"version":"0.2.0"}\n');
      writeFileSync(joinPath(root, "CHANGELOG.md"), '# Changelog\n\n## [Unreleased]\n');
      expect(releaseEngine.release({ root, version: "0.3.0", dryRun: true })).toMatchObject({
        branch: "release/v0.3.0",
        tag: "v0.3.0",
        dryRun: true,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("parsea push y remoto explícitos", () => {
    expect(releaseEngine.parseArguments(["0.3.0", "--push", "--remote", "upstream"])).toMatchObject({
      version: "0.3.0", push: true, remote: "upstream",
    });
  });
});

describe("slots de extensión", () => {
  it("combina handlers, conserva orden y aísla errores", () => {
    const result = extensions.runSlot([
      { "detail.afterFields": [(context) => context.zone, () => { throw new Error("boom"); }] },
      { "detail.afterFields": () => "adapter" },
    ], "detail.afterFields", { zone: "config" });
    expect(result.outputs).toEqual(["config", "adapter"]);
    expect(result.errors).toHaveLength(1);
  });
});

const square = (id, nom) => ({
  type: "Feature",
  properties: { ID: id, NOM: nom },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    ],
  },
});

describe("join.normalizeName", () => {
  it("quita acentos, artículo inicial y colapsa espacios", () => {
    expect(join.normalizeName("el Raval")).toBe("raval");
    expect(join.normalizeName("la  Barceloneta")).toBe("barceloneta");
    expect(join.normalizeName("Gràcia")).toBe("gracia");
    expect(join.normalizeName(null)).toBe("");
  });
  it("permite configurar los artículos del idioma", () => {
    expect(join.normalizeName("the Valley", { articles: ["the"] })).toBe("valley");
    expect(join.normalizeName("la Barceloneta", { removeArticles: false })).toBe("la barceloneta");
  });
});

describe("join.joinByKey", () => {
  const geojson = {
    type: "FeatureCollection",
    features: [square(1, "el Raval"), square(2, "Gràcia"), square(3, "Sants")],
  };
  const cfg = { property: "ID", keyField: "codi", type: "number", nameFallback: true, nameField: "nom" };

  it("une por clave canónica", () => {
    const inds = [
      { codi: 1, nom: "Raval", v: 10 },
      { codi: 2, nom: "Gracia", v: 20 },
    ];
    const r = join.joinByKey(geojson, inds, cfg);
    expect(r.matched).toBe(2);
    expect(r.unmatched).toBe(1);
    expect(r.zones[0].ind.v).toBe(10);
    expect(r.zones[2].ind).toBeNull();
  });

  it("cae a fallback por nombre normalizado cuando no hay clave", () => {
    const inds = [{ nom: "el Raval", v: 99 }]; // sin codi
    const r = join.joinByKey(geojson, inds, cfg);
    expect(r.matched).toBe(1);
    expect(r.usedNameFallback).toBe(1);
    expect(r.zones[0].ind.v).toBe(99);
  });

  it("no usa fallback si nameFallback es false", () => {
    const inds = [{ nom: "el Raval", v: 99 }];
    const r = join.joinByKey(geojson, inds, { ...cfg, nameFallback: false });
    expect(r.matched).toBe(0);
  });

  it("informa claves duplicadas sin sobrescribir el primer indicador", () => {
    const inds = [{ codi: 1, v: 10 }, { codi: 1, v: 99 }];
    const r = join.joinByKey(geojson, inds, cfg);
    expect(r.duplicateIndicatorKeys).toEqual([1]);
    expect(r.zones[0].ind.v).toBe(10);
  });
});

describe("scoring.minmax", () => {
  it("excluye nulls del rango y los mapea a null", () => {
    expect(scoring.minmax([0, 5, 10])).toEqual([0, 0.5, 1]);
    expect(scoring.minmax([0, null, 10])).toEqual([0, null, 1]);
  });
  it("span 0 → 0.5 neutro", () => {
    expect(scoring.minmax([7, 7, 7])).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("scoring.computeScores", () => {
  const cfg = {
    factors: [
      { key: "dens", indicator: "densitat", kind: "minmax", sign: 1 },
      { key: "pob", indicator: "poblacio", kind: "minmax", sign: 1 },
    ],
    baseMetric: "densitat",
    keyField: "codi",
  };

  it("puntúa por factores ponderados y normaliza a 0..100", () => {
    const inds = [
      { codi: 1, densitat: 100, poblacio: 1000 },
      { codi: 2, densitat: 50, poblacio: 500 },
    ];
    const r = scoring.computeScores(inds, { dens: 1, pob: 1 }, cfg);
    expect(r.map((x) => x.score)).toEqual([100, 0]);
  });

  it("excluye del ranking las zonas sin baseMetric (score null)", () => {
    const inds = [
      { codi: 1, densitat: 100, poblacio: 1000 },
      { codi: 2, densitat: null, poblacio: 500 },
    ];
    const r = scoring.computeScores(inds, { dens: 1, pob: 1 }, cfg);
    expect(r[1].score).toBeNull();
    expect(r[1].contributions).toBeNull();
  });

  it("un factor penalty siempre resta", () => {
    const penaltyCfg = {
      factors: [
        { key: "dens", indicator: "densitat", kind: "minmax", sign: 1 },
        { key: "pen", indicator: "flag", kind: "penalty" },
      ],
      baseMetric: "densitat",
      keyField: "codi",
    };
    const inds = [
      { codi: 1, densitat: 100, flag: true },
      { codi: 2, densitat: 100, flag: false },
    ];
    const r = scoring.computeScores(inds, { dens: 0, pen: 1 }, penaltyCfg);
    // El penalizado (flag=true) recibe contribución negativa → menor score.
    expect(r[0].contributions.pen).toBeLessThan(0);
    expect(r[0].score).toBeLessThan(r[1].score);
  });

  it("sign -1 invierte el factor (favorece valores bajos)", () => {
    const inds = [
      { codi: 1, densitat: 100 },
      { codi: 2, densitat: 50 },
    ];
    const cheap = { factors: [{ key: "dens", indicator: "densitat", kind: "minmax", sign: -1 }], baseMetric: "densitat", keyField: "codi" };
    const r = scoring.computeScores(inds, { dens: 1 }, cheap);
    expect(r[0].score).toBeLessThan(r[1].score); // el de mayor densidad puntúa menos
  });
});

describe("color", () => {
  it("extent excluye huecos", () => {
    const ext = color.extent([{ v: 10 }, { v: null }, { v: 30 }], (z) => z.v);
    expect(ext).toEqual({ min: 10, max: 30 });
  });
  it("colorForValue null → null (no se pinta como mínimo)", () => {
    expect(color.colorForValue(null, { min: 0, max: 10 })).toBeNull();
  });
  it("rampColor recorta t a [0,1]", () => {
    expect(color.rampColor(-5)).toMatch(/^rgb\(/);
    expect(color.rampColor(5)).toMatch(/^rgb\(/);
  });
  it("usa la rampa de la config si se pasa", () => {
    const ramp = [
      [0, 0, 0],
      [255, 255, 255],
    ];
    expect(color.rampColor(1, ramp)).toBe("rgb(255,255,255)");
    expect(color.rampColor(0, ramp)).toBe("rgb(0,0,0)");
  });
});

describe("geo", () => {
  const feat = square(1, "x");
  it("keyFromFeature respeta el tipo", () => {
    expect(geo.keyFromFeature(feat, "ID", "number")).toBe(1);
    expect(geo.keyFromFeature(feat, "ID", "string")).toBe("1");
    expect(geo.keyFromFeature(feat, "NOPE")).toBeNull();
  });
  it("representativePoint da el centroide del anillo exterior", () => {
    expect(geo.representativePoint(feat)).toEqual({ lat: 0.5, lng: 0.5 });
  });
  it("pointInPolygon dentro/fuera", () => {
    expect(geo.pointInPolygon({ lat: 0.5, lng: 0.5 }, feat)).toBe(true);
    expect(geo.pointInPolygon({ lat: 2, lng: 2 }, feat)).toBe(false);
  });
  it("distanceMeters: puntos idénticos → 0", () => {
    expect(geo.distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
  });
  it("countWithinRadius cuenta solo dentro del radio", () => {
    const center = { lat: 0, lng: 0 };
    const pts = [{ lat: 0, lng: 0 }, { lat: 0.001, lon: 0 }, { lat: 5, lng: 5 }];
    expect(geo.countWithinRadius(center, pts, 200)).toBe(2);
  });
});

describe("bundle", () => {
  const valid = { geo: { type: "FeatureCollection", features: [square(1, "x")] }, indicators: [{ codi: 1 }] };
  it("isValidBundle exige geo + indicators no vacíos", () => {
    expect(bundle.isValidBundle(valid)).toBe(true);
    expect(bundle.isValidBundle({ geo: valid.geo, indicators: [] })).toBe(false);
    expect(bundle.isValidBundle(null)).toBe(false);
  });
  it("selectDataSource elige el primer válido en la escalera", () => {
    const r = bundle.selectDataSource({ embedded: null, url: valid });
    expect(r.source).toBe("url");
    expect(r.bundle.indicators.length).toBe(1);
  });
  it("availableLevels y getLevel single-level", () => {
    expect(bundle.availableLevels(valid)).toEqual(["default"]);
    expect(bundle.getLevel(valid, "default").indicators.length).toBe(1);
  });
  it("multi-nivel respeta el orden preferido", () => {
    const ml = { levels: { seccio: { geo: valid.geo, indicators: [] }, barri: { geo: valid.geo, indicators: [{ codi: 1 }] } } };
    expect(bundle.availableLevels(ml, ["barri", "seccio"])).toEqual(["barri", "seccio"]);
    expect(bundle.getLevel(ml, "barri").indicators.length).toBe(1);
    expect(bundle.isValidBundle(ml)).toBe(true);
    expect(bundle.selectDataSource({ embedded: ml }).source).toBe("embedded");
  });
});

describe("format", () => {
  it("formatNumber con coma decimal y unidad; null → sin dato", () => {
    expect(format.formatNumber(1234.5, { decimals: 1, unit: "hab/km²" })).toBe("1234,5 hab/km²");
    expect(format.formatNumber(null)).toBe("sin dato");
  });
  it("formatPercent", () => {
    expect(format.formatPercent(5.56)).toBe("5,6%");
  });
  it("formatValue despacha por descriptor", () => {
    expect(format.formatValue(3, { format: "number" })).toBe("3");
    expect(format.formatValue("hola", { format: "plain" })).toBe("hola");
    expect(format.formatValue(null, { format: "percent" })).toBe("sin dato");
  });
  it("permite locale y marcador de hueco configurables", () => {
    expect(format.formatNumber(1234.5, { decimals: 1, locale: "en-US" })).toBe("1234.5");
    expect(format.formatNumber(1234.5, { decimals: 1, locale: "locale-inexistente" })).toBe("1234.5");
    expect(format.formatValue(null, { sinDato: "n/a" })).toBe("n/a");
  });
});
