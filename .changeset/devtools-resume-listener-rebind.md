---
'foldkit': patch
---

Fix DevTools resume leaving DOM event handlers bound to a no-op dispatch. After time-traveling and resuming, every event handler on the rebuilt DOM (any `On*` attribute produced by the html factory, plus pointer handlers attached via `Canvas.view` and any other listener built on the runtime's `Dispatch` service) silently dropped Messages until a Subscription emission happened to trigger an internal re-render.

The jumpTo render path intentionally uses `noOpDispatch` so mount Effects fired during inspection don't pollute history. Resume was reusing the same render path, so the rebuilt DOM had every listener bound to the no-op even after the user returned to live state. Resume now flips `isPaused` to false and asks the render loop to tick once with the live dispatch, which rebinds listeners on the next animation frame.
