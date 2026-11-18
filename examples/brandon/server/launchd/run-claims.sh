#!/bin/zsh
# The held-money claims worker (Scribe #2134). It moves money Scribe holds for a person to their own wallet when they ask
# on their page, and runs on Michael's Mac, where the held keys are, never on the mini. The code is
# examples/brandon/server/src/claims.ts in foldkit, bundled as claims.mjs. The env file is private: the Instant app, its
# admin token and the owner, as the origin and the watcher read them. launchd keeps it alive.
set -a; . "$HOME/.config/scribe-private/brandon-dot/env"; set +a
node="$HOME/Library/Application Support/fnm/node-versions/v22.14.0/installation/bin/node"
[ -x "$node" ] || node=/opt/homebrew/bin/node
exec "$node" "$HOME/Library/Application Support/Scribe/held-claims/claims.mjs"
