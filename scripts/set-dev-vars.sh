#!/usr/bin/env bash
# Securely populate .dev.vars without echoing secrets or writing them to shell
# history. Uses `read -s` (hidden input). Values land only in .dev.vars, which is
# gitignored and blocked from commits by the .claude quality hook.
#
# Safe to run on camera: nothing you type is rendered. See lessons/14.
# Usage: bash scripts/set-dev-vars.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
FILE=".dev.vars"

# First run: start from the committed template so the comments carry over.
if [ ! -f "$FILE" ] && [ -f "$FILE.example" ]; then
  cp "$FILE.example" "$FILE"
fi
touch "$FILE"

set_key() {
  local name="$1" label="$2" value=""
  # -s hides input, -r keeps backslashes literal. Nothing is echoed.
  read -r -s -p "  $label (Enter to skip): " value
  echo
  if [ -z "$value" ]; then
    echo "    $name: skipped"
    return
  fi
  # Replace any existing line for this key, then append the real value.
  local tmp
  tmp="$(mktemp)"
  grep -v -E "^${name}=" "$FILE" > "$tmp" || true
  printf '%s=%s\n' "$name" "$value" >> "$tmp"
  mv "$tmp" "$FILE"
  value=""
  echo "    $name: set"
}

echo "Writing secrets to $FILE (hidden input, nothing is echoed)."
set_key "ANTHROPIC_API_KEY" "Anthropic API key"
set_key "GITHUB_TOKEN" "GitHub token"

chmod 600 "$FILE"
echo
echo "Done. $FILE is gitignored and the .claude hook blocks it from commits."
echo "wrangler dev loads it automatically."
echo "For production, set the same names in Cloudflare: wrangler secret put <NAME>"
