---
'@foldkit/react-native': minor
'@foldkit/svelte': minor
'@foldkit/opentui': minor
---

Add `@foldkit/react-native/interaction`, `@foldkit/svelte/interaction`, and `@foldkit/opentui/interaction`, generic adapters over any bound Program that were previously example code. React Native gets `Screen`, `paintTree` with per-node `PaintStyles`, and `ActionMenuModal`, and re-exports `ProgramProvider`, `useBound`, `useModel`, `useStatus`, `useActions`, `useAction`, and `useMenu` from `@foldkit/react/interaction`, so a React Native host imports one module. Svelte 5 gets `reactive`, `Screen`, `PaintTree`, and `ActionMenuDialog`, shipped as `.svelte` source with declarations. OpenTUI gets `runOpenTui`, `paintOpenTui`, and `paintOpenTuiFrame`.
