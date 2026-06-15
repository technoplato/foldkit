---
'@foldkit/ui': patch
---

Escape element ids before using them as CSS selectors. Components that focus or
observe their own elements (Listbox, Combobox, Menu, Popover, Dialog, DatePicker,
Calendar, RadioGroup, Tabs, Disclosure, and animated overlays) built selectors as
`#${id}`, which threw a `querySelector` SyntaxError when the id was not a valid CSS
identifier on its own. Ids beginning with a digit, such as UUID-prefixed ids, now
work.
