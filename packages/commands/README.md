# opencode-commands

An OpenCode V2 plugin that overrides and adds terminal slash commands. It ships one: a `/clear` that
empties the current session in place instead of starting a new one.

Requires OpenCode V2 (verified against 2.0.4) and Bun.

## What it does

- **`/clear` clears the session you are in.** Every message is deleted and you stay put: same
  session id, title and tab, ready for the next prompt. Queued prompts and instruction state go with
  the messages; the server drops them at the same boundary.
- **Your files are left alone.** The agent's edits to your working tree survive, except in the
  shared-session case below.
- **`/new` is untouched.** OpenCode ships `/clear` as an alias of `session.new`; the plugin takes
  over that alias only. `/new`, its command-palette entry, and `<leader>n` still run OpenCode's own
  new-session code.

## Install

```sh
opencode plugin add @joonix/opencode-commands
```

Append `@<version>` to pin a release. The plugin takes no options. It registers `joonix.commands` on
the server and `joonix.commands.tui` in the terminal, the ids matched by a `plugins` disable
selector such as `-joonix.commands.tui` or `-joonix.*`.

Plugin list changes can take effect one service generation later: restart the background service
(`opencode service restart`) and expect the new set on the following start.

## Update

```sh
opencode plugin check   # report package plugins that have a newer release
opencode plugin update  # update package plugins to their latest release
```

Pinned `@<version>` entries and directory entries are left alone. The running service picks up the
new version on its own; restart it only if the change does not appear.

## How the override works

OpenCode has no delete-message API. Committing a revert staged at the session's first message is the
supported equivalent: the server deletes every message and queued inbox item from that boundary on
and resets instruction state, and the TUI prunes its copy from the same event. Four details make
that safe:

- **Staged with `files: false`.** That is what keeps the working tree out of it; otherwise the host
  restores file snapshots from the boundary and reverts the agent's edits with the transcript.
- **An already staged revert is committed first.** Staging restores a pending revert's files from its
  original snapshot regardless of `files: false`, so staging over a pending `/undo` would discard
  anything edited since. Committing leaves the working tree as it is and drops only messages the
  clear deletes anyway.
- **The boundary comes from the server, not the TUI store.** That store holds only the newest page of
  messages, so using it would silently leave everything older in place.
- **A failed commit cancels its own staged revert.** A revert left staged is committed on the next
  prompt, deleting the transcript unasked; only the plugin's own revert is cancelled.

Slash completion is keyed by command id, not by slash name, so a second command named `clear` would
list two `/clear` entries. The plugin instead redeclares the host's `session.new` in a
higher-priority layer without the `clear` alias and returns `false`, which rejects that entry so
dispatch falls through to OpenCode's real handler and `/new` keeps working.

### Limitation: a shared session

Several clients can attach to one session, and OpenCode has no atomic stage-and-commit for reverts.
Between staging and committing, another client can replace the staged revert; the plugin verifies
the staged revert is still its own and refuses to commit otherwise, so it never applies somebody
else's boundary, clears part of a transcript, or discards work another client staged.

The undefended window is a revert another client stages between the plugin reading the session and
staging its own: OpenCode restores that revert's recorded files as part of staging, regardless of
`files: false`. That window is inherent to the revert API, affects the built-in `/undo` equally, and
needs two clients acting on one session at the same instant.

## Develop

```sh
make test       # tsc --noEmit and bun test
make test-load  # loads the plugin in a throwaway OpenCode config and asserts it loaded
```

`make test` covers the clear sequence against a fake client. The command wiring (which slash names
appear, and that `/new` still falls through) is only exercised by running the TUI.

A package entry such as `@joonix/opencode-commands` resolves through the `exports` map to
`src/index.ts` and `src/tui.tsx`; a directory entry resolves `<dir>`, so the `index.ts` and
`tui.tsx` files at the package root re-export `src/` to keep that path working.
