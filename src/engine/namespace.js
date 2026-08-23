/* =====================================================================
   Tesela · engine/namespace — runtime y compatibilidad de globals
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }
  const tesela = api.ensureNamespace(root);
  tesela.runtime = Object.assign(tesela.runtime || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function ensureNamespace(root) {
    if (!root) return {};
    let namespace = root.Tesela || root.SSM || {};
    if (root.Tesela && root.SSM && root.Tesela !== root.SSM) {
      namespace = root.Tesela;
      Object.assign(namespace, root.SSM);
    }
    root.Tesela = namespace;
    root.SSM = namespace;
    return namespace;
  }

  function resolveConfig(root) {
    if (!root) return {};
    return root.TESELA_CONFIG || root.SSM_CONFIG || {};
  }

  function resolveEmbeddedData(root, config) {
    if (!root) return { namespace: null, data: null };
    const configured = config?.branding?.dataNamespace;
    const names = [configured, "TESELA_DATA", "SSM_DATA"].filter(
      (name, index, all) => typeof name === "string" && name && all.indexOf(name) === index,
    );
    for (const namespace of names) {
      if (root[namespace] != null) return { namespace, data: root[namespace] };
    }
    return { namespace: names[0] || "TESELA_DATA", data: null };
  }

  return { ensureNamespace, resolveConfig, resolveEmbeddedData };
});
