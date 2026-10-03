---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/react-native': minor
'@foldkit/svelte': minor
'@foldkit/opentui': minor
---

Every word and link decision a Client shows now comes from the Program. `Interaction.Starting` carries a `description`, `Starting Counter…`, built from the Program's root title. `ProgramInteraction.menuTitle` and `Interaction.menuOpenerOf(interaction, platform)` give the opener `Actions (⌘K)` on a Mac, `Actions (Ctrl+K)` elsewhere, and `Actions` on touch; `keyPlatformOf(navigator)` reads the platform, and the bound interaction adds `menuOpener(platform)`. React adds `useMenuOpener` and `ActionMenuButton`, React Native a floating `ActionMenuButton`, and Svelte an `ActionMenuButton` component.

`Navigation.linkTargetOf` decides once where a link goes, `OpenInProgram`, `ShowHostPage`, or `LoadDocument`, and `Navigation.followLink` carries it out in a browser. A screen's text link in `NavigationFrame`, a React Router `<Link>`, a React Native link, and a Svelte anchor all use it, and `FoldkitRouter` tells the frames inside whether the app has host pages. `Navigation.queryPairsOf` reads a search, so Expo Router prints its URIs with `Navigation.pathAndUri`. `Interaction.frameOfModel(program, model)` gives a pure view the same frame a bound Program shows, and the frame carries the topmost entry's title.

The menu view adds `dismissLabel` (`Close actions`) and each row a `spokenLabel`. `Interaction.hintLineOf` prints the hints for a terminal, and `Interaction.terminalKeyInput` reads a terminal key the same way in the program TUI and OpenTUI, so Shift-J jumps to the last row in both. Screen Buttons carry their Action's `keys`, and `terminalCaptionOf` shows `[+] Increment`; `PaintOpenTuiOptions` drops `keysOf`. `paintFrameHtml` paints a frame as Foldkit HTML, `Interaction.screenStylesheet` styles dim and mono text on every web painter, Svelte adds `NavigationFrame`, and a menu `className` adds to `fk-action-menu` instead of replacing it. `Catalog.titleOf` reads a tag as words.
