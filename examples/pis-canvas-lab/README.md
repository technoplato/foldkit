# PIS canvas lab (composed catalog)

> **Agent handoff:**  
> `/Users/laptop/Development/brainstorming/ideas/domain-as-tree-pis/AGENT-HANDOFF.md`

**ADR 0007 Q6:** one Foldkit Program, monorepo catalog via **`Program.compose`**.

## Catalog (one-line register)

```ts
// core/src/catalog.ts
export const DemoCatalog = Program.compose({
  single: CounterProgram,
  multi: MultipleCountersProgram,
  calc: CalculatorProgram,
  list: CounterListProgram, // compose.forEach({ of: CounterProgram })
})

export const ShowcaseShell = Program.compose({
  chrome: ChromeProgram,
  demos: DemoCatalog,
})
```

Add another monorepo demo: one line in `DemoCatalog`. Model / Message / init / update are derived.

## Model shape

```text
model.chrome          // map pan/zoom, visibility, focus
model.demos.single    // Counter
model.demos.multi     // Multiple Counters
model.demos.calc      // Calculator
model.demos.list      // forEach list of Counters
```

## Message helpers

```ts
GotSingleCounterMessage({ message }) // → demos.single
GotMultiCountersMessage({ message }) // → demos.multi
GotCalculatorMessage({ message })
// or: ShowcaseShell.message.demos(DemoCatalog.message.calc(...))
```

## Map UI

Full-viewport canvas (PIS-style): toolbar toggles `single` / `multi` / `calc` /
`list`. Phones are live AsciiSurface views of composed Models. Scroll to zoom;
drag empty space to pan.

```sh
pnpm --filter pis-canvas-lab-core-example test
pnpm --filter pis-canvas-lab-core-example typecheck
pnpm --filter pis-canvas-lab-react-example test
pnpm --filter pis-canvas-lab-react-example dev
# → http://localhost:5199/
```
