# OpenCode plugins

Small, independently installable OpenCode V2 plugins maintained in one Bun workspace.

| Package | Purpose |
| --- | --- |
| `packages/reviewer` | Reviews permission requests with an LLM before prompting the user. |
| `packages/subagent-model` | Lets a parent select the model and reasoning variant for a child session. |
| `packages/commands` | Overrides and adds slash commands, starting with an in-place `/clear`. |

## Install

Install any of them from npm with [OpenCode's plugin manager](https://opencode.ai/v2/docs/plugins#manage):

```sh
opencode plugin add @joonix/opencode-reviewer
opencode plugin add @joonix/opencode-subagent-model
opencode plugin add @joonix/opencode-commands
opencode plugin list
```

Append `@<version>` to pin a release. See the package README files for configuration and behavior.

Update them with OpenCode's plugin manager:

```sh
opencode plugin check   # report package plugins that have a newer release
opencode plugin update  # update package plugins to their latest release
```

`update` only moves package entries that are not pinned. A directory entry tracks the checkout
instead of the registry, so local development is unaffected by it.

Installing from a Git specification does not work for this repository. OpenCode's installer ignores npm's `::path:`
subdirectory selector and installs the repository root, which is not a plugin package. Use npm or the local
configuration below.

## Local development

Clone the repository and configure any package by its directory path:

```jsonc
{
  "plugins": [
    { "package": "/path/to/opencode-plugins/packages/reviewer", "options": {} },
    "/path/to/opencode-plugins/packages/subagent-model",
    "/path/to/opencode-plugins/packages/commands"
  ]
}
```

A directory entry shadows the published package, so use it for every package you develop locally:
mixing a local checkout with an npm entry runs two different versions of this repository side by
side.

Requires Bun 1.2.22 or newer and OpenCode 2.0.4 or newer.

```sh
bun install --frozen-lockfile
make test
make test-load
```

`make test-load` requires an installed `opencode2` executable. It uses disposable configuration and data directories.

Maintainers release both packages with `make publish`, which runs the suite first. Bump each package `version`
beforehand; a version already on the registry fails the publish.
