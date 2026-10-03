---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/react-native': patch
'@foldkit/svelte': minor
'@foldkit/opentui': minor
---

The CLI and the program TUI paint to 80 columns: each Action's word, keys, and description sit in aligned columns, a long description wraps under itself, and why an Action is unavailable sits beneath it. Given the Program's CLI name, `paintProgram(bound, name)` adds a runnable example under each Action, `$ counter increment`, and `programUsage` lists the controls every Program has with examples built from the Program. `foldkit/cli` adds `runProgramTail(engine, decoder, write)`, which prints every Message as it lands from every device, one aligned line each, and `columnRow`, `underColumn`, and `wrapWords` for 80-column layout.

`Session.compose` adds a `Session settings` button under the child's screen, and its Actions gain keys: `s` opens the settings, `m` mirrors navigation, and `l` keeps it local. `Navigation.coalescedStack` lands a burst of keyed-stack resets as one, and React Navigation and Expo Router use it, so choosing `Open session settings` from the menu resets the native stack once instead of dismissing the menu and pushing the page in separate frames. `Navigation.documentTitleOf` and `Processor.Host.labelOf` name a window by its screen and app, `Session | React`: React adds `useDocumentTitle`, Svelte's `NavigationFrame` takes `appLabel`, and the program TUI and OpenTUI set the terminal title. `Processor.Host.hostOfFrom` reads a Host back from a `from`. OpenTUI paints a Button's label, as every other painter does, and `terminalCaptionOf` is removed.
