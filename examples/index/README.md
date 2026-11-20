# Site index

The page at `https://pisspoursoftware.xyz`: every site served on that domain, with its description, ports, aliases, and GitHub link. Nothing in the list is written by hand. `sites.mjs` derives it from the files that route and run the sites:

- the Caddyfile at `~/.config/knophy-router/Caddyfile`
- the separate tunnels in `~/.config/knophy-host/*/cloudflared.yml`
- the demos manifest at `examples/demos-launchd/services.json`
- the LaunchAgents in `~/Library/LaunchAgents`

The server looks at those files every five seconds and rebuilds the list when one changed, so a new route or demo appears on the page a few seconds later. A changed README or git branch appears within a minute.

## Files

- `src/main.ts`: the Foldkit page. It loads `/api/sites.json`.
- `sites.mjs`: derives the site list.
- `server.mjs`: serves `dist/` and `/api/sites.json` on `127.0.0.1:8789`. It rebuilds the list on a worker thread and answers from the newest finished list. Only a request made before the first list is built waits for it.
- `rebuild-worker.mjs`: one rebuild, run on that worker thread.
- `check.mjs`: checks what the sites serve.

The server runs as the `index` entry in `examples/demos-launchd/services.json`.

## Change the page

```sh
pnpm --filter index-foldkit-example typecheck
pnpm --filter index-foldkit-example build
```

The server reads `dist/` on each request, so a build is live as soon as it finishes. After a change to `server.mjs` or `sites.mjs`, stop the server and the supervisor starts it again. The wait is five seconds after one exit and grows to a minute when the server keeps exiting soon after it starts. When a change alters what the list contains, such as a new `kind`, build the page and stop the server together: the page rejects a list it cannot decode.

```sh
kill $(lsof -nP -tiTCP:8789 -sTCP:LISTEN)
```

## Check what the sites serve

```sh
node examples/index/check.mjs
node examples/index/check.mjs --no-browser
```

Run it after you change a route, a demo, or this page. It exits 1 when a check fails. A status code of 200 passes nothing by itself. Every request goes through Caddy on this Mac under the site's own host name, and each check compares content:

- **The index page.** The page and its script are the build in `dist/`, byte for byte. `/api/sites.json` answers within 2 seconds and equals the list `sites.mjs` derives when the check runs. The check waits up to 8 seconds for the server to pick up a routing file that just changed; a README or branch that changed in the last minute can still fail this line. In a headless browser, the page leaves "Loading live site index…" and shows one card per site.
- **Each demo.** The script the page loads is the file in the demo's own `dist/` folder, byte for byte. A script missing from that folder fails, because the page then comes from another build. A different page title fails too, unless the script matched: some demos set their title when they serve the page, and that case is printed as a `note`. A demo with no `dist/` folder is checked only for serving JavaScript. In a headless browser, the page shows text or a picture and throws no uncaught error. The output prints the first words each page shows once its text stops changing, so a page stuck on a loading line is visible there.
- **Each static site.** The page equals `index.html` in the folder Caddy serves, byte for byte.
- **Each other app.** A page with a body passes and its title is printed. A 5xx answer or no answer fails. There is no source to compare these pages with, so this check is weaker than the others.

Lines that start with `note` name what was not checked, such as a service with no page at `/`.

The browser checks load each page under its real `https` name and answer its requests from Caddy on this Mac, so nothing passes through Cloudflare Access. A WebSocket to a `pisspoursoftware.xyz` name does not connect during the check.
