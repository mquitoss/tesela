import { describe, expect, it } from "vitest";

const { validateConfig } = require("../../src/engine/config.js");

const base = (extra) => ({ join: { property: "ID", keyField: "id" }, ...extra });

describe("configuración de detalle y metodología", () => {
  it("acepta contenido neutral completamente declarativo", () => {
    const result = validateConfig(base({
      mounts: { glossary: "glossary" },
      detail: {
        closeLabel: "Close detail",
        notices: ["Check the source before making decisions."],
        glossary: {
          enabled: true,
          triggerLabel: "Guide",
          title: "Definitions",
          closeLabel: "Close guide",
        },
        fields: [{
          key: "metric",
          label: "Metric",
          section: "Summary",
          help: "Description of the metric.",
        }],
      },
      methodology: {
        enabled: true,
        label: "Methodology",
        sources: [{ name: "Source", role: "Geometry" }],
        steps: ["Join records."],
        links: [{ label: "Documentation", url: "https://example.test/docs" }],
      },
    }));
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rechaza glosarios, avisos y textos de campo incompletos", () => {
    const result = validateConfig(base({
      mounts: { glossary: 42 },
      detail: {
        closeLabel: "",
        notices: [""],
        glossary: { enabled: true },
        fields: [{ key: "metric", label: "Metric", section: "", help: "" }],
      },
    }));
    const errors = result.errors.join(" ");
    expect(errors).toMatch(/mounts\.glossary/);
    expect(errors).toMatch(/detail\.closeLabel/);
    expect(errors).toMatch(/detail\.notices/);
    expect(errors).toMatch(/detail\.glossary\.triggerLabel/);
    expect(errors).toMatch(/detail\.glossary\.title/);
    expect(errors).toMatch(/detail\.glossary\.closeLabel/);
    expect(errors).toMatch(/requiere al menos un campo con help/);
    expect(errors).toMatch(/section debe ser texto no vacío/);
    expect(errors).toMatch(/help debe ser texto no vacío/);
  });

  it("rechaza fuentes, pasos y enlaces metodológicos inseguros", () => {
    const result = validateConfig(base({
      methodology: {
        enabled: "yes",
        label: "",
        sources: [{ name: "Source" }],
        steps: [""],
        links: [{ label: "Unsafe", url: "javascript:alert(1)" }],
      },
    }));
    const errors = result.errors.join(" ");
    expect(errors).toMatch(/methodology\.enabled/);
    expect(errors).toMatch(/methodology\.label/);
    expect(errors).toMatch(/sources\[0\]/);
    expect(errors).toMatch(/steps debe ser un array/);
    expect(errors).toMatch(/URL HTTPS/);
  });

  it("valida providers built-in y extensiones visuales", () => {
    const valid = validateConfig(base({
      detail: {
        providerCacheSize: 8,
        providers: [
          { id: "commons", type: "wikimediaCommons", limit: 3 },
          {
            id: "custom",
            load: async () => [],
            normalize: (value) => value,
            renderItem: () => null,
          },
        ],
        fields: [],
      },
    }));
    expect(valid).toEqual({ valid: true, errors: [] });

    const invalid = validateConfig(base({
      detail: {
        providerCacheSize: 0,
        providers: [
          { id: "same", type: "unknown" },
          {
            id: "same",
            load: async () => [],
            endpoint: "http://example.test/api",
            limit: -1,
            loadingLabel: "",
          },
        ],
        fields: [],
      },
    }));
    const errors = invalid.errors.join(" ");
    expect(errors).toMatch(/providerCacheSize/);
    expect(errors).toMatch(/type no está soportado/);
    expect(errors).toMatch(/renderItem es obligatorio/);
    expect(errors).toMatch(/endpoint debe ser una URL HTTPS/);
    expect(errors).toMatch(/limit debe ser positivo/);
    expect(errors).toMatch(/loadingLabel debe ser texto no vacío/);
    expect(errors).toMatch(/id duplicado "same"/);
  });
});
