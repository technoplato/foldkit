# Plan 03 | One React API, three canonical apps

Status: Proposed. Design only. Revised after adversarial rounds 1, 2, and 3
(R2-28, R2-29, R2-39, R3-19, R3-21). Closes audit items 3 and 4, and moves every
`react-bindings` package out of `examples/`.

## What is wrong today

- `@foldkit/react` (root export) and `@foldkit/react/interaction` are two
  APIs. The root one (`bindProgram`, `createProgramHooks`, `useModel(path, selector)`, `useScreen`, `sendScreenToken`, `ProgramKeyBindings`) keeps a
  module-global slot map and a module-level `lastScreenTag`, and its selector
  has no equality, so an object-returning selector re-renders on every notify.
  25 files in 9 examples use it; Books and Read Aloud use both.
- `examples/*/react-bindings` holds 24 directories. 21 are packages that
  hand-write `createActions` maps from clicks to Messages (counter, counters,
  puzzle, gate, settings, read-aloud, payments, calculator, cardboard,
  archiver, conversations, wallet, fact, ideas, showcase, issues, transcribe,
  replayability, pis-canvas-lab, shared, world); `books/react-bindings` is
  stale build output; `ingest` and `songbook` hold orphan tsconfigs. 20
  `package.json` files carry a dependency line on one of the two bindings
  packages (`shared-react-bindings-example`, `counter-react-bindings-example`),
  40 counting the legacy `counters-core-example` too. A binding is framework code; it
  belongs in `packages/`. Two bindings also carry app painters
  (`read-aloud/react-bindings/src/googleBooksPreview.tsx`,
  `pis-canvas-lab/react-bindings/src/labCounters.tsx`) that must survive.
- `useFeature` exposes payload-free Actions only, types the Model as the
  sync gate, and throws when the Program passed is not the bound one by id,
  so a component inside Multiple Counters cannot bind the Counter (plan 02
  fixes the first two; this plan the third).

## North Star

A whole React window, unchanged from today's Counter and Multiple Counters:

```tsx
export const App = (): ReactElement => {
  useKeyBindings()
  useBrowserHistory()
  useDocumentTitle()
  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <section className="w-full max-w-xl text-center space-y-6">
        <WhenReady>
          <NavigationFrame />
          <ActionMenuButton />
        </WhenReady>
      </section>
    </main>
  )
}
```

The escape hatch, a hand-written row inside the same window, reusing the
Counter's own component through a row scope (R2-28):

```tsx
// examples/shared/components/counterBadge.tsx: written once, imported by both hosts (R3-19)
export const CounterBadge = ({
  scope,
}: Readonly<{ scope: MountPath<typeof Counter> }>) => {
  const { model: count, actions } = useFeature(scope, model => model.count)
  return (
    <span>
      {count}
      <ActionButton action={actions.increment}>+</ActionButton>
      <ActionButton action={actions.decrement}>-</ActionButton>
      <ActionButton action={actions.reset} />
    </span>
  )
}

// inside Multiple Counters: one scope per row, no knowledge of the parent's Model
const CounterRow = ({ counterId }: Readonly<{ counterId: CounterId }>) => (
  <li>
    <CounterBadge scope={Counters.row(counterId)} />
  </li>
)
```

- `useFeature(scope, select, isEqual?)` returns `{ model, actions }` with
  the selection kept by reference while structurally equal (today's
  `useSelected` is right and stays).
- `scope` is a mount path, never a Program id: `Counters.row(counterId)`
  names one row of the `forEach`; a Program composed twice is addressed by
  its path. `ProgramProvider` binds the App; `bound.scope(path)` resolves the
  slice through the combinators that wrap it (`Session.compose`,
  `ActionMenu.compose`, `forEach`).
- `model` is the Ready child Model; the hook is legal only under `WhenReady`
  and throws with a sentence everywhere else (plan 02).
- `actions` covers every Catalog Action by kind: `press()`, `choose(value)`,
  `for(value)`, `fill(fields)`, each returning `Sent | Refused({ because })`.
  Handles are memoized per entry, and `for(value)` reads one choice.
- Mixed painting is allowed: `NavigationFrame` for the screens the Program
  paints, hand-written components beside or inside them, both pressing the
  same Catalog.

Books, canonical:

```tsx
// examples/books/react/src/App.tsx
import { booksPainters } from './painters.js'

export const App = (): ReactElement => {
  useKeyBindings()
  useBrowserHistory()
  useDocumentTitle()
  return (
    <EmbedPaintersProvider painters={booksPainters}>
      <WhenReady>
        <NavigationFrame />
        <ActionMenuButton />
      </WhenReady>
    </EmbedPaintersProvider>
  )
}

// examples/books/react/src/painters.tsx: the one place Books paints something Foldkit cannot
import { GoogleBooksPreview } from 'shared-painters-example'

export const booksPainters: EmbedPainters = {
  GoogleBooksPreview: ({ embed }) => <GoogleBooksPreview volumeId={embed.volumeId} />,
}
```

An embed painter is host code that paints one `Text` embed the Program
declared; it names the embed's Schema, never an Action or a route. A painter
two examples share (`GoogleBooksPreview`, used by Books and Read Aloud) lives
in `examples/shared/painters`, a package, so neither example imports the
other's host file (R2-29).

## The one API

`@foldkit/react` exports exactly this. The router-free subpaths
(`/interaction`, `/navigation`) collapse into the root and remain as aliases
for one release. `@foldkit/react/react-router` stays a subpath permanently,
because `react-router` is an optional peer that React Native bundles do not
install, and Metro resolves every static import.

| Export                                                          | Role                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| `ProgramProvider`, `useBound`                                   | one bound App for the tree                            |
| `WhenReady`, `useStatus`                                        | the sync gate, in one place                           |
| `useFeature`, `useModel`, `useActions`                          | typed reads and typed Actions, by mount path          |
| `NavigationFrame`, `useNavigationFrame`, `useViewAt`            | painted screens                                       |
| `ActionMenuButton`, `ActionMenuDialog`, `useMenuOpener`         | the menu                                              |
| `ActionButton`, `ActionButtons`                                 | one button per Action, by kind; `choice` for a Choose |
| `useKeyBindings`, `useBrowserHistory`, `useDocumentTitle`       | browser glue                                          |
| `paintTree`, `EmbedPaintersProvider`                            | custom painters and embeds                            |
| `@foldkit/react/react-router`: `FoldkitRouter`, `FoldkitOutlet` | React Router, outward and inward (plan 04)            |
| `@foldkit/react/replay`: `useReplay`, `ReplayControls`          | replay inspection, from the shared binding            |

Deleted: `bindProgram`, `createProgramHooks`, `installProgramHandle`,
`installScreenHandle`, `getProgramHandle`, `resetBoundPrograms`, `useScreen`
(root), `sendScreenToken`, `ProgramKeyBindings`, `BoundPrograms`, the
`programHandle/` and `hooks/` modules, and the module globals.

## Bindings move to `packages/`

| Binding directory                                                                                                                                                                                                | Destination                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `shared/react-bindings` (replay client)                                                                                                                                                                          | `@foldkit/react/replay`                                                                                                        |
| `counter`, `counters`, `puzzle`, `gate`, `settings`, `payments`, `calculator`, `cardboard`, `archiver`, `conversations`, `wallet`, `fact`, `ideas`, `showcase`, `issues`, `transcribe`, `replayability`, `world` | deleted; `useXModel` and `useXActions` become `useFeature(X)` in the host                                                      |
| `read-aloud/react-bindings` (embed painter)                                                                                                                                                                      | `examples/shared/painters` (shared with Books) through `EmbedPaintersProvider`                                                 |
| `pis-canvas-lab/react-bindings` (lab painter)                                                                                                                                                                    | `examples/pis-canvas-lab/react/src/painters.tsx`                                                                               |
| `books/react-bindings` (stale output)                                                                                                                                                                            | deleted                                                                                                                        |
| `ingest`, `songbook` (orphan tsconfigs)                                                                                                                                                                          | deleted                                                                                                                        |
| `examples/react-native-showcase`                                                                                                                                                                                 | moves to `@foldkit/react-native` (`FoldkitStack`, `ActionMenuButton`) like Counter's Expo host, or is retired with its binding |

## Canonical means

An example is canonical when its React host's window file:

1. imports only from `@foldkit/react`, React, and its own `./painters`;
2. names no Action, route, word, or style of the Program;
3. uses `WhenReady` as the only gate and never reads `_tag` of the synced Model;
4. has no `react-bindings` package beside it;
5. keeps any embed painter in `painters.tsx`, naming embed Schemas only, any
   painter shared with another example in `examples/shared/painters`, and
   any component shared with another example (`CounterBadge`) in
   `examples/shared/components`, never imported from another example's host.

Components the app adds beside the window (the escape hatch) may name
Actions through typed handles and read the Model through `useFeature` on a
mount path; that is what the hatch is for. They may not press by string tag
or keep a second Model.

| App               | Today                                                                                                                | To canonical                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Counter           | window is canonical; `react-bindings` package remains for the showcase                                               | delete `examples/counter/react-bindings`; move the showcase                                     |
| Multiple Counters | window is canonical; core hand-rolls (plan 05); no Expo or Foldkit HTML (plan 10)                                    | rebuild core on `forEach` (plan 05); add the two hosts                                          |
| Books             | `react/src/App.tsx` imports the root API and `/interaction`; `read-aloud/react-bindings` embeds through the root API | the window above; painters in `painters.tsx` and `examples/shared/painters`; delete the binding |

## Svelte, React Native, OpenTUI parity

- `@foldkit/svelte` gains `feature(scope, select)` returning a reactive
  `{ model, actions }` with the same equality rule, built on
  `createSubscriber`; `reactive()` stays for whole-Model reads.
- `@foldkit/react-native` reuses the React hooks and gains the kind-aware
  handles.
- OpenTUI and the terminal painters press through the Catalog already; they
  switch to `Catalog.entriesAt`.

## Migration

1. Land plan 02's handles and `bound.scope(path)` in `@foldkit/react/interaction`.
2. Give each example a Catalog first (plan 02, migration step 6), since
   `useFeature` offers no `actions` without one and none of gate, settings,
   puzzle, ingest, casino, songbook, or issues declares one today (05a,
   R3-19). Then migrate the 25 root-API files, one example per commit, each
   ending with its `react-bindings` package deleted or its painter moved.
   Order: gate, settings (share the gate binding), puzzle, ingest, casino,
   songbook, issues, read-aloud, books.
3. Move the replay client to `@foldkit/react/replay`; retire or move the
   showcase.
4. Collapse `/interaction` and `/navigation` into the root; keep
   `/react-router`; keep the aliases one release.
5. Delete the root API modules and the module globals.

## Decisions for the owner

1. `examples/react-native-showcase`: move to `@foldkit/react-native` or retire.
2. Whether `@foldkit/react/replay` is worth keeping, or replay inspection
   belongs in devtools only.
