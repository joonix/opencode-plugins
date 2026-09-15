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

test("matches prefixed child prompts and consumes the pending override", () => {
  const suffix = marker("call-1")
  const pending: Pending[] = [{ parentID: "parent", agent: "explore", prompt: "find it", marker: suffix, model: base, createdAt: 100 }]
  expect(takePending(pending, { parentID: "parent", agent: "explore" }, `prefix\nfind it${suffix}`, 100)).toBeDefined()
  expect(pending).toHaveLength(0)
})

test("evicts stale pending overrides", () => {
  const pending: Pending[] = [{ parentID: "parent", agent: "explore", prompt: "old", marker: marker("old"), model: base, createdAt: 0 }]
  expect(takePending(pending, {}, "none", 300_001)).toBeUndefined()
  expect(pending).toHaveLength(0)
})
