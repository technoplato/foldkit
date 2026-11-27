#!/usr/bin/env bash
set -euo pipefail

# NOTE: This fork runs no gate from a git hook. A hook written into the shared
# hooks folder by mistake would otherwise run the upstream release gate, which
# cannot pass on this fork, on every push from every worktree. The gate runs
# only for a push that asks for it by setting FOLDKIT_GIT_HOOKS.
if [ -z "${FOLDKIT_GIT_HOOKS:-}" ]; then
  echo "[foldkit] No push gate runs from this hook in this fork. See AGENTS.md, Workspace Setup."
  exit 0
fi

unset $(git rev-parse --local-env-vars)
exec pnpm pre-push
