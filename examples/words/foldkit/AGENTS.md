# The Words page

The owner, 2026-11-20: "a painter should just take state and render a UI and
then when that state changes, it should render again. That's it."

This folder is the Words page's Client: `src/view/` draws the Model with
`foldkit/html`, and `src/browser.ts` and `src/mount.ts` are its edge, the
services and Mounts that touch the page. The domain is in `../core`.

`src/browser.ts` is the file a follow rule was once headed for. The page now
follows the voice through the shared rule: it hands the HTML painter the
reader whole, and `TranscriptFollow` in `packages/foldkit/src/behavior/`
decides when to follow. Do not write a rule here.

- **A rule** is any number with a unit of time, distance or count, or any
  branch on what the person meant. If it is about words, it goes in
  `../core`. If any app could use it, it goes in
  `packages/foldkit/src/behavior/`. Example: "leave the words alone for a
  second after the reader scrolls" is `TranscriptFollow`'s.
- **A mechanic** is how the page measures, scrolls, listens and draws.
  Example: opening the share sheet's `<dialog>` as a native modal in
  `src/mount.ts`.

`pnpm lint` runs `pnpm check:painter-ratchet`, which counts timers and clocks,
held state, listeners and numbers other than 0 and 1 in the files under
`src/`, and fails when a count rises above
`scripts/painter-ratchet/painters.json`. Zero is where each file is headed; a
count is not a budget. The audio files (`audio.ts`, `capture.ts`,
`copyAudio.ts`, `resources.ts`) are service adapters and are not counted. To
record a fair rise, edit only the ledger: raise the count and add a `rises`
entry that says why.

The page is served from source through `../../vite.aliases.ts`. A new
`foldkit/<subpath>` import needs an alias there, or the page loads blank while
every test passes; `aliases.test.ts` holds that.

The plan is `plans/14-ui-v1.md`.
