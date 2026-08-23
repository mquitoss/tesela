/* =====================================================================
   Tesela · ui/detail — detalle, glosario y metodología declarativos
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = g;
  g.ui = Object.assign(g.ui || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function node(document, tag, attrs, children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (key === "class") element.className = value;
      else if (key.startsWith("on") && typeof value === "function") {
        element.addEventListener(key.slice(2), value);
      } else element.setAttribute(key, String(value));
    }
    for (const child of children || []) {
      if (child == null) continue;
      element.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return element;
  }

  function connected(element) {
    return Boolean(element && element.isConnected !== false && typeof element.focus === "function");
  }

  function setOpen(element, open) {
    if (!element) return;
    element.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      element.removeAttribute("inert");
      element.classList.add("open");
    } else {
      element.setAttribute("inert", "");
      element.classList.remove("open");
    }
  }

  function appendFieldGroups(document, container, fields, valueFor, formatValue, glossary) {
    let currentList = null;
    let activeSection = null;
    for (const field of fields) {
      if (field.section) {
        activeSection = field.section;
        currentList = null;
      }
      if (glossary && !field.help) continue;
      if (!currentList && activeSection) {
        const section = node(document, "section", { class: `tesela-${glossary ? "glossary" : "detail"}-section` }, []);
        section.appendChild(node(document, "h3", null, [activeSection]));
        currentList = node(document, "dl", { class: `tesela-${glossary ? "glossary" : "detail"}-fields` }, []);
        section.appendChild(currentList);
        container.appendChild(section);
      }
      if (!currentList) {
        currentList = node(document, "dl", { class: `tesela-${glossary ? "glossary" : "detail"}-fields` }, []);
        container.appendChild(currentList);
      }
      const row = node(document, "div", { class: `tesela-${glossary ? "glossary" : "detail"}-row` }, [
        node(document, "dt", null, [field.label || field.key]),
        node(document, "dd", null, [
          glossary ? field.help : formatValue(valueFor(field), field),
        ]),
      ]);
      currentList.appendChild(row);
    }
  }

  function createDetailController(options) {
    const document = options.document;
    const detail = options.detailElement;
    const glossaryElement = options.glossaryElement;
    const config = options.detailConfig || {};
    const fields = Array.isArray(config.fields) ? config.fields : [];
    const glossaryConfig = config.glossary || {};
    const detailId = detail?.id || "ssm-detail";
    const glossaryId = glossaryElement?.id || "ssm-glossary";
    let detailOpen = false;
    let glossaryOpen = false;
    let detailTrigger = null;
    let glossaryTrigger = null;
    let currentContext = null;

    function closeGlossary({ restoreFocus = true } = {}) {
      if (!glossaryOpen) return;
      glossaryOpen = false;
      setOpen(glossaryElement, false);
      glossaryTrigger?.setAttribute?.("aria-expanded", "false");
      if (restoreFocus && connected(glossaryTrigger)) glossaryTrigger.focus();
      glossaryTrigger = null;
    }

    function openGlossary(trigger) {
      if (!glossaryElement) return;
      glossaryTrigger = trigger || null;
      glossaryTrigger?.setAttribute?.("aria-expanded", "true");
      const titleId = `${glossaryId}-title`;
      const closeButton = node(document, "button", {
        type: "button",
        class: "tesela-panel-close",
        "aria-label": glossaryConfig.closeLabel || "Close glossary",
        onclick: () => closeGlossary(),
      }, ["×"]);
      const heading = node(document, "h2", { id: titleId, tabindex: "-1" }, [
        glossaryConfig.title || "Glossary",
      ]);
      glossaryElement.replaceChildren(node(document, "header", { class: "tesela-glossary-head" }, [
        node(document, "div", null, [
          glossaryConfig.eyebrow
            ? node(document, "p", { class: "tesela-eyebrow" }, [glossaryConfig.eyebrow])
            : null,
          heading,
        ]),
        closeButton,
      ]));
      if (glossaryConfig.intro) {
        glossaryElement.appendChild(node(document, "p", { class: "tesela-glossary-intro" }, [
          glossaryConfig.intro,
        ]));
      }
      appendFieldGroups(document, glossaryElement, fields, () => null, options.formatValue, true);
      glossaryElement.setAttribute("aria-labelledby", titleId);
      setOpen(glossaryElement, true);
      glossaryOpen = true;
      closeButton.focus?.();
    }

    function close({ restoreFocus = true } = {}) {
      if (!detailOpen) return;
      closeGlossary({ restoreFocus: false });
      detailOpen = false;
      setOpen(detail, false);
      options.onClose?.(currentContext);
      currentContext = null;
      if (detailTrigger?.getAttribute?.("aria-controls") === detailId) {
        detailTrigger.setAttribute("aria-expanded", "false");
      }
      if (restoreFocus && connected(detailTrigger)) detailTrigger.focus();
      detailTrigger = null;
    }

    function open(payload) {
      if (!detail) return;
      closeGlossary({ restoreFocus: false });
      currentContext = payload;
      if (!payload.preserveTrigger) {
        if (detailTrigger?.getAttribute?.("aria-controls") === detailId) {
          detailTrigger.setAttribute("aria-expanded", "false");
        }
        detailTrigger = payload.trigger || null;
        if (detailTrigger?.getAttribute?.("aria-controls") === detailId) {
          detailTrigger.setAttribute("aria-expanded", "true");
        }
      }
      const titleId = `${detailId}-title`;
      const title = node(document, "h2", { id: titleId, tabindex: "-1" }, [
        payload.zone?.name || options.labels?.zoneFallback || "Zone",
      ]);
      const actions = [];
      const hasGlossary = glossaryConfig.enabled !== false && fields.some((field) => field.help);
      if (hasGlossary && glossaryElement) {
        let trigger;
        trigger = node(document, "button", {
          type: "button",
          class: "tesela-glossary-trigger",
          "aria-haspopup": "dialog",
          "aria-controls": glossaryId,
          "aria-expanded": "false",
          onclick: () => openGlossary(trigger),
        }, [glossaryConfig.triggerLabel || "Glossary"]);
        actions.push(trigger);
      }
      actions.push(node(document, "button", {
        type: "button",
        class: "tesela-panel-close",
        "aria-label": config.closeLabel || "Close detail",
        onclick: () => close(),
      }, ["×"]));
      detail.replaceChildren(node(document, "header", { class: "tesela-detail-head" }, [
        node(document, "div", null, [title]),
        node(document, "div", { class: "tesela-detail-actions" }, actions),
      ]));
      if (payload.scoreText) {
        detail.appendChild(node(document, "div", { class: "ssm-score" }, [payload.scoreText]));
      }
      options.beforeFields?.(detail, payload);
      appendFieldGroups(
        document,
        detail,
        fields,
        (field) => payload.zone?.ind?.[field.key],
        options.formatValue,
        false,
      );
      for (const notice of config.notices || []) {
        detail.appendChild(node(document, "p", { class: "tesela-detail-notice" }, [notice]));
      }
      options.afterFields?.(detail, payload);
      detail.setAttribute("aria-labelledby", titleId);
      setOpen(detail, true);
      detailOpen = true;
      if (payload.focus) title.focus?.();
    }

    function onKeydown(event) {
      if (event.defaultPrevented || event.key !== "Escape") return;
      if (glossaryOpen) closeGlossary();
      else if (detailOpen) close();
    }

    function destroy() {
      document.removeEventListener?.("keydown", onKeydown);
      close({ restoreFocus: false });
      closeGlossary({ restoreFocus: false });
    }

    setOpen(detail, false);
    setOpen(glossaryElement, false);
    if (glossaryElement) {
      glossaryElement.setAttribute("role", "dialog");
      glossaryElement.setAttribute("aria-modal", "false");
    }
    document.addEventListener?.("keydown", onKeydown);
    return {
      close,
      closeGlossary,
      destroy,
      isDetailOpen: () => detailOpen,
      isGlossaryOpen: () => glossaryOpen,
      open,
      openGlossary,
    };
  }

  function renderMethodology(document, config) {
    if (!config || config.enabled === false) return null;
    const content = node(document, "div", { class: "tesela-methodology-content" }, []);
    if (config.summary) content.appendChild(node(document, "p", null, [config.summary]));
    if (config.sources?.length) {
      content.appendChild(node(document, "h3", null, [config.sourcesLabel || "Sources"]));
      const sources = node(document, "div", { class: "tesela-source-list" }, []);
      for (const source of config.sources) {
        sources.appendChild(node(document, "div", null, [
          node(document, "strong", null, [source.name]),
          node(document, "p", null, [source.role]),
        ]));
      }
      content.appendChild(sources);
    }
    if (config.steps?.length) {
      content.appendChild(node(document, "h3", null, [config.stepsLabel || "Process"]));
      content.appendChild(node(document, "ol", null, config.steps.map((step) =>
        node(document, "li", null, [step])
      )));
    }
    if (config.links?.length) {
      const links = config.links
        .filter((link) => /^https:\/\//i.test(String(link?.url || "")))
        .map((link) => node(document, "a", {
          href: link.url,
          target: "_blank",
          rel: "noopener noreferrer",
        }, [link.label]));
      if (links.length) {
        content.appendChild(node(document, "div", { class: "tesela-methodology-links" }, links));
      }
    }
    return node(document, "details", { class: "tesela-methodology" }, [
      node(document, "summary", null, [config.label || "Methodology"]),
      content,
    ]);
  }

  return { createDetailController, renderMethodology };
});
