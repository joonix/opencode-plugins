# opencode-reviewer

An OpenCode V2 plugin that gives permission requests a quick second opinion before they reach
you.

When OpenCode would normally show an `ask` prompt, the reviewer sends the pending action and its
relevant session context to a configurable model. The model can:

- **allow** routine, safe work without interrupting you;
- **deny** actions that are unsafe or outside the task; or
- **ask** you when the evidence is unclear.

The reviewer applies the effective harness and developer instructions for the acting agent rather
than embedding an independent workflow policy. Root-user requests and recorded answers establish
human authorization. Selected skills and bounded prior tool-call facts provide workflow context,
while agent messages, skill contents, commands, and tool evidence remain untrusted. A small set of
catastrophic command patterns is always left for human review.

Prior actions are reduced to sanitized categories and host-recorded completion status; raw command
arguments and tool output are not sent to the reviewer. Missing or oversized effective instructions
leave the request for human review rather than evaluating against incomplete policy.

The pending action itself is always supplied in full. If it cannot fit the review input budget, the
plugin leaves it for human review rather than silently truncating it. When the action references a
file whose contents could materially change the decision, the reviewer may use OpenCode's normal
read tool. Inspection is limited to three reads, two tool-call rounds, and 32 KiB under the same
overall review deadline. Other tools are unavailable, and file contents remain untrusted evidence.
Reads that would prompt under the active permission policy are reported as unavailable instead of
creating a recursive permission review.

Exact host re-evaluations reuse their verdict. A denial remains sticky for the same action until
trusted instructions or human authorization changes, preventing probabilistic retry-until-allow.
An uncertain `ask` verdict is cached for the unchanged action regardless of its tool-call ID or
later agent activity. It is reconsidered when human authorization or effective instructions change.
File-informed decisions are not cached, so a changed script cannot inherit an earlier verdict.

The plugin does not hardcode whether deployment, pushing, history rewriting, external comments, or
similar operations are permitted. Configure those boundaries in the instructions and permission
rules the acting agent already receives, or in the optional owner policy below.

Scope checks distinguish consequential departures from ordinary work. Bounded setup, inspection,
synchronization, and reversible housekeeping that stay local to the active workspace and preserve
existing work do not need to be enumerated merely because they are optional or happen afterward.

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
