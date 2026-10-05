---
'foldkit': minor
'@foldkit/react': patch
'@foldkit/svelte': patch
---

`Environment.maybePage()` and `Environment.isPage()` tell a real browser page from everything else: Node, a server render, React Native, and a terminal. A page is a `window` that takes event listeners together with a `document`, outside React Native. A bare `typeof window` check took a terminal for a browser, because @foldkit/instant's Node client defines an empty `window` so @instantdb/core runs there; that silenced terminal telemetry. Foldkit's telemetry and renderer, React's navigation, key bindings, and router, and Svelte's links and dock now use it.
