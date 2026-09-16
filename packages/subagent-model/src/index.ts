import { Plugin } from "@opencode/plugin"
import type { ModelInfo, Pending } from "./resolve"
import { marker, resolveOverride, takePending } from "./resolve"

type Field = {
  readonly ast: object
  rebuild(ast: object): Field
  annotate(input: { description: string }): Field
}

type Struct = {
  readonly fields: Record<string, Field>
  mapFields(transform: (fields: Record<string, Field>) => Record<string, Field>): unknown
}

function optionalString(required: Field, optional: Field, description: string): Field {
  // Reuse the host's AST objects so optional-key metadata survives across Effect runtime copies.
  const context = Object.getOwnPropertyDescriptor(optional.ast, "context")
  if (!context) throw new Error("joonix.subagent-model: incompatible optional field schema")
  const ast = Object.create(Object.getPrototypeOf(required.ast), Object.getOwnPropertyDescriptors(required.ast))
  Object.defineProperty(ast, "context", context)
  return required.rebuild(ast).annotate({ description })
}

export default Plugin.define({
  id: "joonix.subagent-model",
  async setup(ctx) {
    const pending: Pending[] = []
    const calls = new Map<string, {
      readonly pending: Pending
      applied: boolean
      readonly prompt: string
      readonly description?: string
    }>()
    const resumedCalls = new Map<string, string>()

    await ctx.tool.transform((editor) => {
      const original = editor.get("subagent")
      if (!original) throw new Error("joonix.subagent-model: built-in subagent tool not found")
      editor.update("subagent", (tool) => {
        const execute = tool.execute
        const input = tool.input as unknown as Struct
        const prompt = input.fields.prompt
        const sessionID = input.fields.sessionID
        if (!prompt || !sessionID) throw new Error("joonix.subagent-model: incompatible subagent input schema")
        tool.input = input.mapFields((fields) => ({
          ...fields,
          model: optionalString(prompt, sessionID, "Optional provider/model-id selection for this child session"),
          variant: optionalString(prompt, sessionID, "Optional reasoning variant (effort) for this child session"),
        })) as typeof tool.input
        tool.description += " Optional model and variant inputs select the child session's model and effort. Resumes without overrides keep the child's current selection."
        tool.execute = async (raw, context) => {
          const values = raw as Record<string, unknown>
          const resumedSessionID = typeof values.sessionID === "string" ? values.sessionID : undefined
          if (!resumedSessionID) return execute(raw, context)
          const owner = resumedCalls.get(resumedSessionID)
          if (owner && owner !== context.id) {
            throw new Error(`joonix.subagent-model: session ${resumedSessionID} already has a resume in progress`)
          }
          resumedCalls.set(resumedSessionID, context.id)
          try {
            const result = await execute(raw, context)
            const status = (result.metadata as { readonly status?: unknown } | undefined)?.status
            if (status === "running") {
              void ctx.session.wait({ sessionID: resumedSessionID }).then(
                () => {
                  if (resumedCalls.get(resumedSessionID) === context.id) resumedCalls.delete(resumedSessionID)
                },
                (error) => {
                  console.error(`joonix.subagent-model: waiting for session ${resumedSessionID} to become idle failed`, error)
                  if (resumedCalls.get(resumedSessionID) === context.id) resumedCalls.delete(resumedSessionID)
                },
              )
            } else if (resumedCalls.get(resumedSessionID) === context.id) {
              resumedCalls.delete(resumedSessionID)
            }
            return result
          } catch (error) {
            if (resumedCalls.get(resumedSessionID) === context.id) resumedCalls.delete(resumedSessionID)
            throw error
          }
        }
      })
    })

    await ctx.tool.hook("execute.before", async (event) => {
      if (event.tool !== "subagent") return
      const input = event.input as Record<string, unknown>
      const override = {
        model: typeof input.model === "string" ? input.model : undefined,
        variant: typeof input.variant === "string" ? input.variant : undefined,
      }
      const resumedSessionID = typeof input.sessionID === "string" ? input.sessionID : undefined
      if (!override.model && !override.variant) return

      const agentID = String(input.agent)
      const [catalog, session] = await Promise.all([
        ctx.model.list(),
        ctx.session.get({ sessionID: resumedSessionID ?? event.sessionID }),
      ])
      const agent = !resumedSessionID || session.agent !== agentID ? await ctx.agent.get({ agentID }) : undefined
      const base = agent?.data.model ?? session.model
      if (!base) throw new Error("Cannot determine the subagent's default model")
      const model = resolveOverride(override, base, catalog.data as readonly ModelInfo[])!

      const suffix = marker(event.id)
      const prompt = String(input.prompt)
      const description = typeof input.description === "string" ? input.description : undefined
      input.prompt = prompt + suffix
      if (!resumedSessionID && description !== undefined) {
        const selection = `${model.providerID}/${model.id}${model.variant ? ` ${model.variant}` : ""}`
        input.description = `${description} [${selection}]`
      }
      const entry: Pending = {
        parentID: event.sessionID,
        agent: agentID,
        ...(resumedSessionID ? { childSessionID: resumedSessionID } : {}),
        marker: suffix,
        model,
        createdAt: Date.now(),
      }
      pending.push(entry)
      calls.set(event.id, { pending: entry, applied: false, prompt, description })
    })

    await ctx.session.hook("prompt", async (event) => {
      if (pending.length === 0) return
      if (!pending.some((item) => event.prompt.text.endsWith(item.marker))) return
      const child = await ctx.session.get({ sessionID: event.sessionID })
      const match = takePending(pending, child, event.prompt.text)
      if (!match) return
      event.prompt.text = event.prompt.text.slice(0, -match.marker.length)
      await ctx.session.switchModel({ sessionID: event.sessionID, model: match.model as never })
      const call = [...calls.values()].find((item) => item.pending === match)
      if (call) call.applied = true
    })

    await ctx.tool.hook("execute.after", async (event) => {
      if (event.tool !== "subagent") return
      const input = event.input as Record<string, unknown>
      const call = calls.get(event.id)
      if (!call) return
      calls.delete(event.id)
      const index = pending.indexOf(call.pending)
      if (index >= 0) pending.splice(index, 1)
      input.prompt = call.prompt
      if (call.description !== undefined) input.description = call.description
      if (!call.applied && event.status === "completed") {
        throw new Error("joonix.subagent-model: override was not applied before the subagent completed")
      }
    })
  },
})
