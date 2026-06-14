---
'foldkit': minor
---

Add a `closeButton` bundle to the `Ui.Dialog` render info. Spread it onto an in-panel
dismiss control such as a Cancel or close button to close the dialog without
wiring up a parent message. It carries the same `OnClick` close handler as the
backdrop, including the suppression that keeps a click from interrupting a leave
animation.
