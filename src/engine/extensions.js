/* =====================================================================
   Tesela · engine/extensions — slots genéricos y aislados
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = g;
  g.engine = Object.assign(g.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function slotHandlers(sources, slotName) {
    const handlers = [];
    for (const source of sources || []) {
      const value = source && source[slotName];
      const candidates = Array.isArray(value) ? value : [value];
      for (const candidate of candidates) if (typeof candidate === "function") handlers.push(candidate);
    }
    return handlers;
  }

  function runSlot(sources, slotName, context) {
    const outputs = [];
    const errors = [];
    for (const handler of slotHandlers(sources, slotName)) {
      try {
        const output = handler(context);
        if (output != null) outputs.push(output);
      } catch (error) {
        errors.push(error);
      }
    }
    return { outputs, errors };
  }

  return { slotHandlers, runSlot };
});
