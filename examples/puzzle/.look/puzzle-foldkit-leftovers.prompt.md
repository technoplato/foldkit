Two leftovers on the one-label puzzle host. Do not close GitHub issue 240. Do not buy ACM. Do not message Michael or other agents.

Repo: /Users/laptop/Development/foldkit
Work under examples/puzzle (and shared Instant/Runtime only if the Instant hang is there).
Caddyfile is /Users/laptop/.config/knophy-host/Caddyfile
LaunchAgent: com.knophy.foldkit.puzzle-demo -> /Users/laptop/.local/bin/foldkit-puzzle-demo-launchd (vite preview 127.0.0.1:5209)

LOCKED host: puzzle-foldkit.knophy.com (APP-surface). Do not treat foldkit-puzzle.knophy.com as the leftover.

1. Vite 403 allowedHosts (Manager: 403 not 404)

- Add puzzle-foldkit.knophy.com to examples/puzzle/foldkit/vite.config.ts preview.allowedHosts. Keep every existing host. Also add the other APP-surface puzzle names if missing: puzzle-react, puzzle-svelte, puzzle-expo, puzzle-cli, puzzle-tui, puzzle-opentui, puzzle-headless (all .knophy.com).
- Caddy already has http://puzzle-foldkit.knophy.com import loopback_proxy 5209. Confirm; do not rewrite the rest of Caddy. If the block is missing, add only that one host to the same port as puzzle (5209).
- DNS already likely exists. Do not buy ACM. Do not change Cloudflare Access. Do not gate puzzle. Do not make songbook/gate/settings public.
- Bounce LaunchAgent so preview reloads:
  launchctl kickstart -k gui/$(id -u)/com.knophy.foldkit.puzzle-demo
  Wait until 127.0.0.1:5209 accepts connections. The launchd script rebuilds core+foldkit before preview; wait through the build (can take 1-2 min). Do not kickstart in a loop.

2. Instant start hang / False paint

- http://127.0.0.1:5209/ still paints only Starting Instant Puzzle and never settles. That is False paint.
- Fix so the shared puzzle screen paints (visible UI beyond Starting Instant Puzzle).
- Save screenshot at examples/puzzle/.look/puzzle-painted.png (exact path).
- CODE: examples/puzzle/foldkit/src/instantHost.ts startInstantPuzzle() paints Starting until SyncedPuzzle is Ready, then attachProduct.
- startLivePuzzle + BrowserLive(Processor.Host.Foldkit()) opens Instant via InstantPuzzle / @instantdb/core.
- examples/puzzle/core/src/startSynced.ts startSyncedPuzzleHandle() keeps cachedModel = Starting until Runtime.start resolves.
- packages/foldkit/src/runtime/start.ts Runtime.start waits for Instant snapshot (queryOnce then first subscribeQuery). If those never resolve/error, Starting lasts forever.
- Instant app id FoldkitPuzzleV01 = 63750881-805d-46d9-89d4-c7ad0b1bb713. Do not change it.
- Localhost :5209 HAS crypto.randomUUID. Custom-host HTTP does not — do not fix insecure-context crypto.
- If Instant I/O is wedged, fail closed to a painted puzzle screen or Failed with a real error — never leave Starting forever. Prefer Instant Ready. Memory fallback (PUZZLE_TAPE=memory / MemoryLive) is OK if Instant cannot return a snapshot, as long as the shared screen Ready-paints.
- Rebuild/bounce preview after TS changes (one kickstart). Wait for 5209.

VERIFY (required, print exact numbers):

- Host-header: curl -sS -D- -o /tmp/pfk.html -H Host: puzzle-foldkit.knophy.com http://127.0.0.1:8780/ → 200 app HTML (title Foldkit Puzzle / puzzle), NOT 403 Vite allowedHosts, NOT unknown knophy host.
- Public: curl -sS -o /dev/null -w %{http_code} --max-time 20 https://puzzle-foldkit.knophy.com → 200 (puzzle is public carve-out).
- songbook stays 302: curl -sS -o /dev/null -w %{http_code} --max-time 20 https://songbook.knophy.com → 302 Access.
- Look-at-page: headless Chrome dump-dom http://127.0.0.1:5209/ after >=10s must NOT be only Starting Instant Puzzle. Screenshot examples/puzzle/.look/puzzle-painted.png must show the shared puzzle screen.

Chrome:
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --disable-gpu --dump-dom --virtual-time-budget=12000 http://127.0.0.1:5209/
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --disable-gpu --window-size=1280,800 --screenshot=/Users/laptop/Development/foldkit/examples/puzzle/.look/puzzle-painted.png --virtual-time-budget=12000 http://127.0.0.1:5209/

FORBIDDEN:

- Do not close GitHub issue 240 (or any issue).
- Do not buy ACM / Cloudflare certificate.
- Do not change Cloudflare Access.
- Do not gate puzzle. Do not put Access on puzzle names.
- Do not make songbook/gate/settings public.
- Do not break songbook (do not edit examples/songbook except vite allowedHosts if you already must; prefer not).
- Do not commit. Do not push. Do not open a PR.
- Do not message Michael or other agents.

When done, print exactly:

1. Host-header status (code + first title/body hint)
2. public https://puzzle-foldkit.knophy.com status
3. songbook public status
4. paint evidence: dump-dom #root snippet after >=10s + whether puzzle-painted.png shows the puzzle screen
5. leftover one sentence
6. files changed
