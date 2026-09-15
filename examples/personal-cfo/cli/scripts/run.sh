#!/bin/sh
if [ "$1" = "--" ]; then
  shift
fi
if command -v bun >/dev/null 2>&1; then
  exec bun dist/entry.js "$@"
fi
exec node dist/entry.js "$@"
