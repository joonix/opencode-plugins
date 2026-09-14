import { Plugin } from "@opencode/plugin/tui"
import { createSignal, Show } from "solid-js"
import { Reviewer } from "./rpc"

interface Entry {
  readonly rootSessionID: string
  readonly action: string
  readonly resource: string
  readonly decision: string
  readonly durationMs: number
}

const VERBS: Readonly<Record<string, string>> = { allow: "allowed", deny: "denied", ask: "asked" }
const MAX_RESOURCE = 32

function toEntry(data: Readonly<Record<string, unknown>>): Entry | undefined {
  const { rootSessionID, action, resource, decision, durationMs } = data
  if (
    typeof rootSessionID !== "string" ||
    typeof action !== "string" ||
    typeof resource !== "string" ||
    typeof decision !== "string" ||
    typeof durationMs !== "number"
  ) {
    console.error("opencode-reviewer-tui: unexpected reviewed event payload")
    return undefined
  }
  return { rootSessionID, action, resource, decision, durationMs }
}

function label(entry: Entry): string {
  const verb = VERBS[entry.decision] ?? entry.decision
  const resource = entry.resource.length <= MAX_RESOURCE ? entry.resource : `${entry.resource.slice(0, MAX_RESOURCE)}...`
  const seconds = (entry.durationMs / 1000).toFixed(1)
  return `reviewer: ${verb} ${entry.action} ${resource} · ${seconds}s`.trimEnd()
}

export default Plugin.define({
  id: "opencode-reviewer-tui",
  setup(context) {
    // Keyed by the root session the server resolved: decisions arrive from
    // child sessions too, and the footer only knows the session it shows.
    const [last, setLast] = createSignal<Readonly<Record<string, Entry>>>({})
    const current = (sessionID: string | undefined) => (sessionID === undefined ? undefined : last()[sessionID])

    const stop = context.client.rpc(Reviewer).events.on("reviewed", (event) => {
      const entry = toEntry(event.data)
      if (entry === undefined) return
      setLast((entries) => ({ ...entries, [entry.rootSessionID]: entry }))
    })
    const removeSlot = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => <Show when={current(input.sessionID)}>{(entry: () => Entry) => <text>{label(entry())}</text>}</Show>,
    })

    return () => {
      stop()
      removeSlot()
    }
  },
})
