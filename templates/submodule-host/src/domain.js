(function (root) {
  "use strict";
  const tesela = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = tesela;
  tesela.adapters = {
    derive: (indicator) => indicator,
    simulate: () => null,
    slots: {},
  };
})(typeof self !== "undefined" ? self : this);
