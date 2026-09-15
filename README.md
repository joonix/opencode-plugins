# OpenCode plugins

Small, independently installable OpenCode V2 plugins maintained in one Bun workspace.

| Package | Purpose |
| --- | --- |
| `packages/reviewer` | Reviews permission requests with an LLM before prompting the user. |
| `packages/subagent-model` | Lets a parent select the model and reasoning variant for a child session. |

Each package can be installed by its directory path. Published packages remain independent even though they share this repository.

```jsonc
{
  "plugins": [
    { "package": "/path/to/opencode-plugins/packages/reviewer", "options": {} },
    "/path/to/opencode-plugins/packages/subagent-model"
  ]
}
```

## Develop

Requires Bun 1.2.22 or newer and OpenCode V2.

```sh
bun install --frozen-lockfile
make test
make test-load
```

`make test-load` requires an installed `opencode2` executable. It uses disposable configuration and data directories.
