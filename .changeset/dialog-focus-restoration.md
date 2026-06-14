---
'foldkit': patch
---

Dialog now returns focus when it closes. Opening a dialog records the element
that had focus, and closing it restores focus there, so dismissing a dialog
returns to its trigger and closing a stacked dialog returns to the one beneath
it. The component opens with `show()` rather than `showModal()`, so it does this
restoration itself rather than relying on the browser.
