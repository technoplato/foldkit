---
'@foldkit/react-native': minor
---

Add `@foldkit/react-native/expo-router`. `FoldkitRouterStack` is the root layout of an Expo Router app whose screens a Foldkit Program declares: it keeps Expo Router's Stack on the Program's plan with one keyed route per entry through `app/[...path].tsx`, launches the URL Expo Router opened with once the Program is Ready, and reports a swipe or the Android back button as `NavigatedBack`. `FoldkitRouterScreen` is the default export of every route file, and `expoRouterStack` is the keyed stack behind it. `EntryView` paints one stack entry for both native stacks. On Expo Router web, a move replaces the browser URL instead of pushing it, so browser Back leaves the app; the header back button goes back through the Program.
