import { describe, expect, it } from "vitest";

const { validateConfig } = require("../../src/engine/config.js");
const fixture = require("../fixtures/contracts/overlays-v1.json");

const base = (map) => ({
  join: { property: "ID", keyField: "id" },
  map,
});

describe("configuración declarativa de capas", () => {
  it("acepta los descriptores tile y markers congelados", () => {
    expect(validateConfig(base({ overlays: fixture.valid })).errors).toEqual([]);
  });

  it("rechaza ids, tipos y URLs inválidas", () => {
    const result = validateConfig(base({
      overlays: [
        ...fixture.invalid,
        { id: "unsafe", label: "Unsafe", type: "tile", url: "javascript:alert(1)" },
        { id: "empty", label: "Empty", type: "markers", items: null },
        { id: "unsafe", label: "Duplicate", type: "tile", url: "/tiles/{z}/{x}/{y}.png" },
      ],
    }));
    const errors = result.errors.join(" ");
    expect(errors).toMatch(/id es obligatorio/);
    expect(errors).toMatch(/type no está soportado/);
    expect(errors).toMatch(/url no es segura/);
    expect(errors).toMatch(/items debe ser un array o una función/);
    expect(errors).toMatch(/id duplicado "unsafe"/);
  });

  it("valida zoom, panes, selección, etiquetas y grupos de control", () => {
    const result = validateConfig(base({
      panes: {
        first: { name: "same", zIndex: NaN },
        second: { name: "same" },
      },
      selection: { enabled: "yes", style: [] },
      overlays: [
        {
          id: "a", label: "A", type: "tile", url: "/a", enabled: true,
          control: { id: "group", label: "Group" },
        },
        {
          id: "b", label: "B", type: "tile", url: "/b", enabled: false,
          control: { id: "group", label: "Other" },
        },
      ],
      labels: { enabled: "yes", minZoom: 12, maxZoom: 10, boundsPadding: -1 },
      layerControl: { enabled: "yes", position: "center" },
    }));
    const errors = result.errors.join(" ");
    expect(errors).toMatch(/nombre duplicado "same"/);
    expect(errors).toMatch(/zIndex debe ser finito/);
    expect(errors).toMatch(/selection.enabled debe ser booleano/);
    expect(errors).toMatch(/selection.style debe ser un objeto/);
    expect(errors).toMatch(/control no coincide/);
    expect(errors).toMatch(/minZoom no puede superar maxZoom/);
    expect(errors).toMatch(/boundsPadding debe ser no negativo/);
    expect(errors).toMatch(/layerControl.enabled debe ser booleano/);
    expect(errors).toMatch(/position no está soportada/);
  });
});
