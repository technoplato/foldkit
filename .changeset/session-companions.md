---
'foldkit': minor
'@foldkit/react': minor
'@foldkit/react-native': minor
'@foldkit/svelte': minor
---

`Session.compose({ of, companions })` lists the other apps that join a session on the Session page, each with the command that starts it and, for a web app, where it opens. A Program declares its companions once, so every painter shows the same list. `Text(content, { copyable: true })` marks text a person copies whole: React and Svelte add a copy button that reads `Copy`, then `Copied`, from `Interaction.copyButtonLabelOf`; Foldkit HTML selects the whole command in one click; React Native makes it selectable. The Counter and Multiple Counters declare their companions from their Program id and root route, and every host package gains a `start` script, so each command reads `pnpm --filter counter-tui-example start`.
