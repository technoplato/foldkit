---
'foldkit': patch
---

Fix DevTools clicks triggering app focus/blur Messages. Clicking inside the DevTools panel previously caused the app's currently-focused element to blur, which would dispatch any blur-driven Messages the app had wired up (e.g. inputs that re-focus themselves on blur). In a typing-game-style app this made the message list unselectable: every click on a row immediately triggered a new blur Message, which was appended to history and auto-selected.

The fix is two-part. First, a capture-phase `pointerdown` listener on the DevTools shadow host calls `preventDefault()` whenever focus lives outside the shadow, suppressing the implicit "click-shifts-focus-to-the-clicked-element" browser default for the common case (clicking message rows, buttons, etc.). Second, the `OnBlur` event handler in `html` filters out blur events whose `relatedTarget` is the DevTools shadow host, which closes the remaining leak when DevTools widgets (e.g. the submodel-filter Listbox) move focus into the panel programmatically via `Dom.focus` Commands. With both in place, DevTools interactions never dispatch app Messages.
