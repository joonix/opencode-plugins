import { Plugin } from "@opencode/plugin/tui"
import { createSignal, Show } from "solid-js"
import { Reviewer } from "./rpc"

interface Progress {
  readonly reviewID: string
  readonly rootSessionID: string
  readonly action: string
}

interface ReviewStart {
  readonly reviewID: string
  readonly sessionID: string
  readonly action: string
}

function toReviewStart(data: Readonly<Record<string, unknown>>): ReviewStart | undefined {
  const { reviewID, sessionID, action } = data
  if (typeof reviewID !== "string" || typeof sessionID !== "string" || typeof action !== "string") {
    console.error("opencode-reviewer-tui: unexpected reviewing event payload")
    return undefined
  }
  return { reviewID, sessionID, action }
}

export function label(progress: Progress): string {
  return `reviewer: reviewing ${progress.action}`
}

export default Plugin.define({
  id: "opencode-reviewer-tui",
  setup(context) {
    const [active, setActive] = createSignal<Readonly<Record<string, Progress>>>({})
    const current = (sessionID: string | undefined) =>
      sessionID === undefined ? undefined : Object.values(active()).find((progress) => progress.rootSessionID === sessionID)

    const rpc = context.client.rpc(Reviewer)
    const stopReviewing = rpc.events.on("reviewing", (event) => {
      const start = toReviewStart(event.data)
      if (start === undefined) return
      const progress = { ...start, rootSessionID: context.data.session.root(start.sessionID) }
      setActive((entries) => ({ ...entries, [progress.reviewID]: progress }))
    })
    const stopReviewed = rpc.events.on("reviewed", (event) => {
      const reviewID = event.data.reviewID
      if (typeof reviewID !== "string") {
        console.error("opencode-reviewer-tui: unexpected reviewed event payload")
        return
      }
      setActive((entries) => {
        const next = { ...entries }
        delete next[reviewID]
        return next
      })
    })
    const removeSlot = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => (
        <Show when={current(input.sessionID)}>
          {(progress: () => Progress) => <text wrapMode="none">{label(progress())}</text>}
        </Show>
      ),
    })

    return () => {
      stopReviewing()
      stopReviewed()
      removeSlot()
    }
  },
})
