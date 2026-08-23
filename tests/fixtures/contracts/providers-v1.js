module.exports = {
  valid: [{
    id: "neutral-media",
    load: async (context, { signal }) => ({ context, aborted: signal.aborted }),
    normalize: (response) => [response],
    attribution: () => ({ label: "Example", url: "https://example.test/item" }),
    cacheKey: (context) => String(context.id),
  }],
  invalid: [{ id: "missing-load", normalize: () => [] }],
};
