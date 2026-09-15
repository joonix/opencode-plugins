import { expect, test } from "bun:test"
import { marker, parseModel, resolveOverride, takePending, type ModelInfo, type Pending } from "../src/resolve"

const models: ModelInfo[] = [
  { providerID: "openai", id: "strong", variants: [{ id: "low" }, { id: "high" }] },
  { providerID: "anthropic", id: "fast", variants: [{ id: "high" }] },
]
const base = { providerID: "openai", id: "strong", variant: "low" }

test("parses model IDs containing slashes", () => {
  expect(parseModel("openrouter/acme/model")).toEqual({ providerID: "openrouter", id: "acme/model" })
})

test.each([
  [{}, undefined],
  [{ model: "anthropic/fast" }, { providerID: "anthropic", id: "fast" }],
  [{ variant: "high" }, { providerID: "openai", id: "strong", variant: "high" }],
  [{ model: "anthropic/fast", variant: "high" }, { providerID: "anthropic", id: "fast", variant: "high" }],
] as const)("resolves override %o", (input, expected) => {
  expect(resolveOverride(input, base, models)).toEqual(expected)
})

test("rejects unknown models and variants", () => {
  expect(() => resolveOverride({ model: "other/missing" }, base, models)).toThrow("Unknown model")
  expect(() => resolveOverride({ variant: "max" }, base, models)).toThrow("Unknown variant")
})

test("rejects disabled models", () => {
  expect(() => resolveOverride(
    { model: "anthropic/disabled" },
    base,
    [...models, { providerID: "anthropic", id: "disabled", variants: [], enabled: false }],
  )).toThrow("Unknown model")
})

test("matches prefixed child prompts and consumes the pending override", () => {
  const suffix = marker("call-1")
  const pending: Pending[] = [{ parentID: "parent", agent: "explore", marker: suffix, model: base, createdAt: 100 }]
  expect(takePending(pending, { parentID: "parent", agent: "explore" }, `prefix\nfind it${suffix}`, 100)).toBeDefined()
  expect(pending).toHaveLength(0)
})

test("selects the correct pending override when parallel prompts arrive out of order", () => {
  const first = marker("call-1")
  const second = marker("call-2")
  const pending: Pending[] = [
    { parentID: "parent", agent: "explore", marker: first, model: base, createdAt: 100 },
    { parentID: "parent", agent: "explore", marker: second, model: { providerID: "anthropic", id: "fast" }, createdAt: 100 },
  ]
  expect(takePending(pending, { parentID: "parent", agent: "explore" }, `prefix${second}`, 100)?.model.id).toBe("fast")
  expect(pending.map((item) => item.marker)).toEqual([first])
})

test("does not apply a resumed override to a different child", () => {
  const suffix = marker("resume")
  const pending: Pending[] = [
    { parentID: "parent", agent: "explore", childSessionID: "child-a", marker: suffix, model: base, createdAt: 100 },
  ]
  expect(takePending(pending, { id: "child-b", parentID: "parent", agent: "explore" }, `prompt${suffix}`, 100))
    .toBeUndefined()
  expect(pending).toHaveLength(1)
})

test("evicts stale pending overrides", () => {
  const pending: Pending[] = [{ parentID: "parent", agent: "explore", marker: marker("old"), model: base, createdAt: 0 }]
  expect(takePending(pending, {}, "none", 300_001)).toBeUndefined()
  expect(pending).toHaveLength(0)
})
