---
name: design-tuis
description: Design, implement, or audit keyboard-first terminal user interfaces, including OpenTUI and text-terminal Clients. Use for TUI layout, focus, navigation, shortcuts, entity actions, interaction modeling, or terminal usability reviews.
---

# Design TUIs

Make the entity the interaction surface. Put what a user can do beside the row,
field, panel, or confirmation it affects.

## Design from the screen

1. Inspect the real Model, destinations, and currently valid interactions.
2. Render the current and proposed screens at a realistic terminal size before
   coding. Use an ASCII mockup for a proposal and a real capture for existing UI.
3. Walk the primary keyboard journeys against that rendering.
4. Implement, then run the real TUI and press the documented keys.

For example:

```text
Counters
> groceries   4   [+] increment  [-] decrement  [Enter] details  [d] delete
  laundry     2   [+] increment  [-] decrement  [Enter] details  [d] delete
```

Prefer inline actions, an adjacent action column, or controls immediately below
the selected entity. Reserve a global command palette for genuinely global or
rare commands, not ordinary row actions.

## Keep interaction natural

- Make focus visible and let traversal follow the visual layout.
- Support arrows and `j`/`k` for movement when appropriate. Use `Enter` to open
  or activate, `Escape` to go back, and `q` to quit when not editing text.
- Allow direct contextual keys such as `+`, `-`, `d`, or `x` on the focused
  entity. Show only shortcuts that work in the current context.
- Put confirmation choices beside the confirmation. Preserve focus when an
  operation completes or the collection changes.
- Give text input an explicit editing context so typing cannot trigger screen
  shortcuts.
- Avoid arbitrary global focus keys such as F1 through F5 when ordinary spatial
  traversal expresses the screen better.

## Preserve the architecture boundary

Let the Program own semantic interaction IDs, availability, destinations, and
the canonical Messages produced by interactions. Let the TUI Client own focus,
selection, editing mode, and raw-key translation. Never journal or synchronize
raw keys such as `PressedJ`.

Map pointer, keyboard, touch, accessibility, automation, and agent activations
to the same semantic Message. Preserve how and by whom an interaction was
invoked through typed occurrence provenance when that runtime surface is
available, not as another Program Message or a different Message variant for
each Client. Do not imply that current provenance can distinguish or attest an
origin it does not yet model.

Derive valid interactions from the current Model, then group them by the entity
or region they target. Do not replace a typed interaction projection with a
duplicated key-to-Message switch.

## Audit the result

Check that every visible entity exposes its common actions nearby, every shown
shortcut works at the shown focus, navigation is possible without memorizing a
manual, destructive actions confirm locally, and the real rendered TUI survives
narrow terminals and long content without hiding the active control.
