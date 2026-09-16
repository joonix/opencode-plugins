# OpenCode plugins

Small, independently installable OpenCode V2 plugins maintained in one Bun workspace.

| Package | Purpose |
| --- | --- |
| `packages/reviewer` | Reviews permission requests with an LLM before prompting the user. |
| `packages/subagent-model` | Lets a parent select the model and reasoning variant for a child session. |
| `packages/commands` | Overrides and adds slash commands, starting with an in-place `/clear`. |

## Install

From npm, with [OpenCode's plugin manager](https://opencode.ai/v2/docs/plugins#manage):

```sh
opencode plugin add @joonix/opencode-reviewer
opencode plugin add @joonix/opencode-subagent-model
opencode plugin add @joonix/opencode-commands
opencode plugin list
```

Append `@<version>` to pin a release; each package README covers configuration and behavior. Git
specifications do not work here: OpenCode's installer ignores npm's `::path:` subdirectory selector
and installs the repository root, which is not a plugin package.

## Update

```sh
opencode plugin check   # report package plugins that have a newer release
opencode plugin update  # update package plugins to their latest release
```

`update` only moves package entries that are not pinned. A pinned `@<version>` entry stays pinned,
and a directory entry tracks the checkout instead of the registry, so local development is
unaffected by it.

## Local development

Requires Bun 1.2.22 or newer and OpenCode 2.0.4 or newer. Configure a package by its directory path,
which shadows the published package. Use directory entries for every package you develop locally;
mixing one with an npm entry runs two versions of this repository side by side.

```jsonc
{
  "plugins": [
    { "package": "/path/to/opencode-plugins/packages/reviewer", "options": {} },
    "/path/to/opencode-plugins/packages/subagent-model",
    "/path/to/opencode-plugins/packages/commands"
  ]
}
```

```sh
bun install --frozen-lockfile
make test
make test-load
```

`make test-load` needs an installed `opencode2` executable and uses disposable configuration and data
directories. Maintainers publish with `make publish`, which runs the suite and each package's load
check first. It publishes only packages whose local version is not yet on npm and skips unchanged,
already-published packages. If local package content differs from its published version, the
preflight rejects it and suggests the next patch; bump that package and refresh `bun.lock` before
retrying.
