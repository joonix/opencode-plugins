# OpenCode subagent model

Adds optional `model` (`provider/model-id`) and `variant` inputs to OpenCode V2's built-in `subagent` tool. A parent agent can override either value for one call. Omitted values retain normal OpenCode behavior.

```jsonc
{ "plugins": ["/path/to/opencode-plugins/packages/subagent-model"] }
```

The plugin validates the selected model and variant against the active model catalog and reports useful tool errors for invalid values.
