---
'foldkit': minor
---

**Breaking:** Mount has two constructors picked by emission cardinality. `Mount.define` is for one-shot Mounts that produce exactly one Message at acquire (the common case). `Mount.defineStream` is for Mounts that emit a continuum of events from observers or listeners attached to the element.

`Mount.define` now takes `(element: Element) => Effect<Message>`. The Effect produces exactly one of the declared result Messages at acquire; the type system enforces this contract the same way it does for `Command.define`. Cleanup composes via `Effect.acquireRelease` inside the Effect, and the runtime keeps the scope open across the element's full lifetime so finalizers run when the element unmounts, not when the Effect completes.

`Mount.defineStream` takes `(element: Element) => Stream<Message>`. Use it when the Mount's job is to emit a stream of Messages from event listeners or observers (scroll events, IntersectionObserver entries, MutationObserver records). The `MountResult` type is removed from `foldkit/html`.

## Migrating one-shot Mounts

The `{ message, cleanup }` record becomes an `Effect` whose success value is the Message, with cleanup registered via `Effect.acquireRelease`.

Before:

```ts
const PortalToBody = Mount.define(
  'PortalToBody',
  CompletedPortalToBody,
)(element =>
  Effect.sync(() => {
    document.body.appendChild(element)
    return {
      message: CompletedPortalToBody(),
      cleanup: () => element.remove(),
    }
  }),
)
```

After:

```ts
const PortalToBody = Mount.define(
  'PortalToBody',
  CompletedPortalToBody,
)(element =>
  Effect.gen(function* () {
    yield* Effect.acquireRelease(
      Effect.sync(() => document.body.appendChild(element)),
      () => Effect.sync(() => element.remove()),
    )
    return CompletedPortalToBody()
  }),
)
```

If the Mount has no cleanup (the Effect just reads from the element and emits its Message), drop the `acquireRelease` entirely and return the Message directly:

```ts
const MeasurePanelWidth = Mount.define(
  'MeasurePanelWidth',
  MeasuredPanelWidth,
)(element =>
  Effect.sync(() =>
    MeasuredPanelWidth({ width: element.getBoundingClientRect().width }),
  ),
)
```

## Migrating continuous-event Mounts

Move to `Mount.defineStream`. Attach the listener inside `Effect.acquireRelease`'s acquire body, offer each event's Message to the queue, and let the release detach the listener when the element unmounts.

```ts
const ListenSidebarScroll = Mount.defineStream(
  'ListenSidebarScroll',
  ScrolledSidebar,
)(element =>
  Stream.callback<typeof ScrolledSidebar.Type>(queue =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const handler = () =>
            Queue.offerUnsafe(
              queue,
              ScrolledSidebar({ scroll: element.scrollTop }),
            )
          element.addEventListener('scroll', handler, { passive: true })
          return handler
        }),
        handler =>
          Effect.sync(() => element.removeEventListener('scroll', handler)),
      )
      return yield* Effect.never
    }),
  ),
)
```

## Third-party libraries: construct INSIDE the acquire body

For Mounts that instantiate a third-party library (chart, map renderer, audio context, anything with a stateful handle), construct the handle as the success value of `Effect.acquireRelease`'s acquire Effect, not before it. `acquireRelease` only guarantees atomicity of "acquire body completes → release is registered"; anything constructed outside the acquire body is unprotected against interruption.

```ts
// ❌ Wrong: chart is constructed before acquireRelease registers its release.
// Interruption between the two yield*s leaks the chart.
Effect.gen(function* () {
  const { Chart } = yield* Effect.tryPromise(() => import('chart-lib'))
  const chart = new Chart(element, { data })
  yield* Effect.acquireRelease(
    Effect.sync(() => chart),
    chart => Effect.sync(() => chart.destroy()),
  )
  return SucceededMountChart()
})

// ✅ Right: construction lives in the acquire Effect, so registration is atomic.
Effect.gen(function* () {
  yield* Effect.acquireRelease(
    Effect.tryPromise(() => import('chart-lib')).pipe(
      Effect.map(({ Chart }) => new Chart(element, { data })),
    ),
    chart => Effect.sync(() => chart.destroy()),
  )
  return SucceededMountChart()
})
```

The discipline: whatever the release function needs as input must be the success value of the acquire Effect. This applies anywhere `acquireRelease` is used, not just in Mounts.

## Picking between the two

Use `Mount.define` when the Mount produces a single Message at acquire and holds lifecycle-scoped resources for the rest of the element's lifetime (anchor positioning, portaling, third-party library instantiation). Use `Mount.defineStream` only when the Mount's job is to emit a continuous stream of Messages from listeners or observers attached to the element.

If a Mount has no cleanup and dispatches its Message once on appearance, the cause is often a Message that just dispatched (a route landing, a dialog opening, a form submitting), not the element's existence. That's a Command, not a Mount. Re-check the cause before adding the Mount.
