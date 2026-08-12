# Overview 02 — Derived actions + drafts for payload Messages

## Derived actions (Q2 accepted)

```text
Message constructors (single source)
        │
        ▼
 actionsBuilder(program | messageManifest)
        │
        ├─► React:    useModel() / useActions()     // host idioms only
        ├─► Svelte:   $model / actions              // later; runes-faithful
        ├─► ASCII:    keyMap + hotspots + legend    // same ActionIds
        └─► TUI:      key handlers                  // same ActionIds
```

Zero-arg: automatic. Payload: binder co-located with Message.

## Field state (Q3 M1 + Q4 Bind-A)

**Model owns values and focus.** Per-field change Messages (typed). Bind projection is host-agnostic.

```text
Model {
  count: 5,
  label: "hello",           // domain field name — not "text"
  focusedField: "label",  // focus is state
  // optional UI flags as model data:
  // labelDisabled: false
}

┌ phone · interactive ───────────────────────────┐
│  label: hello_         ← model.label           │
│  count: 5                                      │
│  [ + add length ]      ← zero-arg; reads label │
│  f focus-label   + add-length   − dec         │
└────────────────────────────────────────────────┘

Focus:   FocusedFieldSet({ field: "label" })  → model.focusedField
Keys:    LabelChanged({ label: "hello" })     → model.label
Button:  clickedAddLength()                   → count += label.length
```

### Bind projection (Foldkit-facing, NOT React API)

```text
actions.bind.label() → {
  value: model.label,
  change: (next) => enqueue(LabelChanged({ label: next })),
  focus: () => enqueue(FocusedFieldSet({ field: "label" })),
  disabled: model.labelDisabled ?? false,
}
```

React adapter maps that onto DOM. ASCII adapter maps keystrokes when `focusedField === "label"`.  
Svelte later maps to runes-friendly bindings. **No Foldkit names in app views beyond model + actions.**

### Call-site payload (exception, not bind)

```text
List row click → clickedSelectCounter({ id: "2" })
  id comes from the row interaction, not a text field bind.
```

Still derived in the actions builder from Message payload type; not duplicated by hand forever.

| Option | Status |
| ------ | ------ |
| H1 host draft | Rejected |
| **M1 Model fields** | **Accepted** |
| **Bind-A per-field Messages + bind.field()** | **Accepted** |
| Generic FieldChanged only | Rejected as default (weak types) |
