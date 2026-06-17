---
'@foldkit/devtools': patch
'foldkit': minor
---

Cut avoidable per-jump overhead in DevTools time-travel navigation.

Each navigation used to resolve the model for the target index twice: once in
`JumpTo` to render the host app, and again in `InspectState` to feed the
inspector panel. For a mid-segment jump that replayed the segment from the
nearest keyframe twice. `store.jumpTo` now returns the model it resolved, and a
single `JumpToAndInspect` command renders the host and builds the inspection
from that one resolution. Inspect-only navigation (no host pause) still resolves
once on its own.

Scrubbing the timeline no longer enqueues a full jump-plus-inspect for every
`pointermove`. The slider thumb still tracks every move (cheap, model-only), but
the heavy navigation is coalesced to one per animation frame via a pending-index
field and an `animationFrame` subscription, so a fast drag can't fall behind the
cursor.

DevTools config gains a `keyframeInterval` option (alongside `maxEntries`) to
trade memory for faster jumps. Smaller intervals store more model snapshots and
shorten the replay each jump walks, down to `1` where every jump is a
constant-time snapshot lookup. It is still forced to `1` automatically when
`excludeFromHistory` is active.

Also fix the overlay's "Clear history" and "Jump to top" buttons, which
silently did nothing when clicked.
