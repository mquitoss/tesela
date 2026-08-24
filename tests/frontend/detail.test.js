import { describe, expect, it, vi } from "vitest";

const { createDetailController, renderMethodology } = require("../../src/ui/detail.js");
const { createProviderRuntime } = require("../../src/engine/providers.js");

function fakeDocument() {
  const listeners = new Map();
  const document = {
    activeElement: null,
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text), children: [] }),
    createElement: (tag) => {
      const classes = new Set();
      return {
        nodeType: 1,
        tagName: tag.toUpperCase(),
        id: "",
        className: "",
        children: [],
        attributes: {},
        handlers: {},
        isConnected: true,
        classList: {
          add: (value) => classes.add(value),
          remove: (value) => classes.delete(value),
          contains: (value) => classes.has(value),
        },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
          if (name === "id") this.id = String(value);
        },
        getAttribute(name) { return this.attributes[name] ?? null; },
        removeAttribute(name) { delete this.attributes[name]; },
        addEventListener(type, handler) { this.handlers[type] = handler; },
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...children) { this.children = children; },
        focus() { document.activeElement = this; },
        dispatch(type, extra = {}) {
          this.handlers[type]?.({ currentTarget: this, target: this, ...extra });
        },
      };
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    dispatch(type, event) { listeners.get(type)?.(event); },
    listeners,
  };
  return document;
}

function descendants(element) {
  return (element?.children || []).flatMap((child) => [child, ...descendants(child)]);
}

function text(element) {
  if (element?.nodeType === 3) return element.textContent;
  return (element?.children || []).map(text).join("");
}

describe("detail controller", () => {
  function setup() {
    const document = fakeDocument();
    const detail = document.createElement("aside");
    detail.id = "detail";
    const glossary = document.createElement("aside");
    glossary.id = "glossary";
    const trigger = document.createElement("button");
    trigger.setAttribute("aria-controls", "detail");
    trigger.setAttribute("aria-expanded", "false");
    const closed = [];
    const controller = createDetailController({
      document,
      detailElement: detail,
      glossaryElement: glossary,
      detailConfig: {
        closeLabel: "Close detail",
        glossary: {
          enabled: true,
          triggerLabel: "Guide",
          title: "Definitions",
          closeLabel: "Close guide",
          intro: "How to read this map.",
        },
        fields: [
          { key: "a", label: "Metric A", section: "Group A", help: "Meaning A" },
          { key: "b", label: "Metric B", help: "<img src=x onerror=alert(1)>" },
          { key: "c", label: "Metric C", section: "Group C" },
        ],
        notices: ["Host notice"],
      },
      formatValue: (value) => `value:${value}`,
      beforeFields: (container) => container.appendChild(document.createTextNode("before")),
      afterFields: (container) => container.appendChild(document.createTextNode("after")),
      onClose: (payload) => closed.push(payload.zone.name),
    });
    return { document, detail, glossary, trigger, closed, controller };
  }

  it("renderiza secciones, valores, avisos y slots en orden", () => {
    const context = setup();
    context.controller.open({
      zone: { name: "Zone", ind: { a: 1, b: 2, c: 3 } },
      scoreText: "Score 50",
      trigger: context.trigger,
      focus: true,
    });
    expect(context.detail.getAttribute("aria-hidden")).toBe("false");
    expect(context.detail.getAttribute("inert")).toBeNull();
    expect(context.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(text(context.detail)).toContain("Group AMetric Avalue:1Metric Bvalue:2");
    expect(text(context.detail)).toContain("Group CMetric Cvalue:3Host noticeafter");
    expect(text(context.detail).indexOf("before")).toBeLessThan(text(context.detail).indexOf("Metric A"));
    expect(context.document.activeElement.tagName).toBe("H2");
  });

  it("deriva un glosario seguro y aplica Escape por niveles", () => {
    const context = setup();
    context.controller.open({
      zone: { name: "Zone", ind: {} },
      trigger: context.trigger,
      focus: false,
    });
    const glossaryTrigger = descendants(context.detail)
      .find((element) => element.className === "tesela-glossary-trigger");
    glossaryTrigger.dispatch("click");
    expect(context.glossary.getAttribute("aria-hidden")).toBe("false");
    expect(glossaryTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(text(context.glossary)).toContain("<img src=x onerror=alert(1)>");
    expect(descendants(context.glossary).some((element) => element.tagName === "IMG")).toBe(false);

    context.document.dispatch("keydown", { key: "Escape", defaultPrevented: false });
    expect(context.glossary.getAttribute("aria-hidden")).toBe("true");
    expect(context.document.activeElement).toBe(glossaryTrigger);
    context.document.dispatch("keydown", { key: "Escape", defaultPrevented: false });
    expect(context.detail.getAttribute("aria-hidden")).toBe("true");
    expect(context.detail.getAttribute("inert")).toBe("");
    expect(context.document.activeElement).toBe(context.trigger);
    expect(context.closed).toEqual(["Zone"]);
  });

  it("respeta Escape consumido y elimina el listener al destruir", () => {
    const context = setup();
    context.controller.open({ zone: { name: "Zone", ind: {} } });
    context.document.dispatch("keydown", { key: "Escape", defaultPrevented: true });
    expect(context.controller.isDetailOpen()).toBe(true);
    context.controller.destroy();
    expect(context.document.listeners.has("keydown")).toBe(false);
    expect(() => context.controller.destroy()).not.toThrow();
  });

  it("renderiza estados y elementos de providers asíncronos", async () => {
    const document = fakeDocument();
    const detail = document.createElement("aside");
    const runtime = createProviderRuntime();
    const provider = {
      id: "media",
      ui: {
        label: "Media",
        loading: "Loading media…",
        empty: "No media.",
        error: "Media failed.",
        note: "Provider note.",
      },
      cacheKey: (context) => context.zone.key,
      load: async () => [{ title: "Image" }],
      renderItem: (doc, item) => {
        const element = doc.createElement("figure");
        element.appendChild(doc.createTextNode(item.title));
        return element;
      },
    };
    const controller = createDetailController({
      document,
      detailElement: detail,
      detailConfig: { fields: [] },
      formatValue: String,
      providers: [provider],
      providerRuntime: runtime,
    });
    controller.open({ zone: { key: "a", name: "Zone", ind: {} } });
    expect(text(detail)).toContain("Loading media…");
    await vi.waitFor(() => expect(text(detail)).toContain("ImageProvider note."));
    controller.close();
    expect(detail.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("methodology renderer", () => {
  it("crea contenido semántico solo con textos y enlaces HTTPS validados", () => {
    const document = fakeDocument();
    const methodology = renderMethodology(document, {
      label: "Methodology",
      summary: "Summary",
      sourcesLabel: "Sources",
      sources: [{ name: "Source A", role: "Geometry" }],
      stepsLabel: "Process",
      steps: ["Join data"],
      links: [{ label: "Documentation", url: "https://example.test/method" }],
    });
    expect(methodology.tagName).toBe("DETAILS");
    expect(text(methodology)).toContain("MethodologySummarySourcesSource AGeometryProcessJoin data");
    const link = descendants(methodology).find((element) => element.tagName === "A");
    expect(link.getAttribute("href")).toBe("https://example.test/method");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
