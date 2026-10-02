---
'@foldkit/react-native': minor
---

Add `@foldkit/react-native/expo-router`. `FoldkitRouterStack` is the root layout of an Expo Router app whose screens a Foldkit Program declares: it keeps Expo Router's Stack on the Program's plan with one keyed route per entry through `app/[...path].tsx`, launches the URL Expo Router opened with once the Program is Ready, and reports a swipe or the Android back button as `NavigatedBack`. `FoldkitRouterScreen` is the default export of every route file, and `expoRouterStack` is the keyed stack behind it. `EntryView` paints one stack entry for both native stacks. On Expo Router web, the stack keeps its state keys across resets, so a push records browser history and browser Back goes back through the Program.
