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
  run(input: Record<string, unknown>, id: string): Promise<unknown>
  waitForExecution(): Promise<void>
  releaseExecution(): void
  releaseWait(): Promise<void>
}

async function start(options: { switchFailure?: Error; pauseExecution?: boolean } = {}): Promise<Harness> {
  const hooks: Harness["hooks"] = {}
  const switches: Harness["switches"] = []
  let releaseExecution = () => {}
  let releaseWait = () => {}
  let markExecutionStarted = () => {}
  const executionStarted = new Promise<void>((resolve) => { markExecutionStarted = resolve })
  const executionGate = new Promise<void>((resolve) => { releaseExecution = resolve })
  const waitGate = new Promise<void>((resolve) => { releaseWait = resolve })
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
    execute: async (input: Record<string, unknown>, _context?: unknown) => {
      markExecutionStarted()
      if (options.pauseExecution) await executionGate
      await hooks["session.prompt"]?.({
        sessionID: typeof input.sessionID === "string" ? input.sessionID : "child",
        prompt: { text: String(input.prompt) },
      })
      return { content: [], metadata: { status: input.background === true ? "running" : "completed" } }
    },
  }
  const harness: Harness = {
    fields: tool.input.fields,
    hooks,
    switches,
    agentGets: 0,
    childAgent: "explore",
    run: (input, id) => tool.execute(input, { id, sessionID: "parent", agent: "explore", messageID: "msg_1", progress: async () => {} }),
    waitForExecution: () => executionStarted,
    releaseExecution: () => releaseExecution(),
    async releaseWait() {
      releaseWait()
      await Promise.resolve()
      await Promise.resolve()
    },
  }
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
    model: {
      list: async () => ({ data: [
        { providerID: "openai", id: "default", variants: [{ id: "low" }, { id: "high" }] },
        { providerID: "anthropic", id: "fast", variants: [{ id: "high" }] },
      ] }),
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
      wait: async () => waitGate,
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
  expect(input.description).toBe("check [anthropic/fast high]")
  const prompt = { sessionID: "child", prompt: { text: `prefix\n${input.prompt}` } }
  await harness.hooks["session.prompt"]!(prompt)
  expect(prompt.prompt.text).toBe("prefix\ninspect")
  expect(harness.switches).toEqual([{ sessionID: "child", model: { providerID: "anthropic", id: "fast", variant: "high" } }])
  await harness.hooks["execute.after"]!({ tool: "subagent", id: "call-1", input, status: "completed", result: {} })
  expect(input.prompt).toBe("inspect")
  expect(input.description).toBe("check")
})

test("labels new children with the resolved model selection", async () => {
  const harness = await start()
  const modelOnly = { agent: "explore", description: "model", prompt: "inspect", model: "anthropic/fast" }
  const variantOnly = { agent: "explore", description: "variant", prompt: "inspect", variant: "high" }

  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-model", sessionID: "parent", input: modelOnly })
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-variant", sessionID: "parent", input: variantOnly })

  expect(modelOnly.description).toBe("model [anthropic/fast]")
  expect(variantOnly.description).toBe("variant [openai/default high]")
})

test("restores a new child's description after a failed execution", async () => {
  const harness = await start()
  const input = { agent: "explore", description: "check", prompt: "inspect", model: "anthropic/fast" }

  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-error", sessionID: "parent", input })
  expect(input.description).toBe("check [anthropic/fast]")
  await harness.hooks["execute.after"]!({ tool: "subagent", id: "call-error", input, status: "error", error: {} })

  expect(input.description).toBe("check")
})

test("resume uses the child's current model and does not fetch the agent", async () => {
  const harness = await start()
  const input = { agent: "explore", description: "continue", prompt: "continue", sessionID: "child", variant: "high" }
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-2", sessionID: "parent", input })
  expect(input.description).toBe("continue")
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
  await harness.run(input, "call-default")
  expect(input.prompt).toBe("continue")
  expect(harness.agentGets).toBe(0)
  expect(harness.switches).toEqual([])
})

test("rejects overlapping resumes of the same child and releases the guard after completion", async () => {
  const harness = await start({ pauseExecution: true })
  const first = { agent: "explore", description: "first", prompt: "first", sessionID: "child", variant: "high" }
  const second = { agent: "explore", description: "second", prompt: "second", sessionID: "child", model: "anthropic/fast" }
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-a", sessionID: "parent", input: first })
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-b", sessionID: "parent", input: second })
  const running = harness.run(first, "call-a")
  await harness.waitForExecution()
  await expect(harness.run(second, "call-b"))
    .rejects.toThrow("already has a resume in progress")
  harness.releaseExecution()
  await running
  await harness.run(second, "call-b")
})

test("does not lock a resume until its prompt reaches admission", async () => {
  const harness = await start()
  const rejectedBeforeExecution = { agent: "explore", description: "rejected", prompt: "rejected", sessionID: "child" }
  const retry = { agent: "explore", description: "retry", prompt: "retry", sessionID: "child" }

  // A later execute.before hook can still reject the first call here. Since the
  // transformed executor never starts, this plugin must not own the lock.
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-rejected", sessionID: "parent", input: rejectedBeforeExecution })
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-retry", sessionID: "parent", input: retry })
  await harness.run(retry, "call-retry")
})

test("guards mixed plain and overridden resumes of the same child", async () => {
  const harness = await start({ pauseExecution: true })
  const plain = { agent: "explore", description: "plain", prompt: "plain", sessionID: "child" }
  const overridden = { agent: "explore", description: "override", prompt: "override", sessionID: "child", variant: "high" }

  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-plain", sessionID: "parent", input: plain })
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-override", sessionID: "parent", input: overridden })
  const running = harness.run(plain, "call-plain")
  await harness.waitForExecution()
  await expect(harness.run(overridden, "call-override"))
    .rejects.toThrow("already has a resume in progress")
  harness.releaseExecution()
  await running
})

test("keeps a background resume locked until the child becomes idle", async () => {
  const harness = await start()
  const background = { agent: "explore", description: "background", prompt: "background", sessionID: "child", background: true }
  const competing = { agent: "explore", description: "competing", prompt: "competing", sessionID: "child", variant: "high" }

  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-background", sessionID: "parent", input: background })
  await harness.run(background, "call-background")
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-competing", sessionID: "parent", input: competing })
  await expect(harness.run(competing, "call-competing"))
    .rejects.toThrow("already has a resume in progress")

  await harness.releaseWait()
  await harness.run(competing, "call-competing")
})

test("cleans up after switchModel failure", async () => {
  const harness = await start({ switchFailure: new Error("switch failed") })
  const input = { agent: "explore", description: "continue", prompt: "continue", sessionID: "child", variant: "high" }
  await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-fail", sessionID: "parent", input })
  await expect(harness.run(input, "call-fail"))
    .rejects.toThrow("switch failed")
  const retry = { agent: "explore", description: "retry", prompt: "retry", sessionID: "child" }
  await harness.run(retry, "call-retry")
})

test("releases the resume guard when override resolution fails", async () => {
  const harness = await start()
  const invalid = { agent: "explore", description: "invalid", prompt: "invalid", sessionID: "child", model: "missing/model" }
  await expect(harness.hooks["execute.before"]!({ tool: "subagent", id: "call-invalid", sessionID: "parent", input: invalid }))
    .rejects.toThrow("Unknown model")

  const retry = { agent: "explore", description: "retry", prompt: "retry", sessionID: "child", variant: "high" }
  await expect(harness.hooks["execute.before"]!({ tool: "subagent", id: "call-retry", sessionID: "parent", input: retry }))
    .resolves.toBeUndefined()
})

for (const background of [false, true]) {
  test(`completion fails if the override marker was never admitted (background=${background})`, async () => {
    const harness = await start()
    const input = { agent: "explore", description: "check", prompt: "inspect", model: "anthropic/fast", background }
    await harness.hooks["execute.before"]!({ tool: "subagent", id: "call-3", sessionID: "parent", input })
    const labeledDescription = input.description
    expect(harness.hooks["execute.after"]!({ tool: "subagent", id: "call-3", input, status: "completed", result: {} }))
      .rejects.toThrow("override was not applied")
    expect(labeledDescription).toBe("check [anthropic/fast]")
    expect(input.description).toBe("check")
  })
}
