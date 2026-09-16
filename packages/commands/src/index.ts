import { Plugin } from "@opencode/plugin"

// The terminal half does the work; commands only exist in the TUI. This server
// entry is what `opencode plugin add` and a `plugins` config entry resolve to,
// and the host loads ./tui beside it from the same package.
export default Plugin.define({
  id: "joonix.commands",
  setup() {},
})
