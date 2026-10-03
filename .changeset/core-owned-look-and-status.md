---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/react-native': minor
'@foldkit/svelte': minor
'@foldkit/opentui': minor
---

The look of a screen now comes from core. `Interaction.screenLook` holds the sizes and colors every graphical painter maps, and `Interaction.screenStylesheet` is built from it: centered rows and columns, buttons with hover, disabled, and focus states, dim and mono text, phone chrome, the menu opener, and the Program's status line. `Text(content, { emphasis: 'Display' })` marks a screen's headline, such as the count: large on the web and in React Native, bold in a terminal. React Native's painter now maps `dim`, `mono`, and `Display` too, so a host passes no styles.

A bound Program knows the Host it was started on. `Runtime.startHandle({ host })` passes it through, `bound.appLabel` reads `React`, and `bound.windowTitle()` gives `Session | React`, or `Starting Counter… | React` while Starting. React's `useDocumentTitle()` takes no label, Svelte adds `DocumentTitle`, the TUI and OpenTUI title the terminal the same way, and `Interaction.windowTitleOfModel` titles a pure Foldkit HTML view. `NavigationFrame`'s `appLabel` and the TUI and OpenTUI `appLabel` options are removed.

No host writes status text. React and React Native add `WhenReady`, Svelte adds `WhenReady`, and the React Native stacks show the Program's own description until Ready. The menu opener appears only once the Program is Ready, and `Interaction.whenSettled(bound, timeoutMs)` waits for a one-shot Client.

Terminals share one menu, footer, and quit rule. `Interaction.terminalMenuLines(menu, width)` lays the menu out in aligned columns with tones OpenTUI colors, `terminalFooterOf` writes `[?] actions  [q] quit`, and `pressTerminalKey` decides when `q` quits. The CLI shows the Starting description instead of `starting`.

Smaller moves: `Navigation.isPlainClick` and `Navigation.styleTagOf` replace copies in each web painter, `parseProgramArgv` returns a `Tail` request for `tail`, `cliViewFailed` writes a CLI view failure, `Processor.Host.fromLabelOf` reads `react-ad55df2e` as `React ad55df2e`, `Program.modelChangeLines` prints the fields one Message moved from the Model's own Schema, and `paintStatusHtml` paints a status line as Foldkit HTML.
