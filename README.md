# OpenCode plugins

Small, independently installable OpenCode V2 plugins maintained in one Bun workspace.

| Package | Purpose |
| --- | --- |
| `packages/reviewer` | Reviews permission requests with an LLM before prompting the user. |
| `packages/subagent-model` | Lets a parent select the model and reasoning variant for a child session. |

## Install

[OpenCode's plugin manager](https://opencode.ai/v2/docs/plugins#manage) accepts npm-compatible Git package specifications, including packages in monorepo subdirectories:

```sh
opencode plugin add 'github:joonix/opencode-plugins#main::path:packages/reviewer'
opencode plugin add 'github:joonix/opencode-plugins#main::path:packages/subagent-model'
opencode plugin list
```

Use a tag or full commit hash instead of `main` when you want to pin updates. See the package README files for configuration and behavior.

OpenCode 2.0.3 has a Git dependency preparation issue with monorepo subdirectory packages. If `plugin add` reports `git dep preparation failed` on that release, clone this repository and use the local configuration below.

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

Requires Bun 1.2.22 or newer and OpenCode V2.

```sh
bun install --frozen-lockfile
make test
make test-load
```

`make test-load` requires an installed `opencode2` executable. It uses disposable configuration and data directories.
