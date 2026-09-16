/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { clearSession } from "./clear"

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function Commands(props: { readonly context: Plugin.Context }) {
  const context = props.context
  const sessionID = () => {
    const route = context.ui.router.current()
    return route.type === "session" ? route.sessionID : undefined
  }

  context.keymap.layer(() => ({
    mode: "global",
    priority: 10,
    commands: [
      {
        // Redeclaring the host's own command shadows its metadata in slash
        // completion, which is the only way to drop its "clear" alias: the
        // completion list is keyed by command id, not by slash name, so a
        // second /clear would otherwise just sit beside the built-in one.
        //
        // Returning false rejects this entry and dispatch continues down the
        // chain to the host's real handler, so /new, the command palette entry
        // and <leader>n keep their original behavior.
        id: "session.new",
        title: "New session",
        group: "Session",
        bind: false,
        palette: true,
        slash: { name: "new" },
        suggested: () => sessionID() !== undefined,
        run: () => false,
      },
      {
        id: "joonix.commands.clear",
        title: "Clear session history",
        description: "Delete every message in this session, keeping its id, title and tab",
        group: "Session",
        palette: true,
        slash: { name: "clear" },
        enabled: () => sessionID() !== undefined,
        run: async () => {
          const id = sessionID()
          if (!id) return
          try {
            const cleared = await clearSession(context, id)
            if (!cleared) context.ui.toast.show({ message: "Nothing to clear", variant: "info" })
          } catch (error) {
            context.ui.toast.show({
              title: "Failed to clear session",
              message: describe(error),
              variant: "error",
            })
          }
          context.ui.dialog.clear()
        },
      },
    ],
  }))
  return null
}

export default Plugin.define({
  id: "joonix.commands.tui",
  setup(context) {
    // Mounted through a slot so the keymap layer gets a Solid owner and is torn
    // down with the plugin. keymap.layer is reactive and needs that ownership.
    return context.ui.slot({ append: "app", render: () => <Commands context={context} /> })
  },
})
