#!/bin/sh
# pnpm run SCRIPT -- show inserts a lone --. Effect CLI then prints usage.
if [ "$1" = "--" ]; then
  shift
fi
exec node dist/entry.js "$@"
