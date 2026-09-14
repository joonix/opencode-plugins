#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OPENCODE="${OPENCODE:-$HOME/.bun/bin/opencode}"
ROOT="$(mktemp -d)"

export XDG_CONFIG_HOME="$ROOT/config"
export XDG_DATA_HOME="$ROOT/data"
export XDG_STATE_HOME="$ROOT/state"
export XDG_CACHE_HOME="$ROOT/cache"
trap '"$OPENCODE" service stop >/dev/null 2>&1 || true; rm -rf "$ROOT"' EXIT

mkdir -p "$XDG_CONFIG_HOME/opencode"
cat > "$XDG_CONFIG_HOME/opencode/opencode.jsonc" <<EOF
{ "plugins": [{ "package": "$PLUGIN_DIR" }] }
EOF

"$OPENCODE" service set port "$((49000 + RANDOM % 500))" >/dev/null
# A service generation loads the plugin set the previous one saw, so boot twice.
for _ in 1 2; do
  "$OPENCODE" service restart >/dev/null 2>&1
  "$OPENCODE" debug agents >/dev/null
done

LOG="$XDG_DATA_HOME/opencode/log/opencode.log"
grep -q "loading plugin\" id=$PLUGIN_DIR " "$LOG" || {
  echo "load check failed: the host never loaded $PLUGIN_DIR"
  exit 1
}
if grep -qE "failed to load plugin\" (plugin.id=opencode-reviewer|target=$PLUGIN_DIR)" "$LOG"; then
  grep -E "failed to load plugin\" (plugin.id=opencode-reviewer|target=$PLUGIN_DIR)" "$LOG" | tail -1
  exit 1
fi
echo "load check ok: $PLUGIN_DIR loaded by opencode $("$OPENCODE" --version)"
