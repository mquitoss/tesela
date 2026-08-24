(function (root) {
  const polygon = (id, name, offset) => ({
    type: "Feature",
    properties: { ID: id, NAME: name },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [offset, 0], [offset + 0.8, 0], [offset + 0.8, 0.8], [offset, 0.8], [offset, 0],
      ]],
    },
  });
  root.TESELA_DATA = {
    geo: { type: "FeatureCollection", features: [polygon("a", "Álpha", 0), polygon("b", "Beta", 1)] },
    indicators: [
      { id: "a", name: "Álpha", value: 10, quality: 90 },
      { id: "b", name: "Beta", value: 90, quality: 10 },
    ],
    meta: { source: "e2e" },
  };
  root.SSM_DATA = root.TESELA_DATA;
})(window);
