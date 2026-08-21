# Overview 01 — Best shot: atomic UI + multi-surface

**Recommended baseline for Q&A.** Amend here, not only in chat.

## Pipeline

```text
Foldkit Program (Model · Message · update)
        │  bindings: useModel / useActions
        ▼
┌───────────────────────────────────────────────────────────┐
│  counters-ui (or foldkit-ui-primitives) — SHARED TREE       │
│  Atomic design layers (below)                               │
│  No className · no <div> · no OpenTUI tags in shared code │
└───────────────┬───────────────────┬───────────────────────┘
                │                   │
     ┌──────────▼──────────┐ ┌──────▼──────────┐ ┌──────────▼──────────┐
     │ DomSurface          │ │ AsciiSurface    │ │ TuiSurface          │
     │ → browser DOM       │ │ → lines+hotspots│ │ → OpenTUI/Yoga      │
     └──────────┬──────────┘ └──────┬──────────┘ └──────────┬──────────┘
                ▼                   ▼                         ▼
         counters/react      LiveAsciiPhone /            counters/opentui
                             FoldkitCanvas / CLI dump
```

## Atomic design (atoms → screens)

Spellings: **atoms** (not “adams”), molecules, organisms, templates, screens.

```text
ATOMS (indivisible)
  Text            string run · mono? · tabular? · truncate
  TextInput       value + onChange(value) · focused? · placeholder
  Spacer          fixed rows/cols
  Rule            horizontal rule glyph / hr

MOLECULES (atoms + behavior)
  Button          label + onPress · variant primary|ghost|destructive
  IconButton      short label (+/−)
  LabelRow        Text + Text (key/value)
  Field           Text label + TextInput

ORGANISMS (meaningful product chunks)
  StatusBar       time / battery chrome (optional per surface)
  CounterRow      id · count · [−][+] · whole-row open
  ListHeader      title + Σ total
  ConfirmBar      Cancel · Confirm
  PhoneChrome     border + optional status (or surface-provided)

TEMPLATES (page recipes · layout policy)
  StackScreen     single phone: exclusive list OR detail
  SplitMasterDetail  list column + detail column
  CanvasNodes     N independent PhoneChrome roots for PIS map

SCREENS (templates + live Model)
  CountersListScreen
  CountersDetailScreen
  CountersCanvasMap   (list node + detail node for PIS)
```

### Primitive props (host-neutral only)

```text
VStack { gap?: number; flex?: number; children }
HStack { gap?: number; flex?: number; children }
Text   { children: string; mono?: boolean; dim?: boolean; width?: number }
TextInput {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  focused?: boolean
  onFocus?: () => void
}
Button { label: string; onPress: () => void; variant?: ...; disabled?: boolean }
```

**No** React `onChange` event objects in the shared tree — only `(value: string) => void`.  
DomSurface maps that to DOM; AsciiSurface maps keystrokes when focused.

## Layout engine (AsciiSurface)

Character cell box model (fixed `cols`, e.g. 28):

```text
JSX host elements
    → LayoutNode { x, y, w, h, kind, text?, action?, children }
    → paint → lines: string[]
    → collect action boxes → hotspots[]
```

Phone border is **layout**, not a post-hoc `row + 1` hack.

## Counters on canvas (best-shot composition)

```text
CanvasNodes template
┌─ counters.list (always rows) ──┐   ┌─ counters.detail ─────────────┐
│ PhoneChrome                    │   │ PhoneChrome                     │
│  ListHeader Σ                  │   │  selected                       │
│  CounterRow × N   ◄── Model    │   │    ? Detail organism            │
│  Button + Add                  │   │    : DetailPlaceholder molecule │
└────────────────────────────────┘   └─────────────────────────────────┘
         active ring = Program navigation destination
         pan centers active node (map chrome, not product UI)
```

List **always** uses `model.rows`. Detail is **not** a second hand sketch — same Detail organism or a shared placeholder molecule.

## DOM product (stack template)

```text
destination list  →  CountersListScreen only
destination detail → CountersDetailScreen only
```

Same organisms; different template.

## What we delete after this works

- `liveAscii.ts` hand `row`/`col` product tables
- Parallel empty-detail string arrays
- (Later) static multi-counter frames in brainstorming packs

## Out of scope for first cut

- Full CSS layout parity
- Animations
- Arbitrary nested scrolling in ASCII (cap list rows or clip with “+N more”)
