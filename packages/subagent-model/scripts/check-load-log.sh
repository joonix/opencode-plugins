#!/usr/bin/env bash
set -euo pipefail

LOG="$1"
PLUGIN_DIR="$2"

grep -q "loading plugin.*id=$PLUGIN_DIR " "$LOG"
if grep -qE "failed to load plugin.*(opencode-subagent-model|target=$PLUGIN_DIR)" "$LOG"; then
  grep -E "failed to load plugin.*(opencode-subagent-model|target=$PLUGIN_DIR)" "$LOG" | tail -1 >&2
  exit 1
fi
