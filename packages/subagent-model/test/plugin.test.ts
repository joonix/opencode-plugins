import { expect, test } from "bun:test"
import type { Plugin } from "@opencode/plugin"
import { Schema } from "effect"
import plugin from "../src/index"

interface Harness {
  fields: Record<string, unknown>
  readonly hooks: Record<string, (event: any) => Promise<void>>
  readonly switches: { sessionID: string; model: { providerID: string; id: string; variant?: string } }[]
  agentGets: number
  childAgent: string
}

async function start(options: { switchFailure?: Error } = {}): Promise<Harness> {
  const hooks: Harness["hooks"] = {}
  const switches: Harness["switches"] = []
  const inputSchema = Schema.Struct({
    agent: Schema.String,
    description: Schema.String,
    prompt: Schema.String,
    sessionID: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isStartsWith("ses")))),
    background: Schema.optionalKey(Schema.Boolean),
  })
  const tool = {
    id: "subagent",
    description: "Spawn a child",
    input: inputSchema,
  }
  const harness: Harness = { fields: tool.input.fields, hooks, switches, agentGets: 0, childAgent: "explore" }
  const ctx = {
    tool: {
      transform: async (callback: (editor: any) => void) => {
        callback({
          get: (id: string) => id === "subagent" ? tool : undefined,
          update: (id: string, update: (value: any) => void) => {
            if (id === "subagent") update(tool)
            harness.fields = tool.input.fields
          },
        })
        return { dispose: async () => {} }
      },
      hook: async (name: string, callback: (event: any) => Promise<void>) => {
        hooks[name] = callback
        return { dispose: async () => {} }
      },
    },
    catalog: {
      model: {
        list: async () => ({ data: [
          { providerID: "openai", id: "default", variants: [{ id: "low" }, { id: "high" }] },
          { providerID: "anthropic", id: "fast", variants: [{ id: "high" }] },
        ] }),
      },
    },
    agent: {
      get: async ({ agentID }: { agentID: string }) => {
        harness.agentGets++
        return { data: { model: agentID === "designer"
          ? { providerID: "anthropic", id: "fast" }
          : { providerID: "openai", id: "default", variant: "low" } } }
      },
    },
    session: {
      get: async ({ sessionID }: { sessionID: string }) => sessionID === "child"
        ? { id: "child", parentID: "parent", agent: harness.childAgent, model: { providerID: "openai", id: "default", variant: "low" } }
        : { id: "parent", model: { providerID: "openai", id: "default", variant: "low" } },
      switchModel: async (input: Harness["switches"][number]) => {
        switches.push(input)
        if (options.switchFailure) throw options.switchFailure
      },
      hook: async (name: string, callback: (event: any) => Promise<void>) => {
        hooks[`session.${name}`] = callback
        return { dispose: async () => {} }
      },
    },
  }
  await plugin.setup(ctx as unknown as Plugin.Context)
  return harness
}

test("extends the tool and applies a new-child override before prompt admission", async () => {
  const harness = await start()
  expect(harness.fields).toHaveProperty("model")
  expect(harness.fields).toHaveProperty("variant")
  const overrides = Schema.Struct({
    model: harness.fields.model as ReturnType<typeof Schema.optionalKey<typeof Schema.String>>,
    variant: harness.fields.variant as ReturnType<typeof Schema.optionalKey<typeof Schema.String>>,
  })
  expect(await Schema.decodeUnknownPromise(overrides)({})).toEqual({})
  expect(await Schema.decodeUnknownPromise(overrides)({ model: "anthropic/fast", variant: "high" }))
    .toEqual({ model: "anthropic/fast", variant: "high" })
  const input = { agent: "explore", description: "check", prompt: "inspect", model: "anthropic/fast", variant: "high" }
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-1", sessionID: "parent", input })
  expect(input.prompt).toContain("opencode-subagent-model")
  const prompt = { sessionID: "child", prompt: { text: `prefix\n${input.prompt}` } }
  await harness.hooks["session.prompt"]!(prompt)
  expect(prompt.prompt.text).toBe("prefix\ninspect")
  expect(harness.switches).toEqual([{ sessionID: "child", model: { providerID: "anthropic", id: "fast", variant: "high" } }])
  await harness.hooks["execute.after"]!({ tool: "subagent", id: "call-1", input, status: "completed", result: {} })
  expect(input.prompt).toBe("inspect")
})

test("resume uses the child's current model and does not fetch the agent", async () => {
  const harness = await start()
  const input = { agent: "explore", description: "continue", prompt: "continue", sessionID: "child", variant: "high" }
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-2", sessionID: "parent", input })
  await harness.hooks["session.prompt"]!({ sessionID: "child", prompt: { text: `prefix\n${input.prompt}` } })
  expect(harness.agentGets).toBe(0)
  expect(harness.switches[0]?.model).toEqual({ providerID: "openai", id: "default", variant: "high" })
})

test("variant-only resume uses a newly selected agent's default model", async () => {
  const harness = await start()
  const input = { agent: "designer", description: "continue", prompt: "continue", sessionID: "child", variant: "high" }
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-agent", sessionID: "parent", input })
  harness.childAgent = "designer"
  await harness.hooks["session.prompt"]!({
    sessionID: "child",
    prompt: { text: input.prompt },
  })
  expect(harness.agentGets).toBe(1)
  expect(harness.switches[0]?.model).toEqual({ providerID: "anthropic", id: "fast", variant: "high" })
})

test("resume without overrides leaves normal behavior untouched", async () => {
  const harness = await start()
  const input = { agent: "explore", description: "continue", prompt: "continue", sessionID: "child" }
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-default", sessionID: "parent", input })
  expect(harness.agentGets).toBe(0)
  expect(harness.switches).toEqual([])
})

test("rejects overlapping resumes of the same child and releases the guard after completion", async () => {
  const harness = await start()
  const first = { agent: "explore", description: "first", prompt: "first", sessionID: "child", variant: "high" }
  const second = { agent: "explore", description: "second", prompt: "second", sessionID: "child", model: "anthropic/fast" }
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-a", sessionID: "parent", input: first })
  expect(harness.hooks["execute.before"]!({ tool: "subagent", id: "call-b", sessionID: "parent", input: second }))
    .rejects.toThrow("already has a resume in progress")
  await harness.hooks["session.prompt"]!({ sessionID: "child", prompt: { text: first.prompt } })
  await harness.hooks["execute.after"]!({ tool: "subagent", id: "call-a", input: first, status: "completed", result: {} })
  await expect(harness.hooks["execute.before"]!({ tool: "subagent", id: "call-b", sessionID: "parent", input: second }))
    .resolves.toBeUndefined()
})

test("cleans up after switchModel failure", async () => {
  const harness = await start({ switchFailure: new Error("switch failed") })
  const input = { agent: "explore", description: "continue", prompt: "continue", sessionID: "child", variant: "high" }
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-fail", sessionID: "parent", input })
  await expect(harness.hooks["session.prompt"]!({ sessionID: "child", prompt: { text: input.prompt } }))
    .rejects.toThrow("switch failed")
  await harness.hooks["execute.after"]!({ tool: "subagent", id: "call-fail", input, status: "error", error: {} })
  const retry = { agent: "explore", description: "retry", prompt: "retry", sessionID: "child", model: "anthropic/fast" }
  await expect(harness.hooks["execute.before"]!({ tool: "subagent", id: "call-retry", sessionID: "parent", input: retry }))
    .resolves.toBeUndefined()
})

for (const background of [false, true]) {
  test(`completion fails if the override marker was never admitted (background=${background})`, async () => {
    const harness = await start()
    const input = { agent: "explore", description: "check", prompt: "inspect", model: "anthropic/fast", background }
    await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-3", sessionID: "parent", input })
    expect(harness.hooks["execute.after"]!({ tool: "subagent", id: "call-3", input, status: "completed", result: {} }))
      .rejects.toThrow("override was not applied")
  })
}
