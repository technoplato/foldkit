---
'foldkit': minor
'@foldkit/react': patch
---

Add generic Clients for any Program with an interaction. `foldkit/cli` gains `programCliSurface`, `runProgramCommand`, `paintProgram`, and `parseProgramArgv`, so a CLI derives its commands, usage, and exit codes from the Catalog, and `runProgramTui` runs a live terminal UI over Effect `Terminal`. `Interaction.Gesture` and `applyGesture` let a Message-based painter such as a Foldkit HTML view report presses and menu choices without naming the Program's Messages, `Interaction.listenToDocumentKeys` routes document keys through the interaction, and `paintMenuHtml` paints the presented action menu.

The action menu ranks prefix matches above word and description matches and highlights the best one. `Runtime.startHandle` waits for in-flight writes before it stops. `Runtime.start` keeps its original error type when no `policy` is passed, since the default Mirror policy cannot fail with `MissingProgramSynchronization`. Screen `Text` nodes take an optional `label` that native painters announce instead of the bare content, such as `count 3` for `3`. `ActionMenuDialog` in `@foldkit/react/interaction` shows a visible `Actions` title, and `useKeyBindings` shares `Interaction.listenToDocumentKeys` with every other web Client.
