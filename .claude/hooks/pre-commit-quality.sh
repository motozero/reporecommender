#!/usr/bin/env bash
# PreToolUse(Bash) quality and safety gate.
# Blocks `git commit` when staged changes leak secrets or break the house
# writing style. Exit 2 tells Claude Code to block the tool call and shows
# the message below. Any other path exits 0 (allow).
#
# No jq or node dependency: we inspect the raw hook payload as text to decide
# whether this is a commit, then use git on the staged set.

payload="$(cat)"

# Only act on git commit attempts. Everything else passes straight through.
case "$payload" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
staged="$(git diff --cached --name-only 2>/dev/null)"
[ -z "$staged" ] && exit 0

fail=0
msgs=""

# 1) Never commit the local secrets file.
if printf '%s\n' "$staged" | grep -qxF '.dev.vars'; then
  fail=1
  msgs="${msgs}
- .dev.vars is staged. Secrets are never committed. Use 'wrangler secret put'."
fi

# 2) Block obvious key material anywhere in the staged diff.
if git diff --cached -U0 2>/dev/null | grep -nE 'sk-ant-[A-Za-z0-9]{8}|ghp_[A-Za-z0-9]{20}' >/dev/null 2>&1; then
  fail=1
  msgs="${msgs}
- The staged diff contains something shaped like an API key. Remove it."
fi

# 3) House style: no em dashes in user-facing copy (UI, docs, lessons).
uface="$(printf '%s\n' "$staged" | grep -E '^(public/|lessons/|.*\.md)$' || true)"
if [ -n "$uface" ]; then
  if printf '%s\n' "$uface" | tr '\n' '\0' | xargs -0 grep -lF '—' 2>/dev/null | grep -q .; then
    fail=1
    msgs="${msgs}
- An em dash was found in user-facing copy. Use a comma, period, or rewrite."
  fi
fi

if [ "$fail" -ne 0 ]; then
  printf 'Commit blocked by the .claude quality gate:%s\n' "$msgs" >&2
  exit 2
fi
exit 0
