#!/usr/bin/env bash
set -uo pipefail

# Runs both halves of `pnpm lint` and fails when either does: oxlint over
# the tree, then the painter ratchet. The ratchet runs second so its few
# lines are the last thing printed, and it runs even when oxlint fails.

oxlint --disable-nested-config "$@"
lint_status=$?

tsx scripts/check-painter-ratchet.ts
ratchet_status=$?

if [ "$lint_status" -ne 0 ] || [ "$ratchet_status" -ne 0 ]; then
  exit 1
fi
