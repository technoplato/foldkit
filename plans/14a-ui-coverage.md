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

| Block                                                | In v1             | First user                                         |
| ---------------------------------------------------- | ----------------- | -------------------------------------------------- |
| `transcriptFollow`                                   | yes               | Books' player, the Words reader                    |
| `longPress`                                          | yes               | Books' row and word menus                          |
| `placement`                                          | yes               | Books' menus on the web                            |
| `layers` (a pure reading, no state)                  | yes (done, #2606) | Books' menus, sheets and dialogs                   |
| `focusScope`                                         | yes (done, #2612) | Books' dialogs                                     |
| `liveClock`                                          | yes               | Books' player, the Words reader                    |
| `dragHold`                                           | yes               | Books' seek bar                                    |
| `listFilter`                                         | yes (done, #2658) | Books' chapters and bookmarks, Combobox            |
| `timedHint`                                          | yes (done, #2625) | Toast, Counter's key hints, copy feedback          |
| `fieldDraft`                                         | done (#2627)      | Books' search and notes, Input, Textarea           |
| `rovingFocus`                                        | done (#2606)      | tabs, menu, toolbar, radio group                   |
| `typeahead`                                          | done (#2606)      | menu, listbox, select, combobox                    |
| `presence`                                           | done (#2617)      | disclosure, toast, anything with an exit animation |
| `selection` (one, many, a range)                     | done (#2633)      | listbox, select, tree, table                       |
| `pointerDrag` (pointer capture, axis, snap)          | done (#2654)      | slider, splitter, color area                       |
| `hoverIntent` (open and close delays, safe triangle) | done (#2630)      | tooltip, hover card, submenu                       |
| `dateGrid`                                           | done (#2655)      | calendar, date picker                              |

## Widgets

| Family                                                                                | Zag                                                               | Radix                                                                         | `@foldkit/ui`                | Blocks                                                                | When                                                      |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| Dialog, alert dialog, drawer                                                          | dialog, drawer                                                    | dialog, alert-dialog                                                          | dialog                       | `layers`, `focusScope`                                                | the blocks in v1 (slices 5, 7); the part next             |
| Menu, context menu, menubar                                                           | menu                                                              | menu, dropdown-menu, context-menu, menubar                                    | menu                         | `layers`, `placement`, `longPress`, `rovingFocus`, `typeahead`        | next for menu; menubar and submenus later (`hoverIntent`) |
| Tabs                                                                                  | tabs                                                              | tabs                                                                          | tabs                         | `rovingFocus`                                                         | next                                                      |
| Popover                                                                               | popover                                                           | popover                                                                       | popover                      | `layers`, `placement`, `focusScope`                                   | next                                                      |
| Toast                                                                                 | toast                                                             | toast                                                                         | toast                        | `timedHint`, `presence`                                               | next                                                      |
| Disclosure, accordion, collapsible                                                    | accordion, collapsible                                            | accordion, collapsible                                                        | disclosure                   | `rovingFocus`, `presence`                                             | next                                                      |
| Toggles                                                                               | checkbox, switch, radio-group, toggle, toggle-group, rating-group | checkbox, switch, radio-group, toggle, toggle-group                           | checkbox, switch, radioGroup | `rovingFocus` for the groups                                          | next                                                      |
| Text fields                                                                           | editable, number-input, pin-input, password-input, tags-input     | form, label, one-time-password-field, password-toggle-field                   | input, textarea, fieldset    | `fieldDraft`                                                          | later (the draft moves to the Model first)                |
| Listbox, select, combobox                                                             | listbox, select, combobox, cascade-select                         | select                                                                        | listbox, select, combobox    | `layers`, `placement`, `typeahead`, **`selection`**, **`listFilter`** | later                                                     |
| Tooltip, hover card                                                                   | tooltip, hover-card                                               | tooltip, hover-card                                                           | tooltip                      | `hoverIntent`, `placement`, `timedHint`                               | later                                                     |
| Slider, splitter, scroll area                                                         | slider, angle-slider, splitter, scroll-area                       | slider, scroll-area                                                           | slider                       | **`pointerDrag`**, `dragHold`                                         | later                                                     |
| Calendar, date picker                                                                 | date-picker, date-input                                           | none                                                                          | calendar, datePicker         | \***\*`dateGrid`\*\***, `rovingFocus`, `layers`                       | later                                                     |
| Tree, table, pagination                                                               | tree-view, pagination, toc, async-list                            | none                                                                          | virtualList                  | **`selection`**, `rovingFocus`                                        | later                                                     |
| Drag and drop, file drop                                                              | file-upload                                                       | none                                                                          | dragAndDrop, fileDrop        | \***\*`pointerDrag`\*\***                                             | later                                                     |
| Navigation menu, tour, steps                                                          | navigation-menu, tour, steps                                      | navigation-menu, toolbar                                                      | nav                          | `rovingFocus`, `hoverIntent`                                          | later                                                     |
| Carousel, marquee, image cropper, signature pad, color picker, floating panel         | each by name                                                      | none                                                                          | none                         | \***\*`pointerDrag`\*\*** and their own                               | later, on request                                         |
| Progress, avatar, separator, aspect ratio, visually hidden, QR code, timer, clipboard | progress, avatar, qr-code, timer, clipboard                       | progress, avatar, separator, aspect-ratio, visually-hidden, accessible-icon   | button, animation            | none: the screen tree's atoms or a Command                            | never as parts                                            |
| Portal, slot, direction, id, controllable state, collection, focus guards             | none                                                              | portal, slot, direction, id, use-controllable-state, collection, focus-guards | anchor, group                | none: painter mechanics, or solved by items being data                | never                                                     |

## The order every widget moves in

Written 2026-11-20 for Scribe #2595, after the owner's "Yes, do all of them"
and "also the set of components as well" of Zag. One row is one part to
build in Foldkit core. A row names every source it covers: the
`packages/ui` namespace that becomes the HTML painter's view of the part
and keeps its API, Zag's machines (51, counted in
`repos/zag/packages/machines`) and Radix's packages (59, counted in
`repos/radix-primitives/packages/react`). Each is re-read when its turn
comes, with upstream Foldkit's own (`repos/foldkit-upstream/packages/ui/src`,
which has `typeahead.ts`, `keyboard.ts`, `hoverIntent`, `meter` and
`progress` that this fork lacks).

The order: the 25 `packages/ui` namespaces first, since they exist and
must keep working; then what only Zag or Radix has. Within the 25, what
Books already draws comes first (a menu, a dialog, tabs), then the widgets
in the order their blocks are built, so a block is built once and the rows
after it reuse it: `layers` and `placement` (1 to 4), then `rovingFocus`
(5 to 8), and so on. A row that needs no block is placed where it is
cheap to do beside its neighbours, not first. Each row
gets its own child issue under #2568 when it starts.

Blocks that exist: `longPress`, `placement`, `layers`, `rovingFocus`, `typeahead`, `focusScope`, `presence`, `timedHint`, `hoverIntent`, `fieldDraft`, `selection`, `pointerDrag`, `dateGrid`, `listFilter`, the pace
rules for typing and dragging (`Pace`), and the reader's two (`Reader`,
`TranscriptFollow`). Every other block named below
is still to build, and is built with the first row that needs it.

| #   | Part                                | `packages/ui` | Zag                      | Radix                             | Blocks it needs (bold exist)                                                                        |
| --- | ----------------------------------- | ------------- | ------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | ~~Menu~~ (done, #2606)              | `Menu`        | menu                     | menu, dropdown-menu, context-menu | **`longPress`**, **`placement`**, **`layers`**, **`rovingFocus`**, **`typeahead`**                  |
| 2   | ~~Dialog~~ (done, #2612)            | `Dialog`      | dialog                   | dialog, alert-dialog              | **`layers`**, **`focusScope`**                                                                      |
| 3   | ~~Tabs~~ (done, #2613)              | `Tabs`        | tabs                     | tabs                              | **`rovingFocus`**                                                                                   |
| 4   | ~~Popover~~ (done, #2616)           | `Popover`     | popover                  | popover                           | **`placement`**, **`layers`**, **`focusScope`**                                                     |
| 5   | ~~Disclosure~~ (done, #2617)        | `Disclosure`  | collapsible, accordion   | collapsible, accordion            | **`rovingFocus`**, **`presence`**                                                                   |
| 6   | ~~Switch~~ (done, #2618)            | `Switch`      | switch                   | switch                            | none                                                                                                |
| 7   | ~~Checkbox~~ (done, #2619)          | `Checkbox`    | checkbox                 | checkbox                          | none                                                                                                |
| 8   | ~~Radio group~~ (done, #2620)       | `RadioGroup`  | radio-group              | radio-group                       | **`rovingFocus`**                                                                                   |
| 9   | ~~Button and toggle~~ (done, #2623) | `Button`      | toggle                   | toggle                            | none                                                                                                |
| 10  | ~~Toast~~ (done, #2625)             | `Toast`       | toast                    | toast                             | **`timedHint`**, **`presence`**                                                                     |
| 11  | ~~Tooltip~~ (done, #2630)           | `Tooltip`     | tooltip                  | tooltip                           | **`placement`**, **`hoverIntent`**, **`timedHint`**                                                 |
| 12  | ~~Input~~ (done, #2627)             | `Input`       | editable, password-input | label, password-toggle-field      | **`fieldDraft`** (**`Pace`**)                                                                       |
| 13  | ~~Textarea~~ (done, #2631)          | `Textarea`    | none                     | none                              | **`fieldDraft`** (**`Pace`**)                                                                       |
| 14  | ~~Fieldset~~ (done, #2632)          | `Fieldset`    | none                     | form                              | none                                                                                                |
| 15  | ~~Listbox~~ (done, #2633)           | `Listbox`     | listbox                  | none                              | **`rovingFocus`**, **`typeahead`**, **`selection`**                                                 |
| 16  | ~~Select~~ (done, #2653)            | `Select`      | select                   | select                            | **`placement`**, **`layers`**, **`typeahead`**, **`selection`**                                     |
| 17  | ~~Combobox~~ (done, #2658)          | `Combobox`    | combobox                 | none                              | **`placement`**, **`layers`**, **`typeahead`**, **`selection`**, **`listFilter`**, **`fieldDraft`** |
| 18  | ~~Slider~~ (done, #2654)            | `Slider`      | slider                   | slider                            | **`pointerDrag`** (**`Pace`**)                                                                      |
| 19  | ~~Calendar~~ (done, #2655)          | `Calendar`    | none                     | none                              | \***\*`dateGrid`\*\***, **`rovingFocus`**                                                           |
| 20  | Date picker                         | `DatePicker`  | date-picker, date-input  | none                              | **`placement`**, \***\*`dateGrid`\*\***, **`layers`**                                               |
| 21  | Navigation menu                     | `Nav`         | navigation-menu          | navigation-menu                   | **`rovingFocus`**, **`hoverIntent`**                                                                |
| 22  | Drag and drop                       | `DragAndDrop` | none                     | none                              | \***\*`pointerDrag`\*\*** (**`Pace`**)                                                              |
| 23  | File drop                           | `FileDrop`    | file-upload              | none                              | \***\*`pointerDrag`\*\***                                                                           |
| 24  | Virtual list                        | `VirtualList` | async-list               | none                              | a window over a list, new                                                                           |
| 25  | Presence                            | `Animation`   | presence                 | presence                          | **`presence`**                                                                                      |
| 26  | Drawer                              | none          | drawer                   | none                              | **`layers`**, **`focusScope`**, \***\*`pointerDrag`\*\***                                           |
| 27  | Hover card                          | none          | hover-card               | hover-card                        | **`placement`**, **`hoverIntent`**                                                                  |
| 28  | Menubar                             | none          | none                     | menubar                           | **the Menu part**, **`rovingFocus`**                                                                |
| 29  | Toolbar                             | none          | none                     | toolbar                           | **`rovingFocus`**                                                                                   |
| 30  | Toggle group                        | none          | toggle-group             | toggle-group                      | **`rovingFocus`**, **`selection`**                                                                  |
| 31  | Rating group                        | none          | rating-group             | none                              | **`rovingFocus`**                                                                                   |
| 32  | Number input                        | none          | number-input             | none                              | **`fieldDraft`**, \***\*`pointerDrag`\*\***                                                         |
| 33  | Pin input                           | none          | pin-input                | one-time-password-field           | **`fieldDraft`**, **`rovingFocus`**                                                                 |
| 34  | Tags input                          | none          | tags-input               | none                              | **`fieldDraft`**, **`rovingFocus`**                                                                 |
| 35  | Cascade select                      | none          | cascade-select           | none                              | the Select part, **`selection`**                                                                    |
| 36  | Tree view                           | none          | tree-view                | none                              | **`selection`**, **`rovingFocus`**, **`typeahead`**                                                 |
| 37  | Pagination                          | none          | pagination               | none                              | none                                                                                                |
| 38  | Steps                               | none          | steps                    | none                              | none                                                                                                |
| 39  | Table of contents                   | none          | toc                      | none                              | current row in view                                                                                 |
| 40  | Scroll area                         | none          | scroll-area              | scroll-area                       | \***\*`pointerDrag`\*\***                                                                           |
| 41  | Splitter                            | none          | splitter                 | none                              | \***\*`pointerDrag`\*\***                                                                           |
| 42  | Angle slider                        | none          | angle-slider             | none                              | \***\*`pointerDrag`\*\***                                                                           |
| 43  | Color picker                        | none          | color-picker             | none                              | **`placement`**, \***\*`pointerDrag`\*\***, **`layers`**                                            |
| 44  | Carousel                            | none          | carousel                 | none                              | \***\*`pointerDrag`\*\***, a timer                                                                  |
| 45  | Floating panel                      | none          | floating-panel           | none                              | \***\*`pointerDrag`\*\***                                                                           |
| 46  | Image cropper                       | none          | image-cropper            | none                              | \***\*`pointerDrag`\*\***                                                                           |
| 47  | Signature pad                       | none          | signature-pad            | none                              | \***\*`pointerDrag`\*\***, sampled (**`Pace`**)                                                     |
| 48  | Tour                                | none          | tour                     | none                              | **`placement`**, **`layers`**                                                                       |
| 49  | Marquee                             | none          | marquee                  | none                              | a timer                                                                                             |
| 50  | Timer                               | none          | timer                    | none                              | a clock                                                                                             |
| 51  | Progress and meter                  | none          | progress                 | progress                          | none                                                                                                |
| 52  | Avatar                              | none          | avatar                   | avatar                            | none: a loading state                                                                               |
| 53  | Clipboard                           | none          | clipboard                | none                              | **`timedHint`**                                                                                     |
| 54  | QR code                             | none          | qr-code                  | none                              | none                                                                                                |

**Widgets left: 35 of 54.** Of those, 6 are `packages/ui`'s remaining namespaces
(rows 20 to 25), and 29 are Zag's or Radix's alone. #2595 built the declaration,
the hosts and `longPress` + `placement`; #2606 built row 1 (`Menu`) with
`layers`, `rovingFocus`, and `typeahead`; #2612 built row 2 (`Dialog`) with
`focusScope`; #2613 built row 3 (`Tabs`) reusing `rovingFocus`; #2616 built
row 4 (`Popover`) reusing `placement`, `layers`, and `focusScope`; #2617 built
row 5 (`Disclosure`) with `presence` reusing `rovingFocus`; #2618 built row 6
(`Switch`); #2619 built row 7 (`Checkbox`); #2620 built row 8 (`RadioGroup`)
reusing `rovingFocus`; #2623 built row 9 (`Toggle` / `Button`); #2625 built row
10 (`Toast`) with `timedHint` reusing `presence`; #2630 built row 11 (`Tooltip`)
with `hoverIntent` reusing `placement` and `timedHint`; #2627 built row 12
(`Input`) with `fieldDraft`; #2631 built row 13 (`Textarea`) reusing `fieldDraft`; #2632 built row 14 (`Fieldset`); #2633 built row 15 (`Listbox`) with `selection` reusing `rovingFocus` and `typeahead`; #2653 built row 16 (`Select`) reusing `placement`, `layers`, `typeahead`, `rovingFocus`, and `selection`; #2655 built row 19 (`Calendar`) with `dateGrid` reusing `rovingFocus`; #2654 built row 18 (`Slider`) with `pointerDrag`; #2658 built row 17 (`Combobox`) with `listFilter` reusing `placement`, `layers`, `selection`, `rovingFocus`, `typeahead`, and `fieldDraft`.

What the count covers, so it can be checked: all 51 of Zag's machines are
in a row (three rows hold two each: Disclosure, Input and Date picker).
Of Radix's 59 packages, 30 are in a row. The other 29 are not parts, and
each has a place:

- **Four are atoms of the screen tree** and hold no behavior: aspect-ratio,
  separator, accessible-icon, visually-hidden.
- **Four are blocks**, built with the first row that needs them:
  dismissable-layer (`layers`), focus-scope and focus-guards
  (`focusScope`), roving-focus (`rovingFocus`).
- **Twenty-one are a painter's mechanics or are solved by items being
  data**: announce, arrow, collection, compose-refs, context, direction,
  id, popper (its geometry is `placement`), portal, primitive, radix-ui,
  slot, and the nine `use-*` hooks.
