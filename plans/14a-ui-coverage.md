# Plan 14a | What "complete" means: Zag, Radix and `@foldkit/ui` against the blocks

Status: Proposed. Belongs to plan 14. The owner: "look at radix UI look at
you know some of these popular UI things and let's make our library complete
and at the core". He also scoped v1 to "what we need in order to build what
we already have". This page is the map past v1.

Read from the vendored package lists on 2026-11-20: 51 machines under
`repos/zag/packages/machines`, the packages under
`repos/radix-primitives/packages/react`, and the 25 namespaces
`packages/ui/src/index.ts` exports. Only Zag's `menu`, `tabs` and `dialog`
and the Radix blocks named in plan 14 were opened and read; the rest are
placed by what their names and ARIA patterns require, and each is re-read
when its turn comes.

"When" is `v1` (a slice in plan 14 builds it), `next` (the first slices
past v1: the part declaration, its painter nodes, and for tabs and menu the
two blocks marked below), `later`
(needs a block not in v1), or `never` (the platform or the screen tree
already does it).

## Blocks

| Block                                                | In v1                   | First user                         |
| ---------------------------------------------------- | ----------------------- | ---------------------------------- |
| `transcriptFollow`                                   | yes                     | Books' player, the Words reader    |
| `longPress`                                          | yes                     | Books' row and word menus          |
| `placement`                                          | yes                     | Books' menus on the web            |
| `layers` (a pure reading, no state)                  | yes                     | Books' menus, sheets and dialogs   |
| `focusScope`                                         | yes                     | Books' dialogs                     |
| `liveClock`                                          | yes                     | Books' player, the Words reader    |
| `dragHold`                                           | yes                     | Books' seek bar                    |
| `listFilter`                                         | yes                     | Books' chapters and bookmarks      |
| `timedHint`                                          | yes                     | Counter's key hints, copy feedback |
| `fieldDraft`                                         | stays in painters in v1 | Books' search and notes            |
| `rovingFocus`                                        | no, first slice past v1 | tabs, menu, toolbar, radio group   |
| `typeahead`                                          | no, first slice past v1 | menu, listbox, select, combobox    |
| `presence`                                           | no                      | anything with an exit animation    |
| `selection` (one, many, a range)                     | no                      | listbox, select, tree, table       |
| `pointerDrag` (pointer capture, axis, snap)          | no                      | slider, splitter, color area       |
| `hoverIntent` (open and close delays, safe triangle) | no                      | tooltip, hover card, submenu       |
| `dateGrid`                                           | no                      | calendar, date picker              |

## Widgets

| Family                                                                                | Zag                                                               | Radix                                                                         | `@foldkit/ui`                | Blocks                                                         | When                                                      |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| Dialog, alert dialog, drawer                                                          | dialog, drawer                                                    | dialog, alert-dialog                                                          | dialog                       | `layers`, `focusScope`                                         | the blocks in v1 (slices 5, 7); the part next             |
| Menu, context menu, menubar                                                           | menu                                                              | menu, dropdown-menu, context-menu, menubar                                    | menu                         | `layers`, `placement`, `longPress`, `rovingFocus`, `typeahead` | next for menu; menubar and submenus later (`hoverIntent`) |
| Tabs                                                                                  | tabs                                                              | tabs                                                                          | tabs                         | `rovingFocus`                                                  | next                                                      |
| Popover                                                                               | popover                                                           | popover                                                                       | popover                      | `layers`, `placement`, `focusScope`                            | next                                                      |
| Toast                                                                                 | toast                                                             | toast                                                                         | toast                        | `timedHint`, `presence`                                        | next                                                      |
| Disclosure, accordion, collapsible                                                    | accordion, collapsible                                            | accordion, collapsible                                                        | disclosure                   | `rovingFocus`, `presence`                                      | next                                                      |
| Toggles                                                                               | checkbox, switch, radio-group, toggle, toggle-group, rating-group | checkbox, switch, radio-group, toggle, toggle-group                           | checkbox, switch, radioGroup | `rovingFocus` for the groups                                   | next                                                      |
| Text fields                                                                           | editable, number-input, pin-input, password-input, tags-input     | form, label, one-time-password-field, password-toggle-field                   | input, textarea, fieldset    | `fieldDraft`                                                   | later (the draft moves to the Model first)                |
| Listbox, select, combobox                                                             | listbox, select, combobox, cascade-select                         | select                                                                        | listbox, select, combobox    | `layers`, `placement`, `typeahead`, `selection`, `listFilter`  | later                                                     |
| Tooltip, hover card                                                                   | tooltip, hover-card                                               | tooltip, hover-card                                                           | tooltip                      | `hoverIntent`, `placement`, `timedHint`                        | later                                                     |
| Slider, splitter, scroll area                                                         | slider, angle-slider, splitter, scroll-area                       | slider, scroll-area                                                           | slider                       | `pointerDrag`, `dragHold`                                      | later                                                     |
| Calendar, date picker                                                                 | date-picker, date-input                                           | none                                                                          | calendar, datePicker         | `dateGrid`, `rovingFocus`, `layers`                            | later                                                     |
| Tree, table, pagination                                                               | tree-view, pagination, toc, async-list                            | none                                                                          | virtualList                  | `selection`, `rovingFocus`                                     | later                                                     |
| Drag and drop, file drop                                                              | file-upload                                                       | none                                                                          | dragAndDrop, fileDrop        | `pointerDrag`                                                  | later                                                     |
| Navigation menu, tour, steps                                                          | navigation-menu, tour, steps                                      | navigation-menu, toolbar                                                      | nav                          | `rovingFocus`, `hoverIntent`                                   | later                                                     |
| Carousel, marquee, image cropper, signature pad, color picker, floating panel         | each by name                                                      | none                                                                          | none                         | `pointerDrag` and their own                                    | later, on request                                         |
| Progress, avatar, separator, aspect ratio, visually hidden, QR code, timer, clipboard | progress, avatar, qr-code, timer, clipboard                       | progress, avatar, separator, aspect-ratio, visually-hidden, accessible-icon   | button, animation            | none: the screen tree's atoms or a Command                     | never as parts                                            |
| Portal, slot, direction, id, controllable state, collection, focus guards             | none                                                              | portal, slot, direction, id, use-controllable-state, collection, focus-guards | anchor, group                | none: painter mechanics, or solved by items being data         | never                                                     |
