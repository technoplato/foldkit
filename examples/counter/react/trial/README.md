# React Router trial | Counter

A gradual-adoption demo: the Counter Program owns `/counter/*` through
`FoldkitRouter`, and the app owns `/about` beside it with a plain React Router
`<Route>`. Back from `/about` returns to the Program's current screen without a
reload. This is the outward direction of adoption; the inward direction
(mounting a Program under an existing app's prefix) is designed in
`plans/04-navigation.md`, which also promotes this folder to a proper
`examples/counter/react-router` package.

Run it from the repository root:

```sh
pnpm --filter counter-react-example exec vite --config trial/vite.config.ts
```

It joins the shared Instant log like every other Counter host.
