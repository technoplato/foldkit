#!/bin/sh
# pnpm run SCRIPT -- show inserts a lone --. Effect CLI then prints usage.
# Bun loads the same ESM entry faster than Node. Tests still spawn
# process.execPath + dist/entry.js and stay on whatever launched them.
if [ "$1" = "--" ]; then
  shift
fi
if command -v bun >/dev/null 2>&1; then
  exec bun dist/entry.js "$@"
fi
exec node dist/entry.js "$@"
