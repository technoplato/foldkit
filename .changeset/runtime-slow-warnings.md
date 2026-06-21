---
'foldkit': minor
---

Replace `slowView` with a unified `slow` runtime config that measures four synchronous phases of the update cycle: `Update`, `View`, `Patch`, and `SubscriptionDependencies`. **Breaking change:** the `slowView` config field and `SlowViewConfig` type are removed. Use `slow.measuredPhases`, `slow.thresholdOverrides`, and `slow.onSlow` to configure slow warnings.

The new Slow Warnings example app intentionally pushes each phase past its default threshold and displays the resulting slow-context payloads in the UI.

```ts
import { Runtime } from 'foldkit'

Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  container: document.getElementById('root'),
  slow: {
    show: 'Always',
    onSlow: context => {
      console.warn(
        `[foldkit slow] ${context._tag} ${context.durationMs.toFixed(1)}ms`,
        context,
      )
    },
    thresholdOverrides: {
      Update: 4,
      View: 12,
      Patch: 8,
      SubscriptionDependencies: 1,
    },
  },
})
```

If you omit `slow`, Foldkit enables all four phases in development with their default thresholds. Pass `slow: false` to disable every phase at once.

If you pass a `slow` object, Foldkit still measures all phases by default. Use `measuredPhases` to choose which phases are measured and `thresholdOverrides` to replace specific default budgets. Omitted threshold override fields keep Foldkit defaults, so `slow: { onSlow }` measures every phase with default thresholds and a custom callback. `slow: { measuredPhases: ['View'] }` measures only view construction. `thresholdOverrides` entries for unmeasured phases are ignored.

The four phases:

- **`View`** measures the time to build the next VNode tree. Default budget `16ms`. The remediation hint points at keeping render-only work in the view path and memoizing expensive subtrees with `createLazy` / `createKeyedLazy`.
- **`Update`** measures the synchronous reducer call. Default budget `4ms`. The remediation hint points at the triggering Message branch, moving render-only derivations to memoized views, and keeping update focused on state transitions.
- **`Patch`** measures the VNode diff and DOM mutation. Default budget `8ms`. The remediation hint points at keying mapped lists by stable domain identity, never by array position, splitting large views, and `createLazy`.
- **`SubscriptionDependencies`** measures `modelToDependencies` per subscription on every Model change. Default budget `2ms` per subscription. The context carries a `subscriptionKey` for attribution, and the remediation hint points at keeping `modelToDependencies` a cheap projection from modeled fields.

The single top-level `onSlow` callback receives a tagged `SlowContext<Model, Message>` union (`_tag: 'View' | 'Update' | 'Patch' | 'SubscriptionDependencies'`). Discriminate on `_tag` to route per phase. TypeScript narrows the rest of the context automatically. Passing `onSlow` replaces Foldkit's default `console.warn` sink for every measured phase; Foldkit will not also warn for tags your callback ignores.

`Runtime.defaultSlowCallback` is now exported. Call it inside a custom `onSlow` to keep the default console output while adding your own behavior:

```ts
slow: {
  onSlow: context => {
    Runtime.defaultSlowCallback(context)
    myTelemetrySink(context)
  },
}
```

Slow view and patch warnings are silenced during DevTools time-travel replays so the parked-thread time during inspection doesn't trigger spurious warnings attributed to "init". Update and subscription dependency extraction are unaffected by replay by construction.

Default thresholds are intentionally generous. Treat warnings as signals to investigate, not problems to silence: confirm with a profiler before optimizing, prefer clear code, and don't add a `createLazy` without a measurable improvement.

Migration from the old `slowView`:

```ts
// Before
slowView: {
  thresholdMs: 50,
}

// After
slow: {
  thresholdOverrides: { View: 50 },
}
```

That migration keeps the new default Update, Patch, and SubscriptionDependencies warnings enabled while overriding the View threshold.

If the old `slowView` config also routed warnings to a custom sink, pass an `onSlow` callback that handles every measured phase you care about:

```ts
// Before
slowView: {
  thresholdMs: 50,
  onSlowView: context => log(context),
}

// After
slow: {
  thresholdOverrides: { View: 50 },
  onSlow: context => {
    if (context._tag === 'View') {
      log(context)
    } else {
      console.warn('[foldkit slow]', context)
    }
  },
}
```

If you intentionally want the old view-only diagnostic surface, select that phase explicitly:

```ts
slow: {
  measuredPhases: ['View'],
  thresholdOverrides: { View: 50 },
  onSlow: context => {
    if (context._tag === 'View') {
      log(context)
    }
  },
}
```

If you previously disabled the warning entirely with `slowView: false`, the equivalent kill switch is `slow: false`:

```ts
// Before
slowView: false

// After
slow: false
```
