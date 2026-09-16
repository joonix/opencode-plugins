/** The parts of a staged revert this flow compares to recognize its own. */
export interface StagedRevert {
  readonly messageID?: string
  readonly snapshot?: string
}

// The structural slice of the plugin context that clearSession needs. Narrower
// than Plugin.Context so the flow can be exercised without a TUI host.
export interface ClearContext {
  readonly client: {
    readonly message: {
      list(input: {
        readonly sessionID: string
        readonly limit: number
        readonly order: "asc"
      }): Promise<{ readonly data: readonly { readonly id: string }[] }>
    }
    readonly session: {
      get(input: { readonly sessionID: string }): Promise<{ readonly revert?: StagedRevert }>
      interrupt(input: { readonly sessionID: string }): Promise<unknown>
      wait(input: { readonly sessionID: string }): Promise<unknown>
      readonly revert: {
        stage(input: {
          readonly sessionID: string
          readonly messageID: string
          readonly files: boolean
        }): Promise<StagedRevert>
        commit(input: { readonly sessionID: string }): Promise<unknown>
        clear(input: { readonly sessionID: string }): Promise<unknown>
      }
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Deletes every message in a session while keeping the session itself: same id,
 * same title, same tab. Returns false when there was nothing to clear.
 *
 * OpenCode exposes no delete-message endpoint. Committing a revert staged at the
 * first message is the supported equivalent: the server drops every message and
 * queued inbox item at or after that boundary and resets instruction state.
 */
export async function clearSession(context: ClearContext, sessionID: string): Promise<boolean> {
  // Settle the session first. Staging a boundary under a running turn races the
  // writes that turn is still making. The built-in session.undo does the same.
  await context.client.session.interrupt({ sessionID })
  await context.client.session.wait({ sessionID })

  // Never stage on top of an existing revert. Staging restores a pending
  // revert's files from its original snapshot no matter what files is set to,
  // so a staged /undo plus a later manual edit would lose that edit here.
  // Committing it instead keeps the working tree exactly as it looks now, and
  // the messages it excluded are ones this clear is about to delete anyway.
  const session = await context.client.session.get({ sessionID })
  if (session.revert) await context.client.session.revert.commit({ sessionID })

  // Ask the server for the oldest message rather than reading the TUI's copy:
  // that store holds only the newest page, so its first entry is not the
  // session's first message and would leave everything older behind.
  const first = (await context.client.message.list({ sessionID, limit: 1, order: "asc" })).data[0]
  if (!first) return session.revert !== undefined

  // files: false keeps the working tree out of it. Without it the host restores
  // file snapshots and clearing the transcript would revert the agent's edits.
  const mine = await context.client.session.revert.stage({
    sessionID,
    messageID: first.id,
    files: false,
  })

  // A session is shared and OpenCode has no atomic stage-and-commit, so another
  // client can replace what is staged. Committing blind would apply whatever it
  // finds: someone else's undo, or a narrower boundary that clears only part of
  // the transcript.
  let staged: StagedRevert | undefined
  try {
    staged = (await context.client.session.get({ sessionID })).revert
  } catch (error) {
    // Unverifiable. The stage stands and the next prompt would commit it, but
    // cancelling a revert that might belong to someone else would restore their
    // files over the working tree, so say so instead of guessing.
    throw new Error(
      `Could not confirm this session's staged revert after preparing the clear: ${describe(error)}. ` +
        "A staged clear may remain, and the next prompt would apply it.",
    )
  }
  if (!isMine(staged, mine, first.id)) {
    throw new Error(
      "Another client replaced this session's staged revert while it was being cleared. " +
        "Nothing was cleared, and that revert was left alone.",
    )
  }

  try {
    await context.client.session.revert.commit({ sessionID })
  } catch (error) {
    // A staged revert outlives this failure, and OpenCode commits a pending
    // revert when the next prompt is submitted. Leaving it staged would delete
    // the transcript later without the user asking for it again.
    await rollback(context, sessionID, mine, first.id, error)
    throw error
  }
  return true
}

/**
 * Best-effort recognition of the revert this invocation staged. The boundary
 * alone is not identity: another client can stage the same message with its own
 * snapshot and file set, and clearing that would restore its files.
 */
function isMine(candidate: StagedRevert | undefined, mine: StagedRevert, boundary: string): boolean {
  if (!candidate) return false
  if (candidate.messageID !== boundary) return false
  return candidate.snapshot === mine.snapshot
}

/**
 * Cancels this plugin's staged revert after a failed commit, and only its own.
 *
 * Fails closed: when ownership cannot be established the revert is left alone.
 * An armed clear eventually does what the user asked for, whereas clearing
 * another client's revert restores its file snapshot over the working tree,
 * which nobody asked for.
 */
async function rollback(
  context: ClearContext,
  sessionID: string,
  mine: StagedRevert,
  boundary: string,
  cause: unknown,
): Promise<void> {
  let pending: StagedRevert | undefined
  try {
    pending = (await context.client.session.get({ sessionID })).revert
  } catch (readError) {
    throw new Error(
      `${describe(cause)}. Cancelling the staged clear was skipped because the session could not be ` +
        `read back (${describe(readError)}), so a staged clear may remain and the next prompt would apply it.`,
    )
  }
  // Already gone, or replaced by another client: either way there is nothing of
  // ours to cancel, and cancelling theirs would discard their work.
  if (pending === undefined) return
  if (!isMine(pending, mine, boundary)) return
  await context.client.session.revert.clear({ sessionID }).catch((cleanup: unknown) => {
    throw new Error(
      `${describe(cause)}. The session is still staged for clearing and the next prompt would apply it, ` +
        `and cancelling that staged state also failed: ${describe(cleanup)}`,
    )
  })
}
