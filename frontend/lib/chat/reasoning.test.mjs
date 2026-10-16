import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { loadTypeScript } from "./test-loader.mjs";

const source = new URL("./reasoning.ts", import.meta.url);
const reasoning = existsSync(source) ? loadTypeScript(source) : {};
const model = {
  id: "reasoner", name: "Reasoner", description: "", group: "Test", runtime: "openai",
  reasoning_effort: "medium", reasoning_efforts: ["low", "medium", "high"],
};

test("reasoning follows server capability order and validates stale preferences/defaults", () => {
  assert.equal(typeof reasoning.chosenReasoningEffort, "function");
  assert.equal(reasoning.chosenReasoningEffort(model, "high"), "high");
  assert.equal(reasoning.chosenReasoningEffort(model, "xhigh"), "medium");
  assert.equal(reasoning.chosenReasoningEffort({ ...model, reasoning_effort: "removed" }), "low");
  assert.equal(reasoning.chosenReasoningEffort({ ...model, reasoning_efforts: ["none", "high", "xhigh"] }, "none"), "none");
  assert.equal(reasoning.chosenReasoningEffort({ ...model, reasoning_efforts: undefined }, "high"), undefined);
  assert.equal(reasoning.chosenReasoningEffort(undefined, "high"), undefined);
});

test("malformed capability metadata cannot enable unsupported values", () => {
  assert.equal(typeof reasoning.supportedReasoningEfforts, "function");
  for (const value of [undefined, null, "high", {}, 10]) {
    assert.deepEqual(reasoning.supportedReasoningEfforts({ ...model, reasoning_efforts: value }), []);
  }
  const malformed = { ...model, reasoning_efforts: [null, "", " high ", false, "low", "low", "high"] };
  assert.deepEqual(reasoning.supportedReasoningEfforts(malformed), ["low", "high"]);
  assert.equal(reasoning.chosenReasoningEffort(malformed, "medium"), "low");
});

test("effort resolution follows the requested model, including defaults and unknown models", () => {
  assert.equal(typeof reasoning.reasoningEffortForModel, "function");
  const other = { ...model, id: "other", reasoning_effort: "high", reasoning_efforts: ["high", "max"] };
  const list = { default: "other", models: [model, other, { ...model, id: "plain", reasoning_efforts: [] }] };
  const preferences = { reasoner: "low", other: "max", plain: "high" };
  assert.equal(reasoning.reasoningEffortForModel(list, "reasoner", preferences), "low");
  assert.equal(reasoning.reasoningEffortForModel(list, "other", preferences), "max");
  assert.equal(reasoning.reasoningEffortForModel(list, null, preferences), "max");
  assert.equal(reasoning.reasoningEffortForModel(list, "missing", preferences), undefined);
  assert.equal(reasoning.reasoningEffortForModel(list, "plain", preferences), undefined);
  assert.equal(reasoning.reasoningEffortForModel(undefined, "reasoner", preferences), undefined);
});

test("model preferences persist individually without restoring the selected model", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const stored = new Map();
  const localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  try {
    const { useModelOverride } = loadTypeScript(new URL("./model-store.ts", import.meta.url));
    assert.equal(typeof useModelOverride.getState().setReasoningEffort, "function");
    useModelOverride.getState().setReasoningEffort("reasoner", "low");
    useModelOverride.getState().setReasoningEffort("other", "max");
    useModelOverride.getState().setModel("reasoner");
    const key = [...stored.keys()][0];
    assert.deepEqual(JSON.parse(stored.get(key)).state, { reasoningEfforts: { reasoner: "low", other: "max" } });
    stored.set(key, JSON.stringify({ state: { model: "injected", reasoningEfforts: { reasoner: "high", invalid: 42, empty: "" } }, version: 0 }));
    useModelOverride.setState({ model: null });
    // setState also persists; restore the disk fixture before simulating a reload.
    stored.set(key, JSON.stringify({ state: { model: "injected", reasoningEfforts: { reasoner: "high", invalid: 42, empty: "" } }, version: 0 }));
    await useModelOverride.persist.rehydrate();
    assert.equal(useModelOverride.getState().model, null);
    assert.deepEqual(useModelOverride.getState().reasoningEfforts, { reasoner: "high" });
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
  }
});

test("queued turns keep the effort captured at start, including call requests", async () => {
  const { startTurn, steer, subscribe, getSnapshot } = loadTypeScript(new URL("./turn-runner.ts", import.meta.url));
  const originalFetch = globalThis.fetch;
  const originalFrame = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const captured = [];
  let firstStream;
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  globalThis.fetch = async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : {};
    if (url === "/api/chat") {
      captured.push(body);
      const stream = new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"content","delta":"Answer"}\n\n'));
        if (captured.length === 1) firstStream = controller;
        else {
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
        }
      } });
      return new Response(stream);
    }
    if (String(url).startsWith("/api/chat/steer")) return Response.json({ ok: true });
    return Response.json({ id: "effort-turn", messages: body.messages ?? [], model: body.model });
  };
  const client = { setQueryData() {}, invalidateQueries: async () => {} };
  try {
    subscribe("effort-turn", () => {});
    const options = {
      chatId: "effort-turn", history: [{ id: "q", role: "user", content: "Question", viaCall: true }],
      model: "reasoner", reasoningEffort: "high", prompt: null, tools: true,
      voiceId: "", ttsModel: null, workspace: null, client,
    };
    assert.equal(startTurn(options), true);
    options.reasoningEffort = "low";
    assert.equal(steer("effort-turn", "Follow-up"), true);
    firstStream.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
    firstStream.close();
    for (let i = 0; i < 100 && (captured.length < 2 || getSnapshot("effort-turn").streaming); i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(captured.length, 2);
    assert.equal(captured[0].reasoning_effort, "high");
    assert.equal(captured[0].mode, "call");
    assert.equal(captured[1].reasoning_effort, "high");
    assert.equal(captured[1].model, "reasoner");
    assert.equal(getSnapshot("effort-turn").streaming, false);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.requestAnimationFrame = originalFrame;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
