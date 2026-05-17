---
'foldkit': minor
---

`Mount.define` and `Mount.defineStream` both require at least one declared result Message. The `Results` generic on every overload is now constrained to a non-empty tuple, so calling either constructor with no result schemas no longer typechecks.

This closes a loophole where a Mount factory could produce no Messages at all — `Effect.never` for `Mount.define`, `Stream<never>` or `Stream.empty` for `Mount.defineStream`. A Mount that runs DOM work for an element's lifetime without dispatching anything is invisible to DevTools history, can't be acknowledged by Scene tests, and can't be reasoned about during time-travel replay.

Fire-and-forget Mounts follow the same convention as fire-and-forget Commands: declare a `Completed*` result Message that `update` no-ops on. The side effect stays observable; `update` simply has nothing meaningful to do with the acknowledgment.

Existing in-repo call sites all declare result Messages, so no migration is needed. Downstream consumers who depended on the looser constraint will see a type error and can add a `Completed*` acknowledgment Message and dispatch it.
