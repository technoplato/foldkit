# Foldkit Core UI — All 54 Parts Playground

A single-page, zero-Storybook-sidebar Foldkit application showcasing all 54 core UI Parts (`packages/foldkit/src/behavior/`), `BoundField` (`ModelPath` + Effect Schema), live `Pace.Queue` synchronization (`Pace.Synced`, `Pace.Settled`, `Pace.Sampled`, `Pace.Device`), and zero-React JSX-to-`UiNode` static CLI painting (`foldkit/jsx-runtime` + `paintCli`).

## Commands

```bash
# Run locally with Vite HMR
pnpm --filter @foldkit/playground dev

# Run the zero-React JSX screen in your terminal with ANSI colors
pnpm --filter @foldkit/playground cli

# Typecheck & run vitest suite (verifies all 54 Parts, BoundField, Pace, CLI JSX)
pnpm --filter @foldkit/playground typecheck
pnpm --filter @foldkit/playground test

# Build & deploy static bundle to /Users/blackflag/Development/sites/foldkit-playground
./examples/playground/deploy.sh
```

## Live URL

- `https://foldkit.pisspoursoftware.xyz/playground` (and `https://foldkit.pisspoursoftware.xyz/`)
