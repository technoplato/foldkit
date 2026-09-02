---
name: document
description: Write or review code documentation (TSDoc, module docs, doc articles) at Point-Free quality. Use when documenting public exports, reviewing doc comments, or when the user asks for documentation passes on Foldkit code.
---

# Document

Document code at the quality bar of Point-Free's libraries: the Composable
Architecture, Swift Sharing, and SQLiteData / StructuredQueries. Their doc
comments read as teaching prose, compile as examples, and state laws. Match
that here in TSDoc.

## The bar, distilled from Point-Free

1. **Every public export is documented.** No exceptions. A symbol without a
   doc comment is unfinished.
2. **First line: what it is, as one sentence.** Noun phrase for types and
   values ("A gated fact handle."), verb phrase for functions ("Derives the
   fact handles for one Ready Model."). No "This function..." preamble.
3. **Then why it exists and when to reach for it.** One short paragraph.
   Name the alternative a reader might wrongly reach for and point them to
   it ("Prefer X when..."). Point-Free docs constantly cross-reference; use
   `{@link Symbol}`.
4. **A runnable example for anything non-obvious.** Fenced `typescript`
   block inside the doc comment showing real usage with real names, the way
   TCA's `Reducer` and Sharing's `@Shared` docs do. Examples must
   typecheck if pasted into the exemplar apps.
5. **Concrete beside abstract, always.** Every theoretical claim is paired
   with an example a reader can check. "Mounting composes transitively"
   must be followed by `/counters/counter/c1`.
6. **State the laws.** If a pair of functions must round-trip
   (`parse(print(d))` equals `d`), if an order matters, if a value must be
   stable across releases (Program `id`, schema `version`), the doc comment
   says so explicitly. Laws are documentation, not tribal knowledge.
7. **Document the failure and edge behavior.** What happens on None, on
   empty, on unmatched, on stale handle. TCA documents cancellation and
   re-entrancy; we document Option returns and gate sentences.
8. **Parameters only when they carry meaning the signature does not.** Do
   not restate types. Document units, ordering, and ownership ("listener
   fires after the Model is swapped").
9. **Concept docs live at the module head.** A file that introduces a
   concept (catalog, navigation seam, via) opens with a section comment
   explaining the concept once, so per-symbol docs stay short. See
   `packages/foldkit/src/navigation/runtimeSeam.ts` for the shape.
10. **Deprecations teach the replacement.** `@deprecated` plus the exact
    symbol to use instead and a one-line migration.

## Placement rules

- Comments and doc comments always sit on their own lines **above** the
  code they describe. Never trail code to the side on the same line.
- Section headers (`// MODEL`, `// UPDATE`, ...) stay one word, per repo
  convention.
- Inside doc examples, follow every repo code convention (Schema types,
  `Option`, `Match`, no `as` casts). A doc example that violates the
  conventions teaches the violation.

## Review checklist

When reviewing documentation, reject a doc comment that:

- restates the symbol name without adding information ("counterScreen:
  the counter screen")
- describes implementation instead of contract
- gives theory with no concrete example
- omits the example on a public API with more than one obvious use
- states behavior the code does not have (docs that lie are worse than no
  docs; verify against source)
- trails to the side of code

## Exemplars to imitate

- `packages/foldkit/src/navigation/runtimeSeam.ts` (module concept header,
  law statements)
- `packages/foldkit/src/schema/index.ts` `m` / `md` docs (example-first)
- Point-Free, for tone and depth: TCA `Reducer`/`Store` docs, Swift Sharing
  `@Shared` docs, SQLiteData `@FetchAll` docs.
