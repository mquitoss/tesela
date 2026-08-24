import { describe, expect, it, vi } from "vitest";

const commons = require("../../src/providers/wikimedia-commons.js");

function image(title, mime = "image/jpeg") {
  return {
    title,
    imageinfo: [{
      mime,
      thumburl: `https://upload.wikimedia.org/${encodeURIComponent(title)}.jpg`,
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Place.jpg",
      extmetadata: {
        Artist: { value: "<b>Author &amp; Co.</b>" },
        LicenseShortName: { value: "CC BY-SA 4.0" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" },
      },
    }],
  };
}

function fakeDocument() {
  const document = {
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text), children: [] }),
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      attributes: {},
      children: [],
      setAttribute(name, value) { this.attributes[name] = String(value); },
      appendChild(child) { this.children.push(child); return child; },
    }),
  };
  return document;
}

function descendants(element) {
  return (element?.children || []).flatMap((child) => [child, ...descendants(child)]);
}

describe("Wikimedia Commons provider", () => {
  it("construye búsquedas geográficas o textuales sin acoplar una región", () => {
    const geo = new URL(commons.buildCommonsUrl({ name: "Place", lat: 41.2, lon: 2.1 }));
    expect(geo.searchParams.get("generator")).toBe("geosearch");
    expect(geo.searchParams.get("ggscoord")).toBe("41.2|2.1");
    const text = new URL(commons.buildCommonsUrl({ name: "Place" }, { querySuffix: "Country" }));
    expect(text.searchParams.get("generator")).toBe("search");
    expect(text.searchParams.get("gsrsearch")).toBe("Place Country");
  });

  it("selecciona fotos, elimina duplicados y preserva atribución segura", () => {
    const payload = { query: { pages: {
      1: image("File:Main square.jpg"),
      2: image("File:Map of place.jpg"),
      3: image("File:001 Main square (Place).jpg"),
      4: image("File:Landscape.webp", "image/webp"),
      5: image("File:Vector.svg", "image/svg+xml"),
    } } };
    const selected = commons.selectCommonsImages(payload, { limit: 3 });
    expect(selected.map(({ title }) => title)).toEqual(["Main square", "Landscape"]);
    expect(selected[0]).toMatchObject({
      author: "Author & Co.",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    });
    expect(commons.safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(commons.titleSignature("File:広場の風景.jpg")).toBe("広場の風景");
  });

  it("propaga AbortSignal, normaliza y renderiza sin HTML externo", async () => {
    const payload = { query: { pages: { 1: image("File:<img onerror=alert(1)>.jpg") } } };
    const fetcher = vi.fn(async (_url, { signal }) => ({
      ok: true,
      json: async () => payload,
      signal,
    }));
    const provider = commons.createWikimediaCommonsProvider({ fetcher, limit: 1 });
    const controller = new AbortController();
    const raw = await provider.load({ zone: { key: "1", name: "Place" } }, { signal: controller.signal });
    const items = provider.normalize(raw);
    expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
    const card = provider.renderItem(fakeDocument(), items[0], { zone: { name: "Place" } });
    expect(card.tagName).toBe("FIGURE");
    expect(descendants(card).some((node) => node.tagName === "IMG")).toBe(true);
    expect(descendants(card).some((node) => node.tagName === "IMG" && node.attributes.src.includes("onerror")))
      .toBe(true);
    expect(descendants(card).filter((node) => node.tagName === "IMG")).toHaveLength(1);
  });
});
