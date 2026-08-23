# Puzzle | Replicate

Puzzle can tell you how to download and run Puzzle.

Public page: https://puzzle.knophy.com
Self-replicate script: https://puzzle.knophy.com/replicate.sh

Use the script:

```
curl -fsSL https://puzzle.knophy.com/replicate.sh | sh
```

The script opens the page, refreshes itself from /replicate.sh, then clones Foldkit and previews Puzzle on 127.0.0.1:5209.

Caddy:

```
http://puzzle.knophy.com { import loopback_proxy 5209 }
```

Bind 127.0.0.1, never 0.0.0.0. Durable LaunchAgent KeepAlive. Cloudflare Access already gates \*.knophy.com; do not add a second auth.

In Puzzle, the `#replicate` step is a ReplicateStep ADT. It points at the page and the script. It is not a markdown blob.
