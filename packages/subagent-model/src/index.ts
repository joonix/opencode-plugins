import { Plugin } from "@opencode/plugin"
import type { ModelInfo, ModelRef, Pending } from "./resolve"
import { marker, resolveOverride, takePending } from "./resolve"

type Field = { annotate(input: { description: string }): Field }
type Struct = {
  readonly fields: Record<string, Field>
  mapFields(transform: (fields: Record<string, Field>) => Record<string, Field>): unknown
}

export default Plugin.define({
  id: "opencode-subagent-model",
  async setup(ctx) {
    const pending: Pending[] = []

    await ctx.tool.transform((editor) => {
      const original = editor.get("subagent")
      if (!original) throw new Error("opencode-subagent-model: built-in subagent tool not found")
      editor.update("subagent", (tool) => {
        const input = tool.input as unknown as Struct
        const optionalString = input.fields.sessionID
        if (!optionalString) throw new Error("opencode-subagent-model: incompatible subagent input schema")
        tool.input = input.mapFields((fields) => ({
          ...fields,
          model: optionalString.annotate({
            description: "Optional provider/model-id override for this subagent call",
          }),
          variant: optionalString.annotate({
            description: "Optional reasoning variant (effort) override for this subagent call",
          }),
        })) as typeof tool.input
        tool.description += " Optional model and variant inputs override the subagent defaults for this call only."
      })
    })

    await ctx.tool.hook("execute.before", async (event) => {
      if (event.tool !== "subagent") return
      const input = event.input as Record<string, unknown>
      const override = {
        model: typeof input.model === "string" ? input.model : undefined,
        variant: typeof input.variant === "string" ? input.variant : undefined,
      }
      if (!override.model && !override.variant) return

      const agentID = String(input.agent)
      const resumedSessionID = typeof input.sessionID === "string" ? input.sessionID : undefined
      const [catalog, agent, session] = await Promise.all([
        ctx.catalog.model.list(),
        ctx.agent.get({ agentID }),
        ctx.session.get({ sessionID: resumedSessionID ?? event.sessionID }),
      ])
      const base = resumedSessionID ? session.model : agent.data.model ?? session.model
      if (!base) throw new Error("Cannot determine the subagent's default model")
      const model = resolveOverride(override, base, catalog.data as readonly ModelInfo[])!

      delete input.model
      delete input.variant
      if (resumedSessionID) {
        await ctx.session.switchModel({ sessionID: resumedSessionID, model: model as ModelRef as never })
        return
      }
      const suffix = marker(event.id)
      const prompt = String(input.prompt)
      input.prompt = prompt + suffix
      pending.push({
        parentID: event.sessionID,
        agent: agentID,
        prompt,
        marker: suffix,
        model,
        createdAt: Date.now(),
      })
    })

    await ctx.session.hook("prompt", async (event) => {
      if (pending.length === 0) return
      const child = await ctx.session.get({ sessionID: event.sessionID })
      const match = takePending(pending, child, event.prompt.text)
      if (!match) return
      event.prompt.text = event.prompt.text.slice(0, -match.marker.length)
      await ctx.session.switchModel({ sessionID: event.sessionID, model: match.model as never })
    })
  },
})
