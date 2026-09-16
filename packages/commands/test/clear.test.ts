import { expect, test } from "bun:test"
import { clearSession, type ClearContext } from "../src/clear"

type Call = { readonly name: string; readonly input: Record<string, unknown> }

type Options = {
  /** Oldest-first message ids the server holds. */
  readonly messageIDs?: readonly string[]
  /** A revert already staged by something else, for example /undo. */
  readonly staged?: { readonly messageID: string }
  /** Replaces the staged revert with a foreign one right after the plugin stages. */
  readonly hijackAfterStage?: { readonly messageID: string; readonly snapshot?: string }
  /** Replaces it once the plugin's own commit has failed, so rollback sees it. */
  readonly hijackOnCommitFailure?: { readonly messageID: string; readonly snapshot?: string }
  /** Fails the ownership read that runs straight after staging. */
  readonly failOwnershipRead?: boolean
  /** Fails the session read inside rollback. */
  readonly failRollbackRead?: boolean
  readonly failStage?: boolean
  readonly failCommit?: boolean
  readonly failRevertClear?: boolean
}

/**
 * Models the parts of the server this flow depends on: a staged revert is
 * durable, committing one deletes every message from its boundary onward, and
 * clearing one drops it. Ordering mistakes therefore fail as missing data
 * rather than only as a different call sequence.
 */
function harness(options: Options = {}) {
  const calls: Call[] = []
  let messages = [...(options.messageIDs ?? ["msg_first", "msg_second"])].map((id) => ({ id }))
  let revert: { readonly messageID: string; readonly snapshot?: string } | undefined = options.staged
  let staging = 0
  let commits = 0
  let sessionGets = 0

  const commitPending = () => {
    if (!revert) return
    const boundary = messages.findIndex((message) => message.id === revert?.messageID)
    if (boundary !== -1) messages = messages.slice(0, boundary)
    revert = undefined
  }

  const context: ClearContext = {
    client: {
      message: {
        list: async (input) => {
          calls.push({ name: "message.list", input: { ...input } })
          return { data: messages.slice(0, input.limit) }
        },
      },
      session: {
        get: async (input) => {
          sessionGets += 1
          calls.push({ name: "session.get", input: { ...input } })
          // Reads: 1 pre-flight, 2 ownership after staging, 3 inside rollback.
          if (options.failOwnershipRead && sessionGets === 2) throw new Error("session.get failed")
          if (options.failRollbackRead && sessionGets === 3) throw new Error("session.get failed")
          return revert ? { revert: { ...revert } } : {}
        },
        interrupt: async (input) => {
          calls.push({ name: "interrupt", input })
        },
        wait: async (input) => {
          calls.push({ name: "wait", input })
        },
        revert: {
          stage: async (input) => {
            calls.push({ name: "revert.stage", input: { ...input } })
            if (options.failStage) throw new Error("revert.stage failed")
            staging += 1
            const created = { messageID: input.messageID, snapshot: `snap_${staging}` }
            revert = created
            if (options.hijackAfterStage) revert = options.hijackAfterStage
            return created
          },
          commit: async (input) => {
            calls.push({ name: "revert.commit", input })
            commits += 1
            // Only the plugin's own commit is made to fail, not the one that
            // flushes a pre-existing revert.
            if (options.failCommit && commits > (options.staged ? 1 : 0)) {
              if (options.hijackOnCommitFailure) revert = options.hijackOnCommitFailure
              throw new Error("revert.commit failed")
            }
            commitPending()
          },
          clear: async (input) => {
            calls.push({ name: "revert.clear", input })
            if (options.failRevertClear) throw new Error("revert.clear failed")
            revert = undefined
          },
        },
      },
    },
  }
  const names = () => calls.map((call) => call.name)
  return { context, calls, names, remaining: () => messages, staged: () => revert }
}

test("clears a session by committing a revert staged at its first message", async () => {
  const { context, calls, remaining } = harness({ messageIDs: ["msg_first", "msg_second", "msg_third"] })

  expect(await clearSession(context, "ses_1")).toBe(true)
  expect(calls.find((call) => call.name === "revert.stage")?.input).toEqual({
    sessionID: "ses_1",
    messageID: "msg_first",
    files: false,
  })
  expect(remaining()).toEqual([])
})

test("asks the server for the oldest message instead of trusting a paged store", async () => {
  // The TUI store holds only the newest page, so the boundary has to come from
  // an explicit ascending query or everything older survives the clear.
  const { context, calls } = harness()

  await clearSession(context, "ses_1")

  expect(calls.find((call) => call.name === "message.list")?.input).toEqual({
    sessionID: "ses_1",
    limit: 1,
    order: "asc",
  })
})

test("stages with files false so clearing never reverts working-tree edits", async () => {
  const { context, calls } = harness()

  await clearSession(context, "ses_1")

  expect(calls.find((call) => call.name === "revert.stage")?.input).toMatchObject({ files: false })
})

test("flushes an already staged revert before choosing its boundary", async () => {
  // Staging over a pending revert restores that revert's files regardless of
  // the files flag. Committing it first also deletes messages, so the boundary
  // has to be read afterwards or it names a message that no longer exists.
  const { context, names, remaining } = harness({
    messageIDs: ["msg_first", "msg_second", "msg_third"],
    staged: { messageID: "msg_third" },
  })

  expect(await clearSession(context, "ses_1")).toBe(true)
  const order = names()
  expect(order.indexOf("revert.commit")).toBeLessThan(order.indexOf("message.list"))
  expect(order.indexOf("message.list")).toBeLessThan(order.indexOf("revert.stage"))
  expect(remaining()).toEqual([])
})

test("reports success when committing a pre-existing revert empties the session", async () => {
  const { context, names, remaining } = harness({
    messageIDs: ["msg_first", "msg_second"],
    staged: { messageID: "msg_first" },
  })

  expect(await clearSession(context, "ses_1")).toBe(true)
  expect(names().filter((name) => name === "revert.commit")).toHaveLength(1)
  expect(names()).not.toContain("revert.stage")
  expect(remaining()).toEqual([])
})

test("does not commit a pre-existing revert when none is staged", async () => {
  const { context, names } = harness()

  await clearSession(context, "ses_1")

  expect(names().filter((name) => name === "revert.commit")).toHaveLength(1)
})

test("settles the session before staging a boundary under a running turn", async () => {
  const { context, names } = harness()

  await clearSession(context, "ses_1")

  const order = names()
  expect(order.indexOf("interrupt")).toBeLessThan(order.indexOf("wait"))
  expect(order.indexOf("wait")).toBeLessThan(order.indexOf("revert.stage"))
})

test("reports an empty session as nothing to clear without staging anything", async () => {
  const { context, names } = harness({ messageIDs: [] })

  expect(await clearSession(context, "ses_empty")).toBe(false)
  expect(names()).not.toContain("revert.stage")
})

test("propagates a staging failure instead of committing a partial revert", async () => {
  const { context, names } = harness({ failStage: true })

  await expect(clearSession(context, "ses_1")).rejects.toThrow("revert.stage failed")
  expect(names()).not.toContain("revert.commit")
})

test("refuses to commit a revert another client replaced, and leaves it alone", async () => {
  // Committing blind would apply someone else's boundary: either their undo or
  // a narrower one that clears only part of the transcript.
  const { context, names, remaining, staged } = harness({
    messageIDs: ["msg_first", "msg_second", "msg_third"],
    hijackAfterStage: { messageID: "msg_third" },
  })

  await expect(clearSession(context, "ses_1")).rejects.toThrow("Another client replaced")
  expect(names()).not.toContain("revert.commit")
  expect(names()).not.toContain("revert.clear")
  expect(staged()).toEqual({ messageID: "msg_third" })
  expect(remaining()).toHaveLength(3)
})

test("cancels its own staged revert when the commit fails", async () => {
  // OpenCode commits a pending revert on the next prompt, so a revert left
  // staged here would delete the transcript later without being asked again.
  const { context, names, staged } = harness({ failCommit: true })

  await expect(clearSession(context, "ses_1")).rejects.toThrow("revert.commit failed")
  expect(names()).toContain("revert.clear")
  expect(staged()).toBeUndefined()
})

test("leaves a foreign revert staged when its own commit fails", async () => {
  // Cancelling here would discard another client's work and restore its files.
  // The hijack lands after the failed commit so rollback, not the ownership
  // check, is what has to notice it.
  const { context, names, staged } = harness({
    failCommit: true,
    hijackOnCommitFailure: { messageID: "msg_second" },
  })

  await expect(clearSession(context, "ses_1")).rejects.toThrow("revert.commit failed")
  expect(names()).not.toContain("revert.clear")
  expect(staged()).toEqual({ messageID: "msg_second" })
})

test("reports the pending deletion when cancelling the staged revert also fails", async () => {
  const { context } = harness({ failCommit: true, failRevertClear: true })

  await expect(clearSession(context, "ses_1")).rejects.toThrow("the next prompt would apply it")
})

test("leaves the revert alone when rollback cannot establish ownership", async () => {
  // Fail closed. An armed clear eventually does what was asked; clearing a
  // revert that might belong to someone else restores their files over the
  // working tree, which nobody asked for.
  const { context, names } = harness({ failCommit: true, failRollbackRead: true })

  await expect(clearSession(context, "ses_1")).rejects.toThrow("a staged clear may remain")
  expect(names()).not.toContain("revert.clear")
})

test("reports the armed clear when the ownership read fails after staging", async () => {
  // The stage already landed, so failing here without saying so would leave a
  // clear that the next prompt silently applies.
  const { context, names, staged } = harness({ failOwnershipRead: true })

  await expect(clearSession(context, "ses_1")).rejects.toThrow("A staged clear may remain")
  expect(names()).not.toContain("revert.commit")
  expect(names()).not.toContain("revert.clear")
  expect(staged()).toMatchObject({ messageID: "msg_first" })
})

test("refuses to commit a foreign revert staged at the same boundary", async () => {
  // Matching the boundary is not ownership: another client can stage the same
  // message with its own snapshot and file set.
  const { context, names, remaining } = harness({
    hijackAfterStage: { messageID: "msg_first", snapshot: "snap_other" },
  })

  await expect(clearSession(context, "ses_1")).rejects.toThrow("Another client replaced")
  expect(names()).not.toContain("revert.commit")
  expect(remaining()).toHaveLength(2)
})

test("does not cancel a foreign revert staged at the same boundary", async () => {
  const { context, names, staged } = harness({
    failCommit: true,
    hijackOnCommitFailure: { messageID: "msg_first", snapshot: "snap_other" },
  })

  await expect(clearSession(context, "ses_1")).rejects.toThrow("revert.commit failed")
  expect(names()).not.toContain("revert.clear")
  expect(staged()).toMatchObject({ snapshot: "snap_other" })
})
