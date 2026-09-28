#!/bin/bash
# Copies Scribe's Instant schema into the words core, so the web reads exactly
# what the iPhone writes. Run after the Scribe schema changes.
set -euo pipefail
scribe_repo="${SCRIBE_REPO:-/Users/laptop/Sync/worktrees/scribe-instant-combined}"
here="$(cd "$(dirname "$0")/.." && pwd)"
target="$here/core/src/scribeSchema.ts"
cp "$scribe_repo/instant.schema.ts" "$target"
commit="$(git -C "$scribe_repo" log -1 --format=%H -- instant.schema.ts)"
sha="$(shasum -a 256 "$scribe_repo/instant.schema.ts" | cut -d' ' -f1)"
printf '{\n  "repository": "technoplato/scribe",\n  "path": "instant.schema.ts",\n  "commit": "%s",\n  "sha256": "%s"\n}\n' "$commit" "$sha" > "$here/core/src/scribeSchema.source.json"
(cd "$here/../.." && npx prettier --write "$target" > /dev/null)
echo "Synced Scribe schema at ${commit:0:8}"
