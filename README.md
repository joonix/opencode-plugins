# OpenCode plugins

Small, independently installable OpenCode V2 plugins maintained in one Bun workspace.

| Package | Purpose |
| --- | --- |
| `packages/reviewer` | Reviews permission requests with an LLM before prompting the user. |
| `packages/subagent-model` | Lets a parent select the model and reasoning variant for a child session. |

## Install

Install either plugin from npm with [OpenCode's plugin manager](https://opencode.ai/v2/docs/plugins#manage):

```sh
opencode plugin add @joonix/opencode-reviewer
opencode plugin add @joonix/opencode-subagent-model
opencode plugin list
```

Append `@<version>` to pin a release. See the package README files for configuration and behavior.

Installing from a Git specification does not work for this repository. OpenCode's installer ignores npm's `::path:`
subdirectory selector and installs the repository root, which is not a plugin package. Use npm or the local
configuration below.

## Local development

Clone the repository and configure either package by its directory path:

```jsonc
{
  "plugins": [
    { "package": "/path/to/opencode-plugins/packages/reviewer", "options": {} },
    "/path/to/opencode-plugins/packages/subagent-model"
  ]
}
```

Requires Bun 1.2.22 or newer and OpenCode 2.0.4 or newer.

```sh
bun install --frozen-lockfile
make test
make test-load
```

`make test-load` requires an installed `opencode2` executable. It uses disposable configuration and data directories.

## Release

Publishing is manual and per package, from a clean checkout of `main`:

```sh
(cd packages/reviewer && npm publish --access public)
(cd packages/subagent-model && npm publish --access public)
```

Both packages ship TypeScript sources; there is no build step. Bump the package `version` and tag the commit before
publishing, using one tag per released package:

```sh
git tag reviewer-v0.1.0
git tag subagent-model-v0.1.0
```

Packages are published under the `@joonix` scope. `publishConfig.access` is already `public`, so a first scoped
publish does not default to restricted.
