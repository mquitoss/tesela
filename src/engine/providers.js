/* =====================================================================
   Tesela · engine/providers — runtime asíncrono con cancelación y caché LRU
   ===================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  const g = root.Tesela || root.SSM || {};
  root.Tesela = root.SSM = g;
  g.engine = Object.assign(g.engine || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PROVIDER_STATUS = Object.freeze({
    LOADING: "loading",
    READY: "ready",
    EMPTY: "empty",
    ERROR: "error",
  });

  function isAbortError(error) {
    return error?.name === "AbortError";
  }

  function createProviderRuntime(options) {
    const requestedSize = Number(options?.cacheSize);
    const maxEntries = Number.isFinite(requestedSize) && requestedSize > 0
      ? Math.max(1, Math.floor(requestedSize))
      : 32;
    const cache = new Map();
    const channels = new Map();
    let destroyed = false;

    function emit(callback, state) {
      try {
        callback(state);
      } catch (error) {
        console.error("[Tesela] Error en callback de provider", error);
      }
    }

    function cacheGet(key) {
      if (!cache.has(key)) return null;
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return value;
    }

    function cacheSet(key, value) {
      cache.delete(key);
      cache.set(key, value);
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    }

    function cancel(channel) {
      const active = channels.get(channel);
      if (!active) return;
      active.controller.abort();
      channels.delete(channel);
    }

    function cancelAll() {
      for (const channel of [...channels.keys()]) cancel(channel);
    }

    async function run(provider, context, runOptions) {
      if (destroyed) return null;
      const channel = runOptions?.channel || provider.id;
      const onState = typeof runOptions?.onState === "function" ? runOptions.onState : () => {};
      cancel(channel);
      let cachePart;
      try {
        cachePart = typeof provider.cacheKey === "function"
          ? provider.cacheKey(context)
          : (context?.key ?? context?.zone?.key ?? context?.id);
      } catch (error) {
        const state = { status: PROVIDER_STATUS.ERROR, data: [], error, cached: false };
        emit(onState, state);
        return state;
      }
      const cacheKey = `${provider.id}:${String(cachePart ?? "default")}`;
      const cached = cacheGet(cacheKey);
      if (cached) {
        const status = cached.length ? PROVIDER_STATUS.READY : PROVIDER_STATUS.EMPTY;
        const state = { status, data: cached, error: null, cached: true };
        emit(onState, state);
        return state;
      }

      const controller = new AbortController();
      const token = Symbol(channel);
      channels.set(channel, { controller, token });
      emit(onState, { status: PROVIDER_STATUS.LOADING, data: [], error: null, cached: false });
      try {
        const raw = await provider.load(context, { signal: controller.signal });
        const normalized = typeof provider.normalize === "function"
          ? await provider.normalize(raw, context)
          : raw;
        const data = Array.isArray(normalized) ? normalized : [];
        if (destroyed || channels.get(channel)?.token !== token) return null;
        channels.delete(channel);
        cacheSet(cacheKey, data);
        const state = {
          status: data.length ? PROVIDER_STATUS.READY : PROVIDER_STATUS.EMPTY,
          data,
          error: null,
          cached: false,
        };
        emit(onState, state);
        return state;
      } catch (error) {
        if (destroyed || channels.get(channel)?.token !== token) return null;
        if (isAbortError(error)) {
          channels.delete(channel);
          return null;
        }
        channels.delete(channel);
        const state = { status: PROVIDER_STATUS.ERROR, data: [], error, cached: false };
        emit(onState, state);
        return state;
      }
    }

    function clearCache() {
      cache.clear();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAll();
      clearCache();
    }

    return {
      cancel,
      cancelAll,
      clearCache,
      destroy,
      run,
      cacheSize: () => cache.size,
    };
  }

  return { PROVIDER_STATUS, createProviderRuntime };
});
