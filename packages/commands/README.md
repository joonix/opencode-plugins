# opencode-commands

An OpenCode V2 plugin for overriding and adding terminal slash commands. It currently ships one
command: a `/clear` that empties the current session in place instead of starting a new one.

Requires OpenCode V2 (verified against 2.0.4) and Bun.

## What it does

- **`/clear` clears the session you are in.** It deletes every message in the session and leaves you
  in the same session: same session id, same title, same tab. You can keep prompting immediately.
- **`/new` is untouched.** OpenCode ships `/clear` as an alias of its `session.new` command, so the
  built-in `/clear` starts a fresh session and leaves the old transcript behind. This plugin takes
  over that alias only. `/new`, its command-palette entry, and `<leader>n` all still run OpenCode's
  own new-session code.
- **Your files are left alone.** Clearing removes the conversation, not your work. Edits the agent
  made to your working tree stay as they are. See the limitation below for the one case where
  another client can still move files underneath it.

Queued prompts and the session's instruction state are cleared along with the messages, because the
server drops them at the same boundary.

## Install

```sh
opencode plugin add @joonix/opencode-commands
```

The CLI adds the plugin to your global OpenCode configuration. Append `@<version>` to pin a release.
The plugin takes no options. It registers `joonix.commands` on the server and `joonix.commands.tui`
in the terminal, which is what a `plugins` disable selector such as `-joonix.commands.tui` or
`-joonix.*` matches.

Plugin list changes can take effect one service generation later: after editing the config, restart
the background service (`opencode service restart`) and expect the new set on the following start.

## Update

```sh
opencode plugin check   # report package plugins that have a newer release
opencode plugin update  # update package plugins to their latest release
```

`update` applies to package entries. A pinned `@<version>` entry stays pinned, and a directory entry
tracks the checkout rather than the registry, so neither is changed by it. The running service picks
up the new version on its own; restart it only if the change does not appear.

## How the override works

OpenCode has no delete-message API. Committing a revert staged at the session's first message is the
supported equivalent: the server deletes every message and queued inbox item at or after that
boundary and resets instruction state, then the TUI prunes its own copy from the same event.

Three details make that safe rather than merely working:

- **`files: false` when staging.** Otherwise the host restores file snapshots from the boundary and
  clearing the transcript would revert the agent's edits along with it.
- **A revert that is already staged gets committed first.** Staging restores a pending revert's files
  from its original snapshot regardless of `files: false`, so staging on top of a pending `/undo`
  would discard anything edited since. Committing it keeps the working tree as it currently looks,
  and the messages it excluded are ones the clear is about to delete anyway.
- **The boundary comes from the server, not the TUI store.** That store holds only the newest page of
  messages, so its first entry is not the session's first message. The plugin asks for the oldest
  message explicitly; using the store would silently leave everything older in place.

If the commit fails after staging succeeded, the plugin cancels the staged revert. A revert left
staged is committed automatically when the next prompt is submitted, which would delete the
transcript later without being asked again. It only cancels a revert that is still its own, so a
failure cannot discard work another client staged in the meantime.

## Limitation: a shared session

A session can have several clients attached, and OpenCode has no atomic stage-and-commit for
reverts. Between staging and committing, another client can replace the staged revert. The plugin
checks that the staged revert is still the one it asked for and refuses to commit if it is not, so
it will not apply somebody else's boundary or clear only part of a transcript.

The one case it cannot defend against is a revert staged by another client in the moment between
this plugin reading the session and staging its own: OpenCode restores that revert's recorded files
as part of staging, regardless of `files: false`. This window is inherent to the revert API and
affects the built-in `/undo` the same way. In practice it requires two clients acting on one session
at the same instant.

Taking over the `/clear` name needs one extra step. Slash completion is keyed by command id rather
than by slash name, so registering a second command named `clear` would simply list two `/clear`
entries. Instead the plugin redeclares the host's `session.new` in a higher-priority layer, omitting
the `clear` alias, and returns `false` from it. Returning `false` rejects that entry, so dispatch
continues down the chain to OpenCode's real handler and `/new` keeps working normally.

## Develop

```sh
make test       # tsc --noEmit and bun test
make test-load  # loads the plugin in a throwaway OpenCode config and asserts it loaded
```

Entry resolution depends on how the plugin is configured. A package entry such as
`@joonix/opencode-commands` resolves through the `exports` map to `src/index.ts` and `src/tui.tsx`. A
directory entry, used when developing against a local checkout, resolves `<dir>` instead, so the
`index.ts` and `tui.tsx` files at the package root re-export `src/` to keep that path working.

`make test` covers the clear sequence against a fake client. The command wiring itself (which slash
names appear, and that `/new` still falls through) is only exercised by running the TUI.
