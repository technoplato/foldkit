# Foldkit Demos Supervisor

One LaunchAgent (`com.knophy.foldkit.demos`) runs every server listed in `services.json` behind Caddy (`~/.config/knophy-router/Caddyfile`): the Foldkit demos and the index page at `https://pisspoursoftware.xyz` (`examples/index`).

## Files

- **Supervisor:** `examples/demos-launchd/foldkit-demos-launchd` (symlinked from `~/.local/bin/foldkit-demos-launchd`)
- **Service manifest:** `examples/demos-launchd/services.json`
- **LaunchAgent plist:** `examples/demos-launchd/com.knophy.foldkit.demos.plist`, a template with `__HOME__` where launchd needs an absolute path. See "Install" below.
- **Logs:** `~/Library/Logs/foldkit/demos-supervisor.{out,err}.log` and `~/Library/Logs/foldkit/<name>.{out,err}.log`
- **Backed-up old plists:** `~/.config/foldkit-demos/disabled-plists/`

## Install

launchd does not expand `~`, so fill in the home folder when you install the plist:

```sh
ln -sf "$PWD/examples/demos-launchd/foldkit-demos-launchd" ~/.local/bin/foldkit-demos-launchd
sed "s|__HOME__|$HOME|g" examples/demos-launchd/com.knophy.foldkit.demos.plist > ~/Library/LaunchAgents/com.knophy.foldkit.demos.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.knophy.foldkit.demos.plist
```

## Add, edit, or remove a demo (without restarting the rest)

1. Edit `examples/demos-launchd/services.json`:
   - **Add** a new object (`name`, `port`, `command`, plus optional `args`, `cwd`, `env`, `outLog`, `errLog`). Write `${HOME}` for the home folder in any path; the supervisor fills it in.
   - **Edit** an existing entry to change its command, args, cwd, or env.
   - **Remove** an entry to stop it.
2. Send `SIGHUP` to reload the manifest:
   ```sh
   launchctl kill SIGHUP gui/$(id -u)/com.knophy.foldkit.demos
   ```
   The supervisor stops removed services, restarts modified services, starts newly added services, and leaves unchanged services running.

A server that exits, or whose command cannot start, is started again after 5 seconds. The wait grows to 15, 30, and then 60 seconds while it keeps failing within a minute of starting.

## Check what the demos serve

After you add, edit, or remove a demo, run the content check. It reads each page and its script through Caddy and loads each page in a headless browser. See `examples/index/README.md`.

```sh
node examples/index/check.mjs
```

## Restart everything

```sh
launchctl kickstart -k gui/$(id -u)/com.knophy.foldkit.demos
```

## Stop or start

```sh
launchctl bootout gui/$(id -u)/com.knophy.foldkit.demos
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.knophy.foldkit.demos.plist
```

## Standalone LaunchAgents kept separate

These are not managed by `com.knophy.foldkit.demos`:
`books`, `books-updates`, `issues`, `reminders`, `stt-dashboard`, `words`.
