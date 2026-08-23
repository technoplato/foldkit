#!/bin/sh
# Puzzle self-replicate. Served at https://puzzle.knophy.com/replicate.sh
# The copy lives in the first host. No GitHub clone.
set -eu

PAGE=https://puzzle.knophy.com
SCRIPT=${PAGE}/replicate.sh

printf "%s\n" "$PAGE"
printf "%s\n" "$SCRIPT"

open_page() {
  if [ "${PUZZLE_REPLICATE_OPEN-}" = "0" ]; then
    return 0
  fi
  if command -v open >/dev/null 2>&1; then
    open "$PAGE" || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$PAGE" || true
  fi
}

refresh_self() {
  if [ "${PUZZLE_REPLICATE_REFRESHED-}" = "1" ]; then
    return 0
  fi
  if [ "${PUZZLE_REPLICATE_REFRESH-}" = "0" ]; then
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    return 0
  fi
  tmp=$(mktemp)
  if curl -fsSL "$SCRIPT" -o "$tmp"; then
    PUZZLE_REPLICATE_REFRESHED=1 exec /bin/sh "$tmp" "$@"
  fi
  rm -f "$tmp"
}

open_page
refresh_self "$@"
