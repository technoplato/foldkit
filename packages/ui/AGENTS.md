# @foldkit/ui

The owner, 2026-11-20: "a painter should just take state and render a UI and
then when that state changes, it should render again. That's it."

`@foldkit/ui` is 25 widgets (Menu, Dialog, Tabs, Combobox, and the rest).
Each has a pure `update` and a view written on `foldkit/html`, so today each
works on a web page only.

## The rule

The owner decided on 2026-11-20 that every widget here moves to core, one at
a time, starting now, and that the widgets keep working while they do. "Yes,
do all of them."

For each widget, its rule moves to a core part in
`packages/foldkit/src/behavior/`, and the widget here keeps its API and
becomes the HTML painter's view of that part. Nothing that imports
`@foldkit/ui` breaks.

- **A rule** is any number with a unit of time, distance or count, or any
  branch on what the person meant. Example: in Menu, which item the down
  arrow highlights next, and which item a typed letter jumps to. That is the
  same on a page, a phone and a terminal, so it goes in core.
- **A mechanic** is how one platform measures, scrolls, listens and draws.
  Example: placing Menu's panel beside its button with `@floating-ui/dom`
  (`src/anchor.ts`), and the `foldkit/html` elements the view returns. That
  stays here.

Do not add a rule to a view here, and do not add a new widget whose behavior
lives only here. Write the block in `packages/foldkit/src/behavior/` first
(read its `AGENTS.md`), then draw it.

## The count

`pnpm lint` runs `pnpm check:painter-ratchet`. For every file under
`packages/ui/src` it counts imports of `foldkit/html`, `foldkit/dom`,
`foldkit/mount`, `foldkit/render`, `foldkit/file` and `@floating-ui/dom`,
each use of what those imports gave, and each mention of `document` and
`window`. It fails when a count rises above
`scripts/painter-ratchet/ui.json`.

The counts are expected to fall with each widget moved. They may not rise.

- You moved a widget's rule to core: run `pnpm check:painter-ratchet --write`
  to record the lower counts.
- A rise is fair: edit only `scripts/painter-ratchet/ui.json`. Raise the
  count and add beside it
  `"rises": [{ "kind": "domUses", "from": 12, "to": 13, "why": "the reason" }]`.

The plan is `plans/14-ui-v1.md` ("Keeping it true", open decision 2). The
words are in `glossary.md` under "Behavior and painters".
