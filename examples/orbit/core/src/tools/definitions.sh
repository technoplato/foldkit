#!/usr/bin/env bash
# definitions.sh — machine-public orbit schema
# Public to the owner with no credentials. Protected writes require key material.
set -euo pipefail

ORIGIN="${ORBIT_ORIGIN:-}"
if [[ -z "${ORIGIN}" ]]; then
  # When served from this site, the HTML page injects origin. Fallback:
  ORIGIN="https://localhost"
fi

cat <<EOF
{
  "schema": "orbit.definitions.v1",
  "public": true,
  "owner": "technoplato",
  "capital": "disabled",
  "tools": [
    "spotsound",
    "pixel-stitch",
    "wait-inspector",
    "definitions",
    "leaderboard",
    "boomerang",
    "inspector-general",
    "reverse-refs",
    "ladder",
    "foldkit-tca",
    "foldkit-three",
    "sim-wallet",
    "agent-fetch"
  ],
  "fetch": {
    "catalog": "${ORIGIN}/api/catalog",
    "chat": "${ORIGIN}/api/chat",
    "agent": "${ORIGIN}/api/agent",
    "agent_md": "${ORIGIN}/agent.md",
    "definitions": "${ORIGIN}/definitions.sh"
  },
  "rules": {
    "no_live_wallets": true,
    "no_unreviewed_capital": true,
    "inspect_before_relay": true
  }
}
EOF
