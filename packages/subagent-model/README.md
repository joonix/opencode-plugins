# opencode-subagent-model

An OpenCode V2 plugin that adds optional `model` (`provider/model-id`) and `variant` inputs to OpenCode's
built-in `subagent` tool. A parent agent can select either value when creating or resuming a child session.

Requires OpenCode V2 (verified against 2.0.4) and Bun.

## What it does

- Extends the `subagent` tool's input schema with two optional string fields and documents them in the tool
  description, so the parent model knows it can choose a child's model and reasoning effort.
- Resolves the selection against the active model catalog before the child starts. New children use the selected
  values and fall back to their agent's or parent's defaults for omitted values.
- A resumed child keeps its current model and variant when neither override is provided. Supplying only a model uses
  that model's default variant; supplying only a variant keeps the child's current model.
- Rejects overlapping resumes of the same child session, so competing calls cannot race to change its model.
- Rejects an unknown model or an unsupported variant with a tool error listing the valid values. Disabled models are
  not offered.
- Applies the selection by tagging the child's prompt with a short marker, switching the child's model when that
  prompt is admitted, and stripping the marker again. A call that completes without its override being applied fails
  rather than silently running on the wrong model.

## Install

```sh
opencode plugin add @joonix/opencode-subagent-model
```

The CLI adds the plugin to your global OpenCode configuration. Append `@<version>` to pin a release. The plugin takes
no options.

Plugin list changes can take effect one service generation later: after editing the config, restart the background
service (`opencode service restart`) and expect the new set on the following start.

## Develop

```sh
make test       # tsc --noEmit, bun test, and the load-log check
make test-load  # loads the plugin in a throwaway OpenCode config and asserts it loaded
```

OpenCode 2.0.4 loads the package through its `exports` map, so `src/index.ts` is the entrypoint the host resolves.
The `index.ts` file at the package root only re-exports `src/` as a fallback for a host that resolves a plugin
directory as `<dir>` instead.
