# OpenCode subagent model

Adds optional `model` (`provider/model-id`) and `variant` inputs to OpenCode V2's built-in `subagent` tool. A parent agent can select either value when creating or resuming a child session.

New children use the selected values, falling back to their agent or parent defaults for omitted values. A resumed child keeps its current model and variant when neither override is provided. Supplying only a model uses that model's default variant; supplying only a variant keeps the child's current model.

Overlapping resumes of the same child are rejected so competing calls cannot race to change its model.

```sh
opencode plugin add 'github:joonix/opencode-plugins#main::path:packages/subagent-model'
```

The CLI adds the plugin to your global OpenCode configuration. Use a tag or full commit hash instead of `main` to pin updates.

The plugin validates the selected model and variant against the active model catalog and reports useful tool errors for invalid values.
