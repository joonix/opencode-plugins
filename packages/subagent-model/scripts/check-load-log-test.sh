#!/usr/bin/env bash
set -euo pipefail

ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
CHECK="$(cd "$(dirname "$0")" && pwd)/check-load-log.sh"
PLUGIN_DIR="/example/opencode-subagent-model"
LOG="$ROOT/opencode.log"

printf 'loading plugin id=%s target=%s\n' "$PLUGIN_DIR" "$PLUGIN_DIR" > "$LOG"
"$CHECK" "$LOG" "$PLUGIN_DIR"

printf 'loading plugin id=%s target=%s\nfailed to load plugin target=%s\n' "$PLUGIN_DIR" "$PLUGIN_DIR" "$PLUGIN_DIR" > "$LOG"
if "$CHECK" "$LOG" "$PLUGIN_DIR" >/dev/null 2>&1; then
  echo "failure log was accepted" >&2
  exit 1
fi

printf 'unrelated log line\n' > "$LOG"
if "$CHECK" "$LOG" "$PLUGIN_DIR" >/dev/null 2>&1; then
  echo "missing load evidence was accepted" >&2
  exit 1
fi
