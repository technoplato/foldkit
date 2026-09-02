# Clipboard (view-agnostic)

One Foldkit Program. Four clients.

Inspired by [Pinkisingh13/clipboard_sync](https://github.com/Pinkisingh13/clipboard_sync):
copy on one surface, paste on another, over a WebSocket on port 8080.

Works on the same Wi-Fi and on the existing Tailscale tailnet.
The host binds 0.0.0.0:8080, so any device already signed into the tailnet
can reach it at the host's 100.x address or MagicDNS name. No Funnel.

```
examples/clipboard/
  core/   renderer-free Program (Model, Message, update, screen)
  cli/    node CLI + optional LAN host
  tui/    Effect Terminal client
  expo/   iOS + Android client (expo-clipboard)
```

Core never imports HTML, React Native, or Node clipboard APIs.
Clients paint `ClipboardProgram.screen` and feed Messages.

## Run

From the Foldkit repo root, after `pnpm install`:

```bash
pnpm --filter clipboard-core-example build
pnpm --filter clipboard-cli-example build
pnpm --filter clipboard-tui-example build

# one-shot CLI
pnpm --filter clipboard-cli-example clipboard show
pnpm --filter clipboard-cli-example clipboard capture
pnpm --filter clipboard-cli-example clipboard write -- "hello from foldkit"

# print this machine + tailnet peers (needs tailscale CLI)
pnpm --filter clipboard-cli-example clipboard tailnet

# host: listens on 0.0.0.0:8080 so LAN and tailnet both work
pnpm --filter clipboard-cli-example clipboard host

# from any other signed-in tailnet device
pnpm --filter clipboard-cli-example clipboard connect office.ts.net
pnpm --filter clipboard-cli-example clipboard connect 100.64.0.12

# interactive TUI (same Program)
pnpm --filter clipboard-tui-example clipboard-tui

# Expo — Tailscale app must be connected on the phone
cd examples/clipboard/expo
EXPO_PUBLIC_CLIPBOARD_SYNC_URL=ws://office.ts.net:8080 pnpm ios
EXPO_PUBLIC_CLIPBOARD_SYNC_URL=ws://100.64.0.12:8080 pnpm android
```

Same raw UTF-8 frames as clipboard_sync. Flutter desktop_app can talk to this
host over the tailnet too.

mDNS `_clipboardsync._tcp` is LAN-only. Across networks, use MagicDNS or `100.x`.
