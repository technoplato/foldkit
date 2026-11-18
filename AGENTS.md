# Agent Development Notes

Preferences and conventions for Codex and other coding agents working on this repository. This file is the always-on summary. Read source, examples, and package docs when a rule needs context.

Repo-local `skills/foldkit`, `skills/generate-program`, and `skills/audit-program` target consumer Foldkit apps. Do not treat them as always-on repo-maintenance guidance unless the user explicitly invokes them.

## Which layer? Decide before you add code

Michael, typed 2026-11-17 (Scribe #2494): "any core functionality needs to be expressed in the core, and then anything that's CLI specific or other site-specific needs to be done in those adapter layers". And: "Sync engine should be generic, and our implementation just happens to be instant DB, but any kind of sync engine should work there." And: "That's the CLI, nothing interactive. The Tui is the interactive side". And: "the books domain goes in the core books domain, similar to Fold Kit Core". On the name of the background primitive: "Background processor, that's simpler language. I like that."

Every change lands in exactly one of four layers. Name the layer before you write the first line, and say it in the commit body.

1. **Foldkit core** (`packages/foldkit/src`, except `cli/`). Generic and domain free: the Program (Model, Message, update, Commands, Subscriptions), the Catalog of Actions, Navigation, the screen tree a Program returns (`foldkit/renderers` types and readings), `Interaction` (how any Client drives and follows a Program without knowing its Messages), Session and synchronization, and the sync engine interface `Runtime.SyncEngine`. Nothing here names a terminal, a socket, a process, the DOM, Instant, or a book.
2. **A domain core** (`examples/<app>/core`, such as `examples/books/core`). Everything true about the domain, modeled once as Model, Message, update, Commands, Subscriptions, and pure readings of the Model. It relates to its Clients the way Foldkit core relates to a domain core. Nothing here names a terminal, React, or a flag.
3. **Client adapters** (`packages/foldkit/src/cli`, `@foldkit/react`, `examples/<app>/cli`, `examples/<app>/react`, and so on). They paint what the cores say and translate native input into Messages. A terminal adapter owns argv, stdout lines, exit codes, and the Background Processor's process, socket, pid, and lock. The CLI is one-shot and scriptable: nothing waits on a keypress and nothing takes over the terminal. Anything interactive belongs to the TUI Client.
4. **Engine and service adapters** (`@foldkit/instant`, an example's `instant*.ts`, `ffplayAudioOutput`, an HTTP client). They fill the ports a core declares: a `Runtime.SyncEngine`, a `Context.Service`. Instant is the engine every example ships with (see "Sync: Instant only" below); core depends only on the interface, and `Runtime.Memory` implements it for tests.

Worked example, from the Books command line (Scribe #2494). The ask was to play an audiobook in the background and tail the words being read, with the paragraphs before and after, live and non-interactively.

| What                                                                                     | Layer                  | Where                                              |
| ---------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------- |
| The values a reading of a running Program takes, as a Stream                             | Foldkit core           | `Interaction.follow`                               |
| The paragraph a Transcript marks current, with those around it, as data, lines, and JSON | Foldkit core           | `foldkit/renderers` `transcriptExcerptOf`          |
| What is being read in the player: title, chapter, place, link, excerpt                   | Books core             | `examples/books/core/src/words.ts` `spokenWordsOf` |
| Playback position, the audio port, the transcript port                                   | Transcript Player core | `examples/transcript-player/core`                  |
| A connection that stays open on a topic of a daemon's Program                            | CLI adapter            | `foldkit/cli` Follow, `writeCliFollow`             |
| `books words`, `books follow words --json`, the flags, the line format's transport       | Books CLI adapter      | `examples/books/cli/src`                           |
| The audio a terminal plays                                                               | Service adapter        | `ffplayAudioOutput`                                |

The Books CLI adapter added no books logic: it calls `spokenWordsOf` and prints. A second Client (a caption, a status bar, React) gets the same words from the same function.

Sessions sync what happened, and each Client derives what to show. The sync engine carries the facts (played, paused, sought to a place, navigated) and the place a player reports once a second. The word being spoken, the paragraph, and the highlight are never sent: each Client reads them locally from the Transcript's clock and the stored word times, many times a second. That is what keeps the highlight on the word and the log small. Do not add a Message per word, and do not sync derived state.

Layout is organization first, style on top. Michael, typed 2026-11-17: "start developing a set of components that are core completely generic UI agnostic components that just do the spacing and organization of the content and then we can apply the styling on top of that very compositionally very functionally".

- A screen is built from layout nodes in `foldkit/renderers` that say only how content is arranged: `Column` and `Row` with a `gap`, `Box` with `padding`, `Spacer`, `Dock` (kept in view at the edge), `List` (rows picked as a whole), and the navigation presentations `Sheet` and `Dialog`. They carry no color, font, or pixel width.
- Each painter maps a layout node to its own means: the HTML and React painters to elements with `fk-` class names, a terminal to lines and columns. Styling is applied on top by the painter's stylesheet and the `classNames` a host passes, never inside a Program's screen.
- When a screen needs an arrangement the set lacks, such as a reading measure (a column that fills the window up to a readable width), a toolbar, or a split, add it as a layout node with a painter for every Client, then style it. Do not reach for a class name or a one-off element in a Client to get there.

State drives; the components at the edge are told. Michael, typed 2026-11-18: "Let's get real dark mode light mode working in foldkit/core/theme or style" and "All state driven driving the components at the edge".

- Everything a component shows is state in a core: the appearance, the word being spoken, a search, a hover description, what Contents holds. The view is a pure function of the Model, and the painters at the edge (React and DOM, the terminal) only receive values and draw.
- No component reads the system's dark mode, storage, a context it mutates, or a class it toggles by itself. A fact about the outside, such as the system's mode, arrives through a Subscription as a Message (`SystemAppearance`, `ObservedSystemMode`), update decides, and the painters are told.
- Colors are roles, never literals. `foldkit/theme` holds the roles, each with a light and a dark value; a stylesheet writes `${roleVar('QuietText')}` and a painter with no CSS reads `roleColorsOf(theme, mode)`. Tests fail on a raw color in the shared stylesheets and the Books site, and on a painter that asks the system. If a role is missing, add the role.
- Appearance is a per-device choice and is not synced across sessions, on purpose (decided 2026-11-18 under his "take your best opinions here be tasteful"): a phone in a dark room and a desk in daylight should each keep their own look, and the default, Follow the system, already makes every device right. So `SetAppearance` and `ObservedSystemMode` are local Messages and the state lives in that device's Model. Do not "fix" this by syncing it.
- One exception, written down rather than hidden: a page has to be in the right mode before the Program starts. The host mirrors the mode the Program resolved (`paintModeOnPage`), and the page's first paint reads that mirror with `firstPaintScript()`. The mirror has one writer, the host acting on the Model, and one reader, the first paint; no component touches it, and the Program's own mode replaces it as soon as it starts.

Before you add code, answer these in order:

1. Would a second Client need this fact or behavior? Then it is core. Put it in the domain core when it names the domain, in Foldkit core when it does not.
2. Does it name a terminal, a flag, a process, the DOM, a pixel, or an SDK? Then it is an adapter, and the core must not learn of it. Give the core a port (a Service or the sync engine interface) or a pure reading, and let the adapter fill or print it.
3. Is it background work or anything that stays in sync? It runs in the Background Processor: one running synced Program held by a process the CLI starts on its first command (`listenBackgroundProcessor`; first spelled `listenCliDaemon`, which still works). Commands ask it (Show, Do, Read, Run), follow it (`follow <topic>`), and stop it. Do not start a second kind of background process.
4. Is it interactive (keys, a full screen)? It belongs to the TUI Client, never to a CLI command.
5. Did you find core logic sitting in an adapter, or an adapter concern in a core? Say so, and move it with tests, smallest step first.

## DEATH (temporary house)

`DEATH/` is the Distributed Elm Architecture Teaching Hospital. It is a temporary house for describing and implementing this benchmark and its gambits (wager with upside and downside). It is not Foldkit public API.

- Read `DEATH/README.md` and `DEATH/AGENTS.md` before changing hospital rules, scoring, or naming.
- The name is DEATH. Not DEF. Not ShrinkBench.
- Talk to Grok Bot through `DEATH/mailbox/`. Do not poke Grok Bot PIDs.
- `bench/` is a rehearsal against `https://counter.knophy.com`. It is not DEATH.
- Interview questions live in `DEATH/qanda.md`. Chat asks one at a time.

## Project wiki

`wiki/` is the project's memory: what was said, what was decided, by whom, and why, across calls, chats, DEATH, and ShrinkBench. Full rules: `wiki/AGENTS.md`.

- Consult it before any decision or recommendation about the benchmark, before asking the user a question it may already answer, and whenever recalling past discussions or people. Read `wiki/index.md` first, then only the pages it names.
- Trust order: running code, then decided Q&A records (`DEATH/qanda.md`, ShrinkBench ADR 0001), then wiki pages, then raw sources. Never present a **Said** or **Proposed** claim as decided.
- When the user shares a transcript, chat, or email about the project, ingest it. File syntheses worth keeping under `wiki/analyses/`. Run `python3 wiki/lint.py` after wiki changes.
- Some rules in the DEATH section above are contested by newer ShrinkBench records (name, and whether `DEATH/` is history). See `wiki/open-questions.md` O2 and O3.

When writing or reviewing documentation (TSDoc, module docs), load `.agents/skills/document/SKILL.md` (the `document` skill). Point-Free's libraries (the Composable Architecture, Swift Sharing, SQLiteData) are the quality bar. Shared vocabulary lives in `glossary.md`; define new terms there first. In documentation, comments, questions, and explanations, pair every abstract claim with a concrete example ("mounting composes transitively" must be followed by `/counters/counter/c1`).

## Project Conventions

- "Foldkit" is always capitalized in prose. The only exception is the npm package name (`foldkit`) and import paths.
- In prose, capitalize architecture types: Model, Message, Command, Subscription, Mount, ManagedResource, CustomElement, Submodel, OutMessage, Client, and Processor. Keep lowercase for plain functions: view, update, init.
- A Client is one complete runnable Program adapter. A Processor is one running Program occurrence that consumes Messages and advertises capabilities. One Client can host multiple Processors, including in a headless process with no human-facing renderer.
- Always use Schema types, full names like `Message`, and `withReturnType`. Do not use plain TypeScript types, `Msg`, `as const`, or type casting as substitutes.
- Foldkit is tightly coupled to Effect-TS. Do not suggest solutions outside the Effect ecosystem. Check existing features in `create-foldkit-app` before suggesting new ones.
- Push back on any direction that violates Elm Architecture principles: unidirectional data flow, Messages as facts, Model as single source of truth, and side effects confined to Commands. Flag the issue and propose the idiomatic Foldkit approach.

## Exemplar Files

Read these before writing code. They calibrate the quality bar.

- Library internals: `packages/foldkit/src/runtime/runtime.ts`, `packages/foldkit/src/route/parser.ts`.
- Application architecture: `packages/typing-game/client/src/`, `packages/website/`, and examples built with Foldkit.

Calibrate to the right context: library design when inside `packages/foldkit/src/`, application architecture elsewhere.

## Naming

- Messages are verb-first, past-tense facts: `SubmittedUsernameForm`, `CreatedRoom`, `PressedKey`. Verb prefixes: `Clicked*`, `Updated*`, `Succeeded*` / `Failed*`, `Completed*`, and `Got*` for child Submodel results only.
- Never use `NoOp` Messages. Use descriptive facts even for no-ops: `IgnoredMouseClick`, `SuppressedSpaceScroll`. `Completed*` mirrors the Command name verb-first: `LockScroll` produces `CompletedLockScroll`.
- Commands are verb-first imperatives: `FetchWeather`, `FocusButton`, `LockScroll`.
- Mount Definitions are verb-first imperatives like Commands: `AnchorPopover`, `PortalPopoverBackdrop`, `SyncSidebarScroll`.
- Use names that are immediately understandable in context. Avoid opaque abbreviations and unexplained single-letter names: `callbacks`, not `cbs`; `context`, not `c`; `(tickCount)`, not `(t)`. Conventional technical shorthand is allowed when it is the normal spelling for the domain, including `attrs`, `props`, `args`, `dir`, `ctx`, `fn`, `DOM`, `URL`, and `VNode`. Established API and DSL bindings such as `h` are also allowed. Prefer a more precise semantic name when one exists, such as `toMessage` instead of `f`.
- When computing the next value for a Model field, name the local const `next<FieldName>`. For example, use `nextRoute` for `route`, `nextPeoplePage` for `peoplePage`, and `nextTabs` for `tabs`.
- Do not suffix Command variables with `Command`. The type already says so.
- Prefix `Option`-typed values with `maybe`. Never prefix `T | undefined` values with `nullable`; name them plainly and let the type carry the optionality.
- Prefix booleans with `is`.
- Name functions by their precise effect: `enqueueMessage`, not `addMessage`.

## Sync: Instant only

- Every example shares its state through Instant from the first run, through `Program.compose.sync`. One Instant project carries every app: each log row names its app and its Program version, such as `multiple-counters` at version 1.
- Never ship an example that syncs through a Memory engine, a file tape, `localStorage`, `BroadcastChannel`, or any other per-process or per-tab store. `Runtime.Memory` is a fake for unit tests only.
- When Instant's schema cannot type a Message strictly, wrap the row in an Effect Schema envelope (app, version, tag, payload) that rejects anything else, and evolve the schema. Never fall back to local-only state.
- Every Instant app uses Scribe's schema, permanently, for every app we build, so all the apps are interconnected: a Books title, a Read Aloud page, and a Scribe recording can link to each other's rows. Production is `e7c49961` and dev is `bd40c50a`; both carry that one schema. Never give an app a schema of its own. Add an app's entities to Scribe's `instant.schema.ts` (in `~/Development/instant-scribe-verification/scribe`, currently on branch `agent/claude-opus-5.5/books`), with names that can't collide, such as `libraryItems` for Books and `remindersLists` for Reminders. Coordinate the change with the Scribe agents. Push only from that full schema: a push from a partial copy drops what the copy lacks.

## State Modeling

- Encode state in discriminated unions, not booleans or nullable fields. Use `Idle | Loading | Error | Ok`, not `isLoading`.
- Use `Option` for model fields that represent absence. Do not use `''`, `0`, or `null` as the none state.
- Use `Option` at boundaries where the value will be matched or chained. Simple presence checks do not need it.
- Errors in Commands become Messages via `Effect.catch(() => Effect.succeed(ErrorMessage(...)))`. Side effects should never crash the app.

## Navigation

- Every representable destination in a Program is a Schema sum type. The URL is a projection of that destination, not a second Model and not an event log. See `docs/adr/0003-navigation-as-state.md`.
- Pair parse and print. `parse(print(destination))` equals the destination. `print(parse(url))` is the canonical URL. Test both. This is the Swift Navigation / Point-Free parser-printer contract. Use `foldkit/route` (`oneOfCases`, `schemaSegment`, `query`).
- Drive navigation by state. A Client (browser history, argv, custom scheme) translates a URI into `OpenedNavigation` or `ChangedUrl`. update decides the next Model. Named Commands emit `pushUrl`, `replaceUrl`, or `back`. Do not hand-build paths at call sites when the printer exists.
- Every destination a user can occupy must have a deep link. That includes share states (private, unlisted, public). Private still prints a URI. Access is permissions, not the absence of a link.
- Keep the portable relative URI in core. Each Client adds an origin, scheme, or argv. Do not put tokens, refresh secrets, or PII in a URI. Instant share secrets belong in `ruleParams` (query `s`), not in the path.
- Proofs live in `examples/routing`, `examples/multiple-counters`, `examples/books`, and `examples/cardboard`. Follow `skills/foldkit-navigation/SKILL.md`.

## Code Style

- Use Effect's `Match` instead of `switch`. For tagged unions prefer `M.tagsExhaustive({ ... })` over `M.tag(...)` chains.
- `pipe` is for multi-step data flow. Never `pipe` a single operation; call the function directly.
- In `pipe` chains, put the data being piped on its own line.
- Use Effect module functions over native methods in pipes. Native methods are fine when calling directly on a named variable.
- Import Effect modules by their PascalCase name. Alias with a trailing underscore only when shadowing a needed native global.
- Never use sentinel values to signal absence. Use `Option`-returning helpers such as `String.indexOf`, `Array.findFirst`, and `Option.fromNullishOr`.
- When adding or editing `Option` handling, do not use `Option.match` with `onNone: Function.constVoid`; use `Option.isSome` with an explicit `if`.
- Never use `T[]` syntax. Use `Array<T>` or `ReadonlyArray<T>`.
- Never use bracket array indexing. Use `Array.get`, `Array.head`, `Array.last`, or non-empty variants.
- Use `Array.isEmptyArray` / `Array.isNonEmptyArray`, not `.length === 0` / `.length > 0`. Prefer `Array.match` when handling both cases.
- Never cast Schema values with `as Type`. Use callable constructors.
- Capitalize Schema literal strings: `S.Literals(['Horizontal', 'Vertical'])`.
- Capitalize namespace imports: `import * as Command from './command'`.
- Use `const`. Only use `let` when mutation is truly unavoidable. Always brace control flow.
- Extract magic numbers to named constants.
- Never use nested ternaries. Use `Match.value`, an `if` / `else` chain, or a named helper.
- Prefer explicit `if` / `else` when both branches return. Early return reads as "A is exceptional, B is the default"; reserve it for true guards.
- Use `Readonly<{ ... }>` over per-property `readonly` for inline object types.
- Do not add type annotations or `as const` to callbacks whose return type is constrained by the outer API.
- When using `evo`, pass field transformers point-free when the update depends only on that field's current value. Prefer `entries: Array.map(f)`, `currentStep: toNextStep`, and `priceSlider: Slider.reflectRange(range)` over closures that re-read the same field from the surrounding Model. Use `() => value` when replacing a field with a Message payload, child update result, Command result, or a value derived from another field.
- `Effect.acquireRelease` registers the release only after the acquire body completes. Construct the resource inside the acquire Effect, never before it.

## Comments

Do not add inline or block comments to explain code. If code needs explanation, refactor for clarity or use better names. Comments that do exist always sit on their own line above the code they describe, never trailing to the side on the same line. Exceptions:

- Section headers: `// MODEL`, `// MESSAGE`, `// INIT`, `// UPDATE`, `// VIEW`, `// COMMAND`. One word only.
- TSDoc on all public exports.
- `// NOTE:` comments, with a high bar. Use them only for behavior that would mislead a careful reader.

## View Architecture

- Key mapped list items by a stable Model identifier, never by array position. The same applies to entity keys: when one view function renders different entities at one position (a detail page across slugs), key by the entity id. These are the only keys to write; identity carries everything else.
- Never key branches. Branch identity comes from view functions via the build. When switching a same-tag inline ternary must reset DOM state, extract the arms into named view functions.
- Always build with `@foldkit/vite-plugin`. Without it, branch identity falls back to positional-plus-key semantics and every branch point needs hand-written keys.

## File Organization

- `index.ts` is always a barrel. Real code lives in a named file.
- For a module `foo/`, use `foo/foo.ts` for the code and `foo/index.ts` for the barrel.
- Re-export via `export * from './foo'` and nest children as namespaces via `export * as Child from './child'`.
- Extract Messages to a dedicated `message.ts` when Commands need Message constructors.
- Commands are colocated with the update function that returns them. Never centralize all Commands in one file.
- Expose a `boot()` helper alongside `init()` when a submodel applies a boot-time Message.

## Lifecycle Primitives

Five primitives exist: Command, Mount, Subscription, ManagedResource, CustomElement. Pick by what causes the side effect.

- A Message just dispatched? Command.
- An element exists in the rendered tree, and the factory uses the element to do DOM work? Mount.
- An external event source gated by a Model condition? Subscription.
- Model condition plus Commands need a stateful handle? ManagedResource.
- Rendering a native web component? CustomElement.

If a Mount factory does not read or write its element, re-check the primitive choice. Mount args are captured at mount, not refreshed across renders.

## Reference Repos

`repos/` holds vendored snapshots pulled in as git subtrees, each pinned to the `effect@<version>` release tag that matches `package.json`, not a moving branch, so the reference source always matches what installs and compiles. Re-pin whenever the `effect` dependency is bumped. Read directly when API signatures or behavior matter. Treat these as read-only. Never import from `repos/` in package or example source.

- `repos/effect-smol/`: Effect-TS source. Reference for Effect, Schema, Stream, Match, and Result questions.

## Commits

- Use Conventional Commits. Add `!` after the scope for breaking changes, for example `refactor(schema)!:`.
- Valid scopes: package directories (`foldkit`, `ui`, `devtools`, `create-foldkit-app`, `vite-plugin`, `devtools-mcp`, `oxlint-plugin`, `website`, `typing-game`, `examples-e2e`), example directory names, `skills`, `ci`, and `release`. Never internal module names.
- The `skills` scope means the Foldkit app/plugin skills (`skills/foldkit`, `skills/generate-program`, `skills/audit-program`) and their shipped packaging. Do not use `skills` for repo-maintenance helper skills such as `.agents/skills/commit-changes`; omit the scope if no valid scope fits the whole change.
- Before choosing or amending a commit subject or body, inspect the full
  staged diff or full commit diff with `git diff --cached --stat`,
  `git diff --cached --name-status`, or
  `git show --stat --name-status HEAD`. The message must describe the
  whole change set, not just one file or the most recent edit.
- After any amend that changes files, re-audit the commit body against
  `git show --stat --name-status HEAD` and update it in the same amend
  when the final diff has drifted. Do this even for small follow-ups.
- Do not invent broad scopes such as `tooling` or `infrastructure`. Use the literal valid scopes above.
- Do not co-author or mention AI assistants in commit messages or release notes.
- Use `.agents/skills/commit-changes` when the user asks to create a commit in this repo.
- Squash-merge only. Use `gh pr merge --squash` when merging PRs.

## Editing Rules

When making multi-file edits or refactors, apply changes to all relevant files, not just a subset. After refactoring, verify that spacing, margins, and visual formatting have not regressed.

## Workspace Setup

If `pnpm typecheck`, `pnpm lint`, `pnpm build`, or the pre-push hook surfaces errors like `Cannot find module 'foldkit'`, `Cannot find module 'foldkit/html'`, or unexpected Effect API properties, the workspace itself may be out of sync. Run `bash scripts/cloud-session-setup.sh` to reconcile dependencies.

## Debugging Example Apps

Apps in `examples/` ship with `@foldkit/devtools-mcp` wired up. If the Foldkit devtools MCP tools are available, reach for them before adding logs. See `packages/devtools-mcp/README.md` for setup.

Hosted `*.knophy.com` examples authenticate with Cloudflare Access. See
`examples/AGENTS.md`.

## Communication

- When the user asks a rhetorical, opinion-based, or conversational question, respond with discussion rather than code edits. Only make code changes when explicitly asked.
- When code contains `CLAUDE`-prefixed comments, those are existing agent instructions. Search for them explicitly and address them. Do not remove or skip them.

## Prose Style

- Do not use em dashes in prose. Default to a period and a fresh sentence. Commas, semicolons, colons, or parentheses also work.
- Document and page titles use a spaced pipe (`|`) as the breadcrumb separator, never a dash.
- Never describe our own writing as honest. We are honest by default; labeling it reads as a tell.

<!-- change-log-skill:start -->

## Change log, commits, and build provenance

- Use the global `$change-log` skill for repository changes.
- Inspect Git state first and preserve unrelated work. Stage only explicit
  task-owned paths.
- Commit each coherent verified increment. Do not commit every edit, wait for an
  oversized batch, or leave finished task-owned work uncommitted.
- Use two commits: implementation first; then prepend `CHANGELOG.md` with the
  implementation SHA using `python3 scripts/change-log/record_change.py` and make
  a changelog-only ledger commit. Do not recursively log the ledger commit.
- Every entry uses machine-local human time including seconds, year, and timezone;
  records the commit and subject, change details, files and reasons, short
  verbatim user statements, and a durable SpecStory URI or exact absence reason.
- Capture terminal Codex context with `specstory run codex` or
  `specstory sync codex --local-time-zone`. Public sharing requires explicit
  user authorization. Do not invent SpecStory links for Codex desktop tasks.
- Produce installable or distributable builds only from a clean commit. Run
`python3 scripts/change-log/build_provenance.py` from the real build and compile
or embed its output in the binary. Log the embedded commit, branch, dirty=false,
local/ISO build time, host, source root, and artifact location at startup.
<!-- change-log-skill:end -->
