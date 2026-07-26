# Multiple Counters | State-Driven Host Comparison

This example keeps the Model, Message union, update, Commands, destination
projection, and currently valid interaction set in `counters-core-example`. The
host packages only render those values and map native input back to Messages.

The React binding owns one `ReplayController`. `useModel`, `useActions`, and
`useReplay` all read or operate on that controller. Product controls therefore
remain usable during replay inspection. Sending a product Message while
inspecting branches live from the selected settled frame. An unsettled frame is
still available for inert inspection, but the binding explains that it cannot
become a live branch until its Command result has arrived.

## React-A | Unified Modal

`react/src/reactA.tsx` maps both `CounterFactAlert` and
`DeleteCounterConfirmation` to one custom `ModalShell`. The mode still selects
different content, tone, and Messages, but the native presentation mechanism is
uniform.

This approach has the smallest host surface. It is useful when a product wants
one consistent modal treatment across platforms.

Open it locally with:

```sh
pnpm --filter counters-react-example dev -- --open '/counters?presenter=a'
```

Published: <https://countersdemo.knophy.com/counters?presenter=a>

## React-B | Semantic Surfaces

`react/src/reactB.tsx` maps `CounterFactAlert` to a responsive sheet and
`DeleteCounterConfirmation` to the browser's native `dialog`. This is the
preferred experiment because the presentation adapter can choose the platform
surface that best expresses each domain case without creating local navigation
state.

The native dialog is opened when the delete mode appears in the Model. Escape,
backdrop, Cancel, and Delete all send domain Messages. Seeking replay into the
delete frame opens the dialog again, and seeking away removes it.

Because a modal browser `dialog` makes the rest of the document inert, React-B
projects the same replay controls inside the active dialog. The ordinary floating
controls are omitted for exactly that destination case. Replay therefore remains
interactive without weakening the dialog's native modal semantics or introducing
local presentation state.

Open it locally with:

```sh
pnpm --filter counters-react-example dev -- --open '/counters?presenter=b'
```

Published: <https://countersdemo.knophy.com/counters?presenter=b>

## OpenTUI React | Terminal Selection

`opentui/src/host.tsx` uses the same Provider, `useModel`, `useActions`, and
`useReplay` hooks through the OpenTUI React reconciler. A focused terminal
`select` renders the interaction manifest derived by the core Program. Pressing
Enter forwards the selected interaction through `useActions`.

The terminal host does not duplicate a token-to-Message switch. Arrow left and
right control replay, `i` enters inspection, any selected Program action branches
live from a settled frame, and `q` exits.

Run it with Bun because OpenTUI's native renderer currently targets Bun:

```sh
pnpm --filter counters-opentui-example dev
```

## Boundary Kept Intentionally Private

These bindings remain example-only. The three hosts test whether the hook and
message-mapping shapes survive distinct presentation media before Foldkit
promotes a React API into core. Neither React presenter nor OpenTUI required a
host-specific Foldkit core API. The audit did expose one renderer-independent
core invariant: replay frame zero cannot branch when the tape has initial
Commands, because that causal operation is not settled. `ReplaySession` now
enforces that rule for every host, and the React binding explains the failure in
its replay controls.
