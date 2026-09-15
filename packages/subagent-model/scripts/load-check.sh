#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OPENCODE="${OPENCODE:-$HOME/.bun/bin/opencode2}"
ROOT="$(mktemp -d)"
trap '"$OPENCODE" service stop >/dev/null 2>&1 || true; rm -rf "$ROOT"' EXIT
export XDG_CONFIG_HOME="$ROOT/config" XDG_DATA_HOME="$ROOT/data" XDG_STATE_HOME="$ROOT/state" XDG_CACHE_HOME="$ROOT/cache"
mkdir -p "$XDG_CONFIG_HOME/opencode"
printf '{ "plugins": ["%s"] }\n' "$PLUGIN_DIR" > "$XDG_CONFIG_HOME/opencode/opencode.jsonc"
"$OPENCODE" service set port "$((49500 + RANDOM % 400))" >/dev/null
for _ in 1 2; do "$OPENCODE" service restart >/dev/null 2>&1; "$OPENCODE" debug agents >/dev/null; done
LOG="$XDG_DATA_HOME/opencode/log/opencode.log"
grep -q "loading plugin.*id=$PLUGIN_DIR " "$LOG"
! grep -qE "failed to load plugin.*(opencode-subagent-model|target=$PLUGIN_DIR)" "$LOG"
echo "load check ok: $PLUGIN_DIR"
