import { describe, expect, it, vi } from "vitest";

const {
  PROVIDER_STATUS,
  createProviderRuntime,
} = require("../../src/engine/providers.js");
const fixtures = require("../fixtures/contracts/providers-v1.js");

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

describe("provider runtime", () => {
  it("publica loading y datos normalizados, después reutiliza la caché", async () => {
    const load = vi.fn(async (context) => ({ value: context.id }));
    const provider = {
      ...fixtures.valid[0],
      load,
      normalize: async (raw) => [raw.value],
    };
    const runtime = createProviderRuntime({ cacheSize: 2 });
    const states = [];
    await runtime.run(provider, { id: "zone-1" }, { onState: (state) => states.push(state) });
    await runtime.run(provider, { id: "zone-1" }, { onState: (state) => states.push(state) });

    expect(states.map(({ status }) => status)).toEqual(["loading", "ready", "ready"]);
    expect(states.at(-1)).toMatchObject({ data: ["zone-1"], cached: true });
    expect(load).toHaveBeenCalledOnce();
  });

  it("distingue vacío y error sin cachear errores", async () => {
    const runtime = createProviderRuntime();
    const empty = { id: "empty", load: async () => [], cacheKey: () => "one" };
    expect(await runtime.run(empty, {})).toMatchObject({ status: PROVIDER_STATUS.EMPTY });

    const failure = new Error("network");
    const broken = { id: "broken", load: vi.fn(async () => { throw failure; }) };
    expect(await runtime.run(broken, {})).toMatchObject({ status: "error", error: failure });
    expect(await runtime.run(broken, {})).toMatchObject({ status: "error", error: failure });
    expect(broken.load).toHaveBeenCalledTimes(2);
  });

  it("descarta respuestas obsoletas aunque el loader ignore el abort", async () => {
    const first = deferred();
    const second = deferred();
    const signals = {};
    const provider = {
      id: "media",
      cacheKey: (context) => context.id,
      load: (context, { signal }) => {
        signals[context.id] = signal;
        return context.id === "first" ? first.promise : second.promise;
      },
    };
    const runtime = createProviderRuntime();
    const states = [];
    const oldRun = runtime.run(provider, { id: "first" }, { onState: (state) => states.push(["old", state.status]) });
    const newRun = runtime.run(provider, { id: "second" }, { onState: (state) => states.push(["new", state.status]) });
    expect(signals.first.aborted).toBe(true);
    first.resolve(["stale"]);
    second.resolve(["fresh"]);
    expect(await oldRun).toBeNull();
    expect(await newRun).toMatchObject({ status: "ready", data: ["fresh"] });
    expect(states).not.toContainEqual(["old", "ready"]);
  });

  it("un abort no se convierte en estado de error visible", async () => {
    const provider = {
      id: "abortable",
      load: (_context, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    };
    const runtime = createProviderRuntime();
    const states = [];
    const run = runtime.run(provider, {}, { onState: (state) => states.push(state.status) });
    runtime.cancel("abortable");
    expect(await run).toBeNull();
    expect(states).toEqual(["loading"]);
  });

  it("limita la caché con política LRU y destroy es idempotente", async () => {
    const load = vi.fn(async (context) => [context.id]);
    const provider = {
      id: "data",
      cacheKey: (context) => context.id,
      load,
    };
    const runtime = createProviderRuntime({ cacheSize: 2 });
    await runtime.run(provider, { id: "a" });
    await runtime.run(provider, { id: "b" });
    await runtime.run(provider, { id: "a" });
    await runtime.run(provider, { id: "c" });
    await runtime.run(provider, { id: "b" });
    expect(load).toHaveBeenCalledTimes(4);
    expect(runtime.cacheSize()).toBe(2);
    runtime.destroy();
    runtime.destroy();
    expect(runtime.cacheSize()).toBe(0);
    expect(await runtime.run(provider, { id: "d" })).toBeNull();
  });
});
