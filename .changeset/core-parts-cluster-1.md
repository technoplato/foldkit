---
'foldkit': minor
---

Add Zag/Radix Cluster 1 (Widgets #26 to #31 of 54): six core Parts in `foldkit/behavior` (`Drawer`, `HoverCard`, `Menubar`, `Toolbar`, `ToggleGroup`, `RatingGroup`) composing existing core blocks, proved across HTML, React, and React Native generic hosts with zero widget-specific painter logic.

- `Drawer` (#2665): `Closed | Open | Dragging` Machine and Part composing `Layers`, `FocusScope`, and `PointerDrag`, with edge placement (`Left | Right | Top | Bottom`), fractional snap points, swipe-to-dismiss velocity and threshold rules, modal backdrop, Escape and outside-press dismissal, `Pace.Sampled` drag offset sync, `atRest`, and `Trigger`, `Backdrop`, `Content`, `Title`, `Description`, `CloseButton`, and `Grabber` slots.
- `HoverCard` (#2666): `Closed | Open` Machine and Part composing `Placement` and `HoverIntent` (`isInteractive: true`, safe-triangle corridor, 700 ms open / 300 ms close defaults, focus and Escape dismissal, `placeFor`, `atRest`, and `Trigger` and `Content` slots).
- `Menubar` (#2667): `Idle | Open` Machine and Part composing `Menu` and `RovingFocus` (horizontal top-level menus, Left/Right switching across open menus, hover-switch while open, Escape and outside-press dismissal, roving tabindex, `atRest`, and `Bar`, `Trigger`, `Content`, and `Item` slots).
- `Toolbar` (#2668): `Idle | Focused` Machine and Part composing `RovingFocus` (horizontal and vertical orientation, LTR/RTL, loop, disabled items, roving tabindex, `atRest`, and `Root` and `Item` slots).
- `ToggleGroup` (#2669): `Idle | Focused` Machine and Part composing `RovingFocus` and `Selection` (`Single` and `Multiple` modes, `deselectable`, orientation, disabled and read-only guards, `isPressed` on each item, `atRest`, and `Root` and `Item` slots).
- `RatingGroup` (#2670): `Idle | Hovering` Machine and Part composing `RovingFocus` (`count` default 5, `allowHalf` 0.5 precision, hover preview, pointer and keyboard Arrow/Home/End/0-9 selection, disabled and read-only guards, `atRest`, and `Root`, `Item`, and `Label` slots).
- `foldkit/test` gains `Cluster1Fixture` proving all six Parts across HTML, React, and React Native generic hosts.
