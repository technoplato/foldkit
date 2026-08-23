# Settings leftovers

- Nested hosts covered by a parent Bypass (`*.counter.knophy.com`) stay Public until an exact Allow is applied. Restricting one nested host creates an Allow app rather than deleting the parent Bypass.
- `*.knophy.com` also allows owens1427. settings.knophy.com uses its own Allow (Michael only) so Austy cannot open it. Other Restricted-default hosts still fall through to the wildcard, so Austy can open them until an exact Allow exists.
- Expo and paint-only clients do not call Access. The hosted foldkit origin is the write path.
- No Bypass app is created for settings.knophy.com. Public on that host is refused (403).
- Token stays in `/Users/laptop/.config/knophy-host/access.env`. The browser only sees Ready | Missing.
- `listApps` is N+1 (detail GET per app). Apply/refresh takes tens of seconds.
- Client leftover Gate names: `unreadModel`/`readingModel`/`readModel` aliases in core; `react-bindings/src/gate.ts` and `gate.test.tsx` still present next to `settings.ts`.
- Wrapper also lives at `examples/settings/foldkit-settings-demo-launchd` (copy of `~/.local/bin/foldkit-settings-demo-launchd`).
- Chrome look screenshot: `examples/settings/.look/settings.png`.

- Auth tags painted as Ready | MissingToken. Product hides Public/add/remove on settings.knophy.com.
- access.env was absent at start; origin now reports Ready and lists 75 Caddy hosts.
