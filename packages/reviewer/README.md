# opencode-reviewer

An OpenCode V2 plugin that gives permission requests a quick second opinion before they reach
you.

When OpenCode would normally show an `ask` prompt, the reviewer sends the pending action and its
relevant session context to a configurable model. The model can:

- **allow** routine, safe work without interrupting you;
- **deny** actions that are unsafe or outside the task; or
- **ask** you when the evidence is unclear.

The reviewer uses the root user's request and trusted harness instructions as authorization. Agent
messages and tool output are treated as untrusted context. A small set of obviously dangerous
commands is always left for human review.

> [!IMPORTANT]
> This plugin is not a security boundary. An LLM can make incorrect decisions. Keep explicit
> OpenCode `deny` rules for destructive, privileged, or externally visible actions.

Requires OpenCode V2 (verified against 2.0.4) and Bun.

## Install

```sh
opencode plugin add @joonix/opencode-reviewer
```

The package includes a terminal status-line plugin (`joonix.reviewer.tui`) and OpenCode loads it
automatically alongside the server plugin (`joonix.reviewer`). You do not need a separate TUI
entry. To configure the package, replace its entry in `~/.config/opencode/opencode.jsonc` with:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "@joonix/opencode-reviewer",
      "options": {
        "model": "openai/gpt-5.6-terra-fast",
        "variant": "medium",
        "escalationMode": "ask"
      }
    }
  ]
}
```

Remove the V1 plugin (`opencode-permission-reviewer`) before enabling this one. Restart the
OpenCode service after changing the plugin list:

```sh
opencode service restart
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `model` | `openai/gpt-5.6-terra-fast` | Reviewer model as `provider/model` |
| `variant` | unset | Optional model variant |
| `timeoutMs` | `60000` | Review deadline in milliseconds |
| `policy` | `""` | Additional owner policy |
| `escalationMode` | `"ask"` | Fallback for errors, timeouts, or an uncertain verdict: `ask` or `deny` |
| `audit` | `true` | Write reviewed requests to an audit file |
| `auditPath` | platform data directory | Audit JSONL path |

The configured model must be available through an authenticated OpenCode provider. If a review
cannot be completed, `escalationMode` determines whether the normal permission prompt is shown or
the action is denied.

## Develop

```sh
make install
make test
make test-load
```

`make test-security` runs optional live checks using synthetic prompts and requires provider
authentication.
