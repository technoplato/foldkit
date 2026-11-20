---
'foldkit': minor
---

`foldkit/experimental/machine` is upstream Foldkit's newer Machine. It gains a read-only `context` that guards and Edge handlers receive, `Machine.fold` (read the Machine's field from the Model, run the transition, write it back, keep the Commands), `forStates(...).on(...)` for an Edge several states share, `ignore()`, the reason a step was ignored (`OutOfAlphabet`, `NotApplicable`, `GuardsFellThrough`, `ExplicitlyIgnored`), and extra roots for `unreachableStates` and `deadTransitions`.

An Edge handler may answer upstream's record, `{ model, commands }`, or, as before, the state alone with its Commands as a third argument. `transition` and `fold` still answer this fork's tuple, `[model, commands]`. One thing changes for a caller: a step that was ignored now carries `reason`, so a test that compares the whole result adds it.
