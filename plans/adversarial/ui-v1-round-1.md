# Adversarial audit | UI v1 | Round 1 | 2026-11-20

Plan under audit: `plans/14-ui-v1.md`. The owner's words:
`plans/user-messages/2026-11-20-ui-v1.md`. Everything here was read from
code and text. Nothing was built or run. One tracker read: `issues show 2568`.

## Verdict

Not acceptable as a v1 yet. The direction holds (one pure rule in core, a
painter that draws and reports), and most of the measured line references
are right. Three things block the first slices:

1. The contract defines only the half `TranscriptFollow` proves, the state
   that lives in a runner. The half where state lives in the Model has no
   definition and no worked example, and the test that picks between the two
   gives answers the code already contradicts in three places (U1-01).
2. Slice 2 replaces a different rule, not a copy. The Words page keeps
   follow in its Model, by section, with a live edge and a Back to Playhead
   button. `TranscriptFollow` can express none of that, and the owner said he
   was lost on exactly this change (U1-02).
3. Slice 1 says "Books declares Library and Profile as tabs" and stops. Which
   Destination belongs to which tab, what the addresses become, where the
   player opens from Profile, and what happens to `ShowProfile` as an Action
   and as logged rows are all unsaid (U1-03).

This round has 21 findings: 3 Blocker, 11 Major, 7 Minor.

Severity: Blocker means a slice cannot start, or the contract would be
rebuilt after it lands. Major is a rule or text the plan must add, a false
premise, or one of the owner's asks narrowed without saying so. Minor is a
gap, a drift, or a count.

| Id    | Severity | One line                                                                                                              |
| ----- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| U1-01 | Blocker  | The Model half of the contract is undefined, and the state test contradicts Books and Words in three places           |
| U1-02 | Blocker  | Slice 2 swaps the Words follow rule for a different one and moves its state out of the Model                          |
| U1-03 | Blocker  | Slice 1 does not say what Books' tabs are: addresses, tab membership, the player, `ShowProfile`, restore              |
| U1-04 | Major    | A tab switch on the phone's current carrier unmounts the tab, and the plan contradicts plan 04 while saying it stands |
| U1-05 | Major    | `SelectedTab({ tab })` is relative to one device's state, which ADR 0012 decision 3 exists to avoid                   |
| U1-06 | Major    | "Blocks, then parts" defines no part, the exemplar painters import the rule, and the trace test cannot fail           |
| U1-07 | Major    | The generic `Ports` claims are false for the exemplar, for a terminal, for the phone, and for focus                   |
| U1-08 | Major    | Nothing stops a behavior landing in a painter again, and the lint's first claim is false today                        |
| U1-09 | Major    | The measured table leaves out the Svelte painter and the half of the Words rule that lives in core                    |
| U1-10 | Major    | Agent UI actions are called facts, cannot reach another Client, and Books' Catalog already mixes the two lists        |
| U1-11 | Major    | "Publish your Model and screen" would publish state Books keeps off the log on purpose                                |
| U1-12 | Major    | Slice 8 has no target: the screen tree has no node for tabs, menu or dialog, and the widgets hand out `Html`          |
| U1-13 | Major    | A third machine contract beside the two the repo already has                                                          |
| U1-14 | Major    | Four of the owner's asks are narrowed without saying so                                                               |
| U1-15 | Minor    | Five measured behaviors have no block, three blocks have no slice and no user, and slice 6's proof is false           |
| U1-16 | Minor    | Fact, Port, Instruction and part already mean something else here                                                     |
| U1-17 | Minor    | Five counts are off                                                                                                   |
| U1-18 | Minor    | The exemplar's State uses a sentinel that JSON cannot carry, and `Behavior` carries no Schemas                        |
| U1-19 | Minor    | "Slices 1 and 2 share no file" is unchecked and false for at least one file                                           |
| U1-20 | Minor    | Lines no test could prove wrong                                                                                       |
| U1-21 | Minor    | The tier table changes two tiers while saying no modification is assumed, and re-asks an answered question            |

## U1-01 | Blocker | The Model half of the contract is undefined, and the state test contradicts Books and Words in three places

**Claim.** Plan lines 106-114: state lives in the Model or in the runner by
one test, "would a second Client, a replay, or an agent need to see it?".
For Yes, "`step` is called by `update`; instructions become Commands and
fields on the screen tree". Examples of Yes: "whether a menu is open, which
row is highlighted". Examples of No: "a seek bar's drag in progress".

**Evidence.**

- The test joins three audiences that answer differently. Books keeps a
  title's menu in its Model and hides it from a second Client on purpose:
  "a book's menu on the shelf, so a long press on a phone opens nothing on a
  desk" (`examples/books/core/src/program.ts:148-149`). The Messages are
  local only (`:159-166`), the field is kept across a refold (`:206`) and
  cleared on restore (`:224`). So the plan's own Yes example is a No for "a
  second Client" and for "a replay" of the log, and a Yes only for an agent
  on that device. The table has two homes. The code has three: logged in the
  Model, device-owned in the Model, and held by a painter.
- Words keeps a seek drag in its Model: `scrub: Scrub`, with
  `Scrubbing({ seconds })` (`examples/words/core/src/model.ts:120-124, 256`).
  The plan's table puts "a seek bar's drag in progress" in the runner.
- Words keeps follow in its Model: `follow`, `playheadVisibility`
  (`model.ts:78, 87, 253-254`). The plan's proof keeps follow memory in the
  runner. See U1-02.
- The blocks table (lines 126-138) has no home column. `listFilter` and
  `fieldDraft` change what is painted (the rows shown, the text shown), and
  the phone's comment says "What is typed lives here ... the Program hears
  nothing until a row is pressed"
  (`packages/react-native/src/interaction/list.tsx:373-378`). By the plan's
  test an agent reading the screen needs both, since the tree it reads
  still lists every row. AGENTS.md line 42: "Everything a component shows is
  state in a core". The plan does not say which way these two go.
- `step` takes `context.nowMs`. `update` is pure and reads no clock. In this
  repo time reaches `update` inside the Message (`MarkedMoment({ wallClockMs })`,
  `examples/books/core/src/update.ts:1076`). The plan does not say who
  stamps a behavior's fact when `update` is the caller.
- A fact that `update` receives must be a Message of the Program. Books
  classifies every Message by hand in one exhaustive match
  (`program.ts:18-139`) and lists local ones in `isLocalOnlyMessage`. The
  plan does not say how a block's facts enter a Program's Message union,
  what category they get, or that they are local by default. If "which row
  is highlighted" is a logged Navigation Message, each arrow key is a row in
  Instant and moves the highlight on every mirrored device. AGENTS.md line
  32: "Do not add a Message per word, and do not sync derived state."
- "Instructions become Commands" works for a timer. `@foldkit/ui`'s menu
  already does it: `DelayClearSearch` sleeps 350 ms and answers with a
  Message (`packages/ui/src/menu/index.ts:386-391`). It has no mechanism for
  an instruction aimed at a painted part. The menu's `FocusItems` is
  `Dom.focus(selector)` (`:342-347`), which is the DOM. In a screen-tree
  Program a Command runs in the runtime with Services from the start
  Layers, and the element or ref lives inside one painter's component. No
  Service joins the two today. The only bridge is a field on the tree, such
  as `focusToken` (`packages/foldkit/src/renderers/types.ts:447`), and a
  one-shot instruction written as a field fires again on a refold, on
  restore, and on a mirrored device unless something says otherwise.
- A placement that goes measure, Message, `update`, field paints one frame
  late. The React painter places in `useLayoutEffect` to avoid that
  (`packages/react/src/paintReact/paintReact.tsx:928`). So `placement`
  cannot be Model-homed, and the plan does not say so.
- `TranscriptFollow` proves the runner row only. No slice before 5 runs a
  rule from `update`. A Model-homed rule already exists in core
  (`packages/foldkit/src/actionMenu/`) and in `@foldkit/ui`'s menu. The plan
  cites neither.
- State in a runner is invisible to DevTools, Scene tests and the
  `foldkit_*` MCP tools the repo says to reach for first (CLAUDE.md,
  "Debugging Example Apps"). The plan does not weigh that.

**Fix.** Replace the one test with an ordered one and add the third home.
For example: (1) Does anything painted, or anything an agent reads, depend
on it? Then it is in the Model. (2) Should a mirrored device or the log see
it? Then it is logged; else it is device-owned, with its `isLocalOnly`,
`keepOnRefold` and `projectLocal` derived from the block's declaration, not
typed per Program. (3) Is it only memory of timing or measurement that
never changes the tree (the quiet second, the press timer)? Then the
runner. Add a home column to the blocks table and apply it to all eleven.
Say how a fact gets its time, how a block's facts join a Program's Message
union, and which Service carries a part-aimed instruction on React, the
phone and a terminal. Name one Model-homed exemplar and run it on two
painters before slice 4.

**What would change my mind.** A table that gives all eleven blocks a home,
with the Books menu, the Words scrub and the Words follow each landing where
the code has them or with a stated reason to move, plus one Model-homed rule
shown end to end: fact with its time, `update` calling `step`, the Command,
and the painter on a non-DOM Client.

## U1-02 | Blocker | Slice 2 swaps the Words follow rule for a different one and moves its state out of the Model

**Claim.** Plan line 250: "The Words page follows the voice through
`TranscriptFollow`; its own copy is deleted", proving "the last copy of the
first rule is gone". The measured table counts the Words copy at
`mount.ts:27` and `:873`.

**Evidence.**

- The Words rule is mostly in Words core, not in `mount.ts`. The Model
  holds `follow: 'Following' | 'Detached'` and
  `playheadVisibility: 'OnScreen' | 'OffScreen'`. `followCommands` returns
  `ScrollToSection` Commands when the followed section changes
  (`examples/words/core/src/update.ts:1293-1301`). A Mount reports
  `ChangedPlayheadVisibility` (`examples/words/foldkit/src/mount.ts:37-108`),
  and `update` folds it (`update.ts:3499-3512`). This is the plan's Yes row,
  already built. Slice 2 moves it to the No row.
- It does four things `TranscriptFollow` cannot say:
  1. It follows by section, not by word (`bringsIntoView` fires when the
     mark crosses into a new section, `examples/words/core/src/playbackClock.ts:153-160`).
  2. It follows the live edge of a recording in progress with its own
     placement: `placementOf` returns `'LiveEdge'` or `'Center'`
     (`update.ts:903-904`). `TranscriptFollow` has `BringToMiddle` only.
  3. It follows again by itself when the section comes back on screen
     (`update.ts:3508-3510`). `TranscriptFollow` has `PressLeave` and no
     fact for coming back.
  4. It shows Back to Playhead only while detached and off screen
     (`isReturnShownOf`, `update.ts:910-911`). That button is in the screen,
     so an agent and a replay see it. It reads `playheadVisibility`, which
     `TranscriptFollow` never reports to anyone.
- It measures against the page's own bars: 64 px at the top and 168 px at
  the bottom (`mount.ts:27-28, 84`). `TranscriptFollow` uses the middle half
  of the view (`transcriptFollow.ts:28-30`).
- The page already paints the shared reader and leaves the shared follow off
  on purpose: it omits `clock`, `leaveAction` and `focusToken`, "which would
  start the painter's own follow beside it"
  (`examples/words/foldkit/src/view/transcript.ts:289-309`).
- The owner, reading the earlier description of this change: "moving it
  changes how the page scrolls by word instead of by section and it stops
  following only yeah what are you talking about here sorry i'm a little
  lost". The plan gives the change one line and does not list what the
  listener will see differently.
- A copy of the first rule stays after slice 2 either way: the Svelte
  painter (U1-09).

**Fix.** Write slice 2 as a list of what the listener sees before and after,
and get the owner's yes to it. Then choose: extend `TranscriptFollow` first
(a followed unit of word or section, a live-edge placement, a `Returned`
fact, a clearance in `Context`), with `follow` and `playheadVisibility`
staying in the Words Model as what the Program says; or leave Words' rule
where it is and say why a Model-homed follow is right for Words and a
runner-homed one for Books. Under the plan's own table the first reading is
the consistent one.

**What would change my mind.** A before and after of the five behaviors
above, and a statement of which Words Model fields and Messages survive
(`follow`, `playheadVisibility`, `ScrolledTranscriptAway`,
`ChangedPlayheadVisibility`, `ClickedReturnToPlayhead`, `ScrollToSection`).

## U1-03 | Blocker | Slice 1 does not say what Books' tabs are

**Claim.** Plan lines 186-189: "`Tabs = { selected, stacks }`,
`SelectedTab({ tab })` ... Books declares Library and Profile as tabs;
`ShowProfile` and `ShowLibrary` become `SelectedTab`."

**Evidence.**

- Addresses. Profile is a page above the library today, at `/books/profile`
  (`examples/books/core/src/routes.ts:111-114`), and a title is at
  `/books/the-lantern-keeper/listen`. Plan 04 lines 207-208: "The URI names
  the active tab by its slug and prints the active stack". If Library gets a
  slug, every shared place link and every stored address changes, and the
  59 generated Expo route files with them. If it gets none, the plan must
  say so, since plan 04's example gives every tab one. AGENTS.md line 168:
  "Every destination a user can occupy must have a deep link."
- Membership. Plan 04 line 203: "one typed stack per tab, so an
  `AccountDetail` cannot sit in the dashboard's stack". Books has pages
  allowed above either home: the Audible pages sit "above the library or the
  profile" (`routes.ts:84`, `isHome` at `:142, 147`), and both
  `/books/audible` and `/books/profile/audible` have route files. The plan
  does not say which tab's Destination type holds them.
- The player. The Dock shows on the library and the profile and holds "what
  is playing, a press away from its player"
  (`examples/books/core/src/screen.ts:573-577`). `OpenPlayer` sets the stack
  to library, title, player. From the Profile tab it must either switch
  tabs or push a title into Profile's stack. Unsaid.
- The shell is not only a tab bar. `dockOf` is
  `Dock(...nowPlayingOf(model), tabsOf(model, current))`. A shell "named
  once by the declaration" has to carry a Model-dependent now-playing row,
  and it shows on two pages, not on the player (`type Tab = 'Library' |
'Profile' | 'Neither'`, `screen.ts:523`). The plan does not say where the
  shell is hidden.
- `ShowLibrary`, `ShowProfile` and `ShowReadAloud` are Catalog Actions with
  `what`, `why`, a label and `mutates: [at.navigation.pages,
at.navigation.maybeModal]` (`examples/books/core/src/message.ts:523-551`).
  The terminal's commands, the menu rows and the agent tools are derived
  from them (AGENTS.md, "Declare once; derive everything"). Plan 04 line
  211 makes `SelectedTab` "a Navigation Message". If the Actions go, three
  derived commands go with them. If they stay, they are not `SelectedTab`.
  `ShowReadAloud` is a third home-level Action the plan does not mention.
- Logged rows. Books is `version: 1` (`program.ts:181-182`), `ShowProfile`
  is category Navigation (`:55`), so rows with that tag are in the log.
  ADR 0013 decision 7: "an old row must decode into the current Message
  union". The plan does not say whether the tags stay as an upcast or the
  version moves.
- Restore. Books restores device state on reopen (`e15a0b66d`,
  `projectLocal` at `program.ts:209`). README decision 16: "inactive stacks
  neither sync nor survive a reload (proposed)". A phone that restores its
  Model keeps every tab's stack. A browser that reloads from the address
  keeps one. The plan picks neither.
- Everything that reads one stack: `Navigation.composeNavigation` with
  `stack: Navigation.fieldLens` (`examples/books/core/src/navigation.ts:124-154`),
  `Session.compose` and `ActionMenu.compose` (the `/menu` and `/session`
  routes above every page), `printStack`, `parseStack`, the carrier plan,
  `frameOf`, and `terminalFocus`, keyed by the page's address. 26 source
  files outside tests name `NavigationStack`. "The smallest Tabs" still
  passes through each.

**Fix.** Add a Books section: the tab declaration as code; the address of
every existing page before and after (the route round-trip test,
`routesRoundTrip.test.ts`, is the place to pin it); the rule for a page
both tabs may hold; what `OpenPlayer` does from Profile; where the shell
shows; what happens to the three `Show*` Actions and their rows; what a
reopen and a reload each restore.

**What would change my mind.** That section, with no address of an existing
page changing, or with the owner's yes to the ones that change.

## U1-04 | Major | A tab switch on the phone's current carrier unmounts the tab, and the plan contradicts plan 04 while saying it stands

**Claim.** Plan lines 182-184: "Plan 04's `Navigation.tabs` and
`Shell.tabBar` stand". Lines 194-197: "v1 fixes tabs on the stack the phone
already has: one tab's stack is shown at a time, and a tab switch replaces
it without a push animation or a back chevron."

**Evidence.**

- Every Program move on the phone is `ref.resetRoot(...)`
  (`packages/react-native/src/reactNavigation/stack.ts:185`). A tab switch
  changes the root entry's key from `/books` to `/books/profile`, so the
  native stack drops the library's screens. Today Profile is pushed over
  the library, so the library stays mounted and keeps its scroll place. After
  this fix, Library to Profile to Library remounts the library at the top.
  Everything the plan's No row keeps in a runner goes with it: a list's
  filter text, a field's draft. A real tab bar keeps each tab's views
  alive. The fix trades a wrong animation for lost state, and the plan does
  not say so.
- Plan 04 line 216: "React Navigation maps to a tab navigator with one
  `FoldkitStack` per tab". Plan 14 uses no tab navigator. Plan 04 line 199:
  `{ active, stacks }`. Plan 14: `{ selected, stacks }`. Plan 04 has
  `switchWhileModal`. Plan 14 drops it and adds "selecting the tab you are
  on returns it to its root", which plan 04 does not have. These are three
  changes to a plan said to stand.
- Plan 04 is "Status: Proposed. Design only", and its tab decision is open
  (its decision 1; README decision 16, "proposed"). CLAUDE.md: "Never
  present a **Said** or **Proposed** claim as decided."
- "The phone draws it outside the stack so it does not slide" (line 191).
  `FoldkitRouterStack` renders one `<Stack>`
  (`packages/react-native/src/expoRouter/foldkitRouter.tsx:114-119`) and
  each entry paints "its docks at the bottom edge" inside its own screen
  (`reactNavigation/entryView.tsx:55`). A bar outside the stack must hide
  on the player, lift with the keyboard (today the Dock's job, plan table
  row "Dock spacing and the phone keyboard lift"), and sit under sheets.
  Whether a native modal covers a view outside the stack on Android is not
  checked, and `expoHost` ships `ExpoAndroid`
  (`examples/books/expo/src/startExpoBooks.ts:62-65`).
- Back is unsaid on three carriers: the Android back button on Profile's
  root (today it returns to the library, since Profile is a push), the
  browser's Back after a tab switch (is a switch a history push or a
  replace), and Escape in the terminal.
- Open decision 1 proposes "a thin driver that pushes and pops by diff ...
  the shape of swift-navigation's `NavigationStackController`". The carrier
  already has that shape: `runCarrier` "diffs the carrier against the plan
  by key" through `keyedStackDriver` (ADR 0012 decision 5). What React
  Navigation supplies is the native stack view, the header, the swipe, and
  Expo Router's linking. The decision does not list what a driver over
  `react-native-screens` would have to rebuild, so the owner cannot weigh it.

**Fix.** State the cost of the proposal: what unmounts on a switch, and
either keep both tab roots mounted (two stacks side by side, one hidden) or
accept the loss in writing. Mark each departure from plan 04 as a change to
plan 04. Say what Back does on each carrier. In open decision 1, list what
React Navigation gives today and what the driver would rebuild.

## U1-05 | Major | `SelectedTab({ tab })` is relative to one device's state

**Claim.** Plan lines 186-188; plan 04 lines 211-214: "`SelectedTab` is a
Navigation Message. Under Mirror it mirrors like any other, and a peer that
never had the stack behind that tab shows that tab's root".

**Evidence.**

- ADR 0012 decision 3: "`NavigatedBack` names the entry it returns to, so
  applying it twice, or after a remote push, still lands on `/counter`."
  `SelectedTab({ tab })` names no entry. What it shows depends on the stack
  each device kept behind that tab.
- Under Mirror: device A is on Library at title, player. Device B joins
  while A is on Profile, so B's Library stack is its root. A selects
  Library. A shows the player at `/books/<slug>/listen`. B shows `/books`.
  Mirror promises one screen.
- "Selecting the tab you are on returns it to its root" makes one Message
  mean two things by the receiver's state. A mirrored `SelectedTab(Library)`
  that was a plain switch on the sender is a pop to root on a peer already
  on Library.

**Fix.** Carry the result, as the two existing facts do: the tab and the
address it lands on, or express a switch as `OpenedUri`. Make return to
root its own Message. Add the Mirror case above as a test.

## U1-06 | Major | "Blocks, then parts" defines no part, the exemplar painters import the rule, and the trace test cannot fail

**Claim.** Plan lines 143-145: "A painter implements a fixed set of ports
once. It never imports a specific behavior's rule." Lines 239-240: "One
trace test per block, run against every painter with fake ports: the same
facts in must give the same instructions out on each." Lines 11-12: "A
painter draws, and reports what happened. It decides nothing."

**Evidence.**

- The section titled "Blocks, then parts" defines a block and never a part.
  There is no shape for how blocks compose into a menu (`layers`,
  `rovingFocus`, `typeahead`, `placement`, `longPress`), how one block's
  instruction becomes another's fact, how their states sit together, or how
  state projects onto the tree. The agent surface is "derived from the
  part's declaration" (line 210), which does not exist.
- The owner read the earlier answer aloud and agreed: "take the pure step
  function, type parts, and prop getters as a projection. And we can improve
  those ideas and make them more ergonomic". And: "each part declares its
  role focus style press and keys as data and core writes the ARIA". The
  plan keeps the step and drops typed parts and prop getters. "ARIA tables"
  appear once (line 117) and in no slice. The skill lists both as things to
  take (`skills/foldkit-screens/SKILL.md:112-114`).
- In the proof, every painter imports the rule and chooses its facts:
  `packages/foldkit/src/renderers/htmlEdge.ts:5, 434`,
  `packages/react/src/paintReact/paintReact.tsx:20, 1052`,
  `packages/react-native/src/interaction/transcript.tsx:5, 763`.
- They choose differently. The HTML edge tells `ScrolledByReader` on wheel
  and touchmove and `ScrolledView` on scroll (`htmlEdge.ts:479-500`). The
  phone tells `ScrolledByReader` only (`transcript.tsx:804-806`). The HTML
  edge tells `ChangedSpokenWord` when following turns back on
  (`htmlEdge.ts:475-477`). The phone tells it on any change of the word or
  of `isFollowing`, and again when the passage is laid out
  (`transcript.tsx:817-819, 844-846`).
- So the trace test is true by construction. Each painter calls the same
  `start`, which calls the same `step`. The same facts in give the same
  instructions out because it is one function. What differs between
  painters is which facts a wheel, a finger or a layout pass produces, and
  the test does not look there.
- Painters decide things today, in the proof. The phone keeps a retry rule:
  up to 5 jumps, 120 ms apart, with its own timer
  (`transcript.tsx:460-462, 741-750, 858-864`). The HTML edge decides that a
  click that ends a text selection is not a press (`htmlEdge.ts:325-331`)
  and that a mouse never long-presses (`:228`). The plan gives no line
  between a rule and platform mechanics, so "decides nothing" cannot be
  checked.
- Where the platform already holds the rule, the plan is silent. The phone
  long-presses through React Native's own recognizer
  (`transcript.tsx:314`, `list.tsx:200`), so the 500 ms and the 10 px are
  not the block's there. Words traps focus with `<dialog>.showModal()`
  (`examples/words/foldkit/src/mount.ts:115-155`) and dismisses a row menu
  with the popover API (`:157-173`). "A painter with no such thing answers
  plainly" (line 162) covers a missing capability, not a native one.

**Fix.** Define the part: its blocks, its named slots, the platform events
each slot turns into which fact, and the projection from state to the
fields a painter reads (role, keys, pressed, current). That is Zag's
`connect` and the UI SDK's `slots` with `on` and `attrs`. Then a painter
can host any part without importing its rule, and the trace test can be
the useful one: the same person's action (a wheel, a hold, an Escape) on
each painter gives the same facts. State the line between rule and
mechanics, for example: a number with a unit of time, distance or count, or
a branch on what the person meant, is a rule. Say what a painter does when
the platform recognizes the gesture itself: reports the outcome as one fact
(`HeldLong`) and the block's timer rule is skipped there, in writing.

## U1-07 | Major | The generic `Ports` claims are false for the exemplar, for a terminal, for the phone, and for focus

**Claim.** Plan lines 147-164: the six-port type; "`TranscriptFollow`'s five
ports are a special case of these"; "A terminal ... has no rects, so
`measure` answers `None` and `placement` returns its default"; the set "is
extracted when the second and third behaviors land".

**Evidence.**

- Not a special case. `TranscriptFollow.Ports` has `told`, which reads what
  the Program says now (`transcriptFollow.ts:292`). The generic set has no
  way to read it. The generic set has `wait`. `TranscriptFollow.start` takes
  none and calls `setTimeout` itself (`:343-346`). Its `measure` answers a
  `Sight`, a word against its scroll view in one unit (`:19-24`), not a
  `Rect`, and takes a purpose, not a `PartKey`.
- A terminal has rects. Every laid-out box has `x`, `y`, `w`, `h` in cells
  (`LayoutBox`, `packages/foldkit/src/renderers/types.ts:644-651`), and
  hotspots have `row`, `col`, `width`, `height`. It also needs to keep the
  current row in view: ADR 0014 records frames "up to 325 lines tall in a
  40-row terminal" with the highlight out of sight. The skill's checklist:
  "an overlay drawn as a stacked Column is a lie about z-order".
- On the phone `bringIntoView` cannot return nothing. A word in a passage
  not laid out has no place, and the painter jumps near it and asks again
  (U1-06). With a `void` port that retry stays a rule in the painter.
- `focus(part)` means three things. Radix's roving focus moves the
  platform's focus (`roving-focus-group.tsx`, the plan's cited source). The
  plan's table puts "which row is highlighted" in the Model. `@foldkit/ui`
  keeps focus on the container and the highlight in the Model
  (`aria-activedescendant`, `packages/ui/src/menu/index.ts:835`). A terminal's
  focus is state a host holds (`TerminalFocus`,
  `packages/foldkit/src/interaction/terminalFocus.ts:21-32`), not an effect.
  The phone has no focus for a row. If real focus roves and the Model also
  holds the highlight, a person's Tab or click changes the platform without
  telling the Model, which is the echo problem ADR 0012 context 1 names for
  carriers.
- `PartKey` is undefined. A Transcript paints thirty thousand words with
  one listener and no handle per word (`htmlEdge.ts:283-285`), so a registry
  of parts by key is not free on React or the phone.
- `press: (token: string)` with `SeekTo:<value>` joined in
  (`paintReact.tsx:323-325`) is what the skill rejects: "`${token}${value}`
  concatenation to smuggle payloads; payload belongs in a typed field"
  (`SKILL.md:214-215`).
- The three behaviors the set is extracted from are one scroll rule, one
  pure function with no state, facts or timers (`placement`, by the plan's
  own row), and one the phone does natively (`longPress`). None has focus,
  keys, or Model-homed state. The set is called generic in slice 4, one
  slice before `layers` and `focusScope`.

Is "after three behaviors" a plan or an evasion: deferring the list of
ports is sound. Asserting properties of the result before it exists is the
problem. Three such assertions are in the text and each is false today.

**Fix.** Drop the three assertions or make them true. Extract the set after
`focusScope` and one Model-homed block, not before. Pick active-descendant
semantics (focus stays put, the highlight is Model state) or real roving
focus, and say what the phone and a terminal do. Give `bringIntoView` an
answer. Type `press`.

## U1-08 | Major | Nothing stops a behavior landing in a painter again, and the lint's first claim is false today

**Claim.** Plan lines 224-238: the behavior folder and `transcriptFollow.ts`
"may not import `foldkit/html`, React, React Native, or name `document`,
`window`, or a timer. True today, enforced from the first commit";
`packages/ui/src/**` gets an import ban with "a checked-in list of the files
that still do. The list may only shrink"; an `AGENTS.md` beside each painter.

**Evidence.**

- False today. `transcriptFollow.ts` calls `clearTimeout` and `setTimeout`
  at lines 343-346 and 359. `no-restricted-globals` on the first commit
  fails on the exemplar.
- The built-in rules can do most of it. oxlint 1.70.0 is installed and its
  schema lists `no-restricted-imports`, `no-restricted-globals` and
  `no-restricted-properties`. Per-folder overrides are already in
  `.oxlintrc.json`. Not checked by a run: whether `patterns` and
  `allowTypeImports` behave as ESLint's do.
- The import list has holes. `import { Html, Mount, Dom, Render, File,
Renderers } from 'foldkit'` passes it, since the root barrel exports all
  six (`packages/foldkit/src/index.ts`), and Words already imports `Mount`
  that way (`examples/words/foldkit/src/mount.ts:2`). `foldkit/renderers/html`,
  `foldkit/customElement`, `foldkit/scene` and `foldkit/story` are not
  listed. `packages/ui/src` names `document.` or `window.` in six files
  outside tests, and the ban on those names covers the behavior folder only.
- Nothing runs the lint here. `pnpm lint` is in the pre-push hook, and "An
  install in this fork writes no git hooks" (AGENTS.md line 262). CI runs on
  `main` and on pull requests to it (`.github/workflows/ci.yml:3-9`); this
  work is on `feat/sync-snapshots`. "Passes on the M5" (line 244) names no
  command.
- The ratchet holds for new files only. A listed file is exempt whole, so a
  new widget added inside one, or more `Html` in one, passes. Nothing makes
  the list shrink, and open decision 2 may leave 21 widgets on it. The
  owner: "let's create linters for packages UI that make them JavaScript
  framework agnostic and only use core fold kit primitives etc and then get
  rid of the fold kit HTML".
- The failure that started this was a rule added to a painter. The owner:
  "what did you miss in the skills files and where could we have put skills
  files to instruct any agents yourself included ... is that not clear from
  the documentation". The lint guards a folder nobody broke and a package
  the three apps do not import. The painters get a prose file. Prose is
  what failed: AGENTS.md line 50 already says "Would a second Client need
  this fact or behavior? Then it is core", and the skill says "A second
  painter that reimplements a rule ... has left the architecture"
  (`SKILL.md:171-173`).
- A mechanical guard is available in this repo's own style. The plugin has
  per-folder rules (`foldkit/no-raw-page-check` runs on `packages/*/src`),
  and tests hold rules elsewhere (`examples/books/cli/src/declared.test.ts`).
  The painters hold countable state today: `paintReact.tsx` has 9
  `useState`, 16 `useRef` and 4 timers; `htmlEdge.ts` 3 timers and 15
  listeners; Words' `mount.ts` 9 timers.

**Fix.** Give the runner a `wait` port so the behavior files hold no timer,
then the claim is true. Add the painter ratchet: a checked-in count per
painter file of timers, held state and unit-bearing constants, a test that
fails when a count rises, and a rule that a slice lowers the counts of what
it replaces. Count imports and DOM names in `packages/ui`, not files. Ban
the root-barrel names. Name the command that is the gate and where it runs.

## U1-09 | Major | The measured table leaves out the Svelte painter and the half of the Words rule that lives in core

**Claim.** Plan lines 38-58: "Fifteen behaviors live in painters", with a
count of copies each; line 238: "A block is not done until every copy it
replaces is gone"; line 262 leaves out "the Svelte painter's own follow
rule".

**Evidence.**

- `packages/svelte/src/interaction/` is a painter with its own copies:
  follow with `userScrollQuietMs = 4000` and its own middle check
  (`TranscriptView.svelte:12, 44`), a seek bar (`SeekBar.svelte`), a text
  field (`TextField.svelte`), the copy timer (`CopyButton.svelte:8`, the
  same 1500 ms as `paintReact.tsx:110`), the current row in view
  (`PaintTree.svelte:56`), and focus (`presentedFocus.ts`). The table counts
  none. "Copy feedback timer: 1" and "Keep the current row in view: 1" are
  each 2. "Follow the voice: 2" is 3.
- Counter, one of the three apps in scope, has Svelte and OpenTUI Clients
  (`examples/counter/svelte`, `examples/counter/opentui`).
- The "not in v1" list exempts Svelte's follow from the plan's own rule 3
  and makes slice 2's proof false. It names follow only, not the other five.
- The Words follow is counted at two lines of `mount.ts`. Its rule is in
  `examples/words/core/src/update.ts` and `playbackClock.ts` (U1-02).
- "Books, Counter and Words rely on all of them" (line 39). Counter has no
  transcript, seek bar or list filter.

**Fix.** Add a column per painter, Svelte and OpenTUI included, and a row
per app saying which Clients v1 covers. Either bring Svelte under each
slice or say it is frozen and exempt from rule 3 and the ratchet, by name.

## U1-10 | Major | Agent UI actions are called facts, cannot reach another Client, and Books' Catalog already mixes the two lists

**Claim.** Plan lines 208-211: "An agent's actions on a part are UI actions,
and they are the part's own facts: open, highlight next, select ... Domain
actions stay where they are, in the Program's catalog ... The two are never
mixed in one list."

**Evidence.**

- "Open, highlight next, select" are imperatives. The contract says "Facts
  are past-tense" (line 93), and the glossary: an Action is "a Message a
  person or an agent causes on purpose", a Fact one "a Command or a
  Subscription produces" (AGENTS.md line 138). An agent that sends
  `PressedArrowDown` is forging an input. The plan needs the part to
  declare Actions, which its contract has no place for.
- They cannot be delivered to another Client. For a runner-homed block the
  state and `tell` are inside one painter on one device. For a Model-homed
  one the Messages are local only by Books' own rule (U1-01), so they never
  reach the log. Slice 7 adds a read of another Client and no directed
  write. So in v1 an agent can press a part on its own Processor only. The
  plan should say so.
- The lists are mixed today. `ShowTitleMenu`, `CloseTitleMenu`,
  `ShowWordMenu`, `CloseWordMenu`, `ExpandControls`, `CollapseControls`,
  `ShowSearch` and `CloseSearch` are Books Messages
  (`examples/books/core/src/program.ts:32-50, 70-71`), and they are Catalog
  Actions: `ShowTitleMenu` and `CloseTitleMenu` (`message.ts:235, 250`),
  `ExpandControls` and `CollapseControls` (`:499, 511`), `ShowWordMenu`
  (`examples/transcript-player/core/src/message.ts:462`). The plan does not
  say they move, or how `books actions --json` changes.
- The owner: "I don't like associating the like what what component ha what
  agent actions are listed in every component we want to make sure that
  those are UI related and not domain related Yeah, our catalog already does
  this". One reading is that he does not want a list per component at all,
  since the Catalog already serves agents. The plan keeps a list per part
  and does not record which reading it took.

**Fix.** Let a part declare Actions (plain verbs) beside its facts, and
derive both the keys and the agent's tools from that declaration. Say
whether Books' eight UI Actions leave the Catalog. Say in the text that
acting on another Client's part is not in v1, or add the directed request.
Put the owner's sentence to him as a question with the two readings.

## U1-11 | Major | "Publish your Model and screen" would publish state Books keeps off the log on purpose

**Claim.** Plan lines 216-220: "a request any Processor can make of one
other: 'publish your Model and screen', answered into a per-Processor
snapshot row that rotates"; measured claim 5: "No Processor publishes its
own Model, place or screen".

**Evidence.**

- Books keeps Audible's Messages local "so a pasted sign-in address never
  leaves" (`examples/books/core/src/program.ts:142-146`). The whole Model
  includes `model.audible`. Writing it to Instant on request sends what the
  design keeps home. The plan does not say which projection is published.
  `projectLocal` and `projectDomain` exist (`:193, 209`); neither is named.
- "Any Processor can make of one other" has no rule for who may ask. Round
  4 raised this for offers: "anyone who joins its room can ask for one and
  read it" (R4-07). The same hole, reopened without a reference.
- Presence already exists. `InstantProcessorPresence` carries `clientId`,
  `processorId`, a `descriptor` and `lastSeenAtMs`, published to a room
  (`packages/instant/src/schema/schema.ts:418-426`,
  `packages/instant/src/processorRoom/processorRoom.ts`). Only
  `examples/instant-counter` uses it. The plan proposes "a small row: who it
  is, where it is, and when" without saying whether it extends this or sits
  beside it. A stable half of the identity exists too:
  `processor: host, instance: newProcessorInstance()`
  (`examples/books/expo/src/startExpoBooks.ts:245-246`), though `host` is the
  platform kind, so the measured claim holds for telling two phones apart.
- New rows mean a change to Scribe's shared schema, pushed "only from that
  full schema" and coordinated with the Scribe agents (AGENTS.md line 154).
  Not in the slice.
- The owner: "It should be the same as the CLI but you know we want to make
  sure that's the case or if it's not in a navigational follow mode." The
  row has who, where and when. It does not have whether the Client mirrors
  navigation, which is the thing he asked to be able to tell.

**Fix.** Name the projection that is published and test that Audible's
state is not in it. Limit the request to Processors of the same signed-in
actor and say how that is checked on Instant. Build on
`InstantProcessorPresence` or say why not. Add the session policy to the
row. List the schema change and its owner.

## U1-12 | Major | Slice 8 has no target, and its cost and its upstream risk are not measured

**Claim.** Plan line 256: "`packages/ui`: tabs, menu, dialog redrawn through
the screen tree, one at a time, each leaving the list". Open decision 2:
redrawing "makes every later merge from upstream harder".

**Evidence.**

- The screen tree has thirteen node kinds: Text, Button, TextInput, Spacer,
  Row, Column, Box, Progress, List, Seek, Transcript, DeviceShell, Lazy
  (`packages/foldkit/src/renderers/types.ts:624-637`). None is tabs, a menu
  or a dialog, and none holds a consumer's own content. The skill: "Atoms
  are closed vocabulary."
- The widgets' public API is the opposite. `Tabs` takes
  `toView: (render: RenderInfo<Value>) => Html` (`packages/ui/src/tabs/index.ts:202`):
  the consumer builds any `Html` from attribute bags. "Redrawn through the
  screen tree" either deletes that API or keeps it, and if it stays the file
  does not leave the list. `menu/index.ts` is 1,366 lines with ten Commands,
  nine of them on `Dom.*`, and two Mounts.
- Who breaks: 47 example packages declare `@foldkit/ui`, 31 import it in
  source by my grep (the plan says 33), plus `packages/website` (92 import
  lines) and `packages/devtools`. The plan names the examples and the
  website, not devtools.
- The upstream risk is stated, not measured. The fork is at 0.131.0
  (`packages/ui/package.json`). A vendored foldkit-plus doc is titled
  `foldkit-0.158-to-0.163.md`, so upstream is past 0.163. This checkout has
  no upstream remote. Of 60 commits on `packages/ui`, 2 are by the fork's
  owner. The
  plan does not say when upstream was last merged or whether it will be
  again. If it will not, the risk is zero and the decision is easy. If it
  will, core has already moved far more than these three widgets would.
- The owner: "make our library complete and at the core". The plan's
  fallback in open decision 2, "the framework-free parts live in core beside
  it", is what those words say. The plan proposes the other option first.

**Fix.** Before slice 8, add the node kinds or the content slot the three
widgets need, as a design. Say what happens to `toView` and to the 31
importers. Answer the upstream question with a fact (last merge, intent).
Consider making the fallback the proposal: parts in core, `@foldkit/ui`
left as upstream's HTML library and frozen by the lint.

## U1-13 | Major | A third machine contract beside the two the repo already has

**Claim.** Plan lines 79-90: "One shape for every behavior", `Behavior<State,
Context, Fact, Instruction>`, in a new `packages/foldkit/src/behavior/`.

**Evidence.**

- `packages/foldkit/src/experimental/machine/machine.ts` (825 lines) is
  `Machine.define`: a transition table whose edges return Commands, used by
  `examples/cardboard/core/src/machine.ts` and `examples/checkout-machine`.
  The owner read it aloud from the earlier answer: "Type parts, machine
  define exists in fold kit experimental, 825 lines used by cardboard".
- The skill the plan must follow names a different contract as the
  direction, in that folder: `ComponentMachine<State, In, Out>` with
  `step: (state, input) => Plan<State, Out>` and `handles`, returning "next
  state, emitted facts, side-effect Commands, activity descriptors", where
  "Activities become ManagedResources or Subscriptions"
  (`skills/foldkit-screens/SKILL.md:116-137`).
- The plan mentions neither. Its timer is an instruction out and a fact
  back. The skill's is an activity owned by a state. Its step takes a
  `Context`. The skill's does not.

**Fix.** Say which of the three survives and what happens to the other two:
`Behavior` replaces the skill's sketch (edit the skill in slice 3), and
`Machine.define` stays for domain state charts or is rebuilt on `Behavior`.
One sentence each, with the reason.

## U1-14 | Major | Four of the owner's asks are narrowed without saying so

**Evidence.**

1. Complete. "look at radix UI look at you know some of these popular UI
   things and let's make our library complete and at the core". Radix has
   59 packages, Zag 51 machines, `@foldkit/ui` 25 namespaces. The plan has
   eleven blocks and no list of what complete is, so nobody can say what v1
   leaves out or what comes next. He also scoped v1 himself ("port what we
   need in order to build what we already have"), so the v1 cut is his. The
   missing piece is the map past it.
2. Exactly like Zag. "using, you know, state machines, et cetera, uh, for
   representing this exactly like Zag JS does". Zag is a machine, an
   anatomy of parts, and `connect`. The plan takes the first (U1-06).
3. foldkit-plus. "look at FoldKit plus ... maybe we can get some ideas from
   there", and he pasted its 0.43.0 notes ("Component configuration"). It is
   vendored and the plan never names it. Its own description of its widgets
   is the plan's idea: "each one is a Bundle placement plus Behaviors on a
   shared Collection description, with no bespoke state machine"
   (`repos/foldkit-plus/README.md`), with Anatomy, Slots and Behavior as
   separate layers (`docs/ui-architecture.md`) and agent packages. The
   blocks table's "Source read" column lists Zag, Radix, Vercel and ours.
4. Navigation from swift-navigation, not React Navigation. "i'm not a huge
   fan of react navigation personally i think it it's way too heavy-handed".
   Of the four things "taken" (lines 198-203), three are already true by
   ADR 0012 (one tagged value, a stack driven by a keyed diff, a back
   gesture as a fact) and the fourth, alerts as data, is in "not in v1". So
   v1 takes nothing new from it, keeps React Navigation, and puts his stated
   view back to him as an open decision with the opposite default.

**Fix.** Add a coverage table: each Radix primitive and Zag machine, the
blocks it needs, and v1, later, or never. Add foldkit-plus to the sources
with what was taken or why nothing. For navigation, either move one real
piece into v1 or say plainly that v1 changes nothing on the phone's carrier
and why.

## U1-15 | Minor | Five measured behaviors have no block, three blocks have no slice and no user, and slice 6's proof is false

- No block or slice for: the copy timer, hover and focus hints and key
  echo (`documentHints.ts` holds 350, 400 and 1,600 ms waits), dock spacing
  and the keyboard lift, and the Words-only three (wall clock, list
  anchoring, find). "Current row in view" is in slice 6 and not in the
  blocks table.
- `rovingFocus`, `typeahead` and `presence` are in the blocks table and in
  no slice. No file in Books, Counter, Words or their painters mentions
  typeahead or waits for an exit animation (grep, 2026-11-20). They serve
  slice 8 only.
- Slice 6 proves "Books and Words run on shared rules only". After it,
  Words' `mount.ts` still holds the wall clock, list anchoring, find, the
  share dialog's focus, the row menu and the scrubber. And the Words page
  is written on `foldkit/html` throughout (`examples/words/foldkit/src/view/`),
  which the owner's lint ask is aimed at for `packages/ui`. The plan does
  not say whether Words is in or out of that.

**Fix.** Give each measured row a block, a slice, or a line saying it stays
in the painter and why. Schedule or cut the three blocks. Reword slice 6's
proof to what it will show.

## U1-16 | Minor | Fact, Port, Instruction and part already mean something else here

- Fact: "a Message a Command, Subscription, or carrier produces"
  (`glossary.md:244`). A runner-homed behavior's fact is never a Message.
- Port: `foldkit/port` is an existing module (`Port.Inbound`, `Outbound`),
  and AGENTS.md layer 4 uses "ports" for the Services a core declares.
- Instruction: the skill calls the screen tree instructions ("A Program owns
  facts and instructions").
- Part: a whole component in "A part's behavior is written once", one
  painted element in `measure(part: PartKey)`, a word in the HTML edge.
- Block, runner and painter are undefined. The owner stopped on three such
  words while reading: "what do you mean by behavior here", "what does edge
  mean here", "what do you mean follow the voice rule".

**Fix.** Define each in `glossary.md` first, as AGENTS.md asks, and rename
the ones that collide.

## U1-17 | Minor | Five counts are off

- "24 widgets": `packages/ui/src/index.ts` exports 25 namespaces.
- "about 75 generated route files": 59 generated, 60 with the layout
  (`examples/books/expo/app`).
- "draws seven presentation styles as three": four are produced, `card`,
  `modal`, `fullScreenModal`, `transparentModal`
  (`packages/react-native/src/reactNavigation/stack.ts:102-110`).
- "33 other examples": 31 import it in source; 47 declare it.
- The copy counts, by U1-09.

## U1-18 | Minor | The exemplar's State uses a sentinel that JSON cannot carry, and `Behavior` carries no Schemas

- `initial` is `Number.NEGATIVE_INFINITY` twice for "nobody has scrolled"
  (`transcriptFollow.ts:60-63`). AGENTS.md line 179: "Never use sentinel
  values to signal absence." `JSON.stringify(-Infinity)` is `null`, so this
  State could not sit in a Model that is snapshotted as text (ADR 0013
  decision 7). Blocks will copy the exemplar.
- "`State`, `Fact` and `Instruction` are Schemas" (line 92), but the
  `Behavior` record holds `initial` and `step` only. A Model-homed block
  needs its Schemas on the value.
- The exemplar is in `renderers/`. Blocks go in `behavior/`. No slice moves
  it, and the lint names it as a special case.

**Fix.** `Option` for the two times, the Schemas on `Behavior`, and a move
in slice 3.

## U1-19 | Minor | "Slices 1 and 2 share no file" is unchecked and false for at least one file

Every commit prepends `CHANGELOG.md` (AGENTS.md lines 293-295). Both slices
add terms to `glossary.md` and likely edit `skills/foldkit-screens/SKILL.md`.
If slice 2 extends `TranscriptFollow` (U1-02), its `Ports` change touches
`paintReact.tsx` and the phone's `transcript.tsx`, and slice 1 touches the
Dock in `paintReact.tsx:182` and the phone's frame. **Fix.** List each
slice's files, or drop the sentence and name who merges second.

## U1-20 | Minor | Lines no test could prove wrong

- "Each slice is a commit that passes on the M5": passes what.
- "A painter ... decides nothing" (U1-06).
- "We port its state charts, key maps and ARIA tables": no slice, no
  output named.
- v1 has no finish line. Issue #2568's success criteria are empty and it
  has no child issues. The owner: "I want this documented in our issue
  tracker under the fold kit project before we start and as we go". The
  order of work has no tracker step.
- "Dialogs behave the same everywhere" (slice 5): same in what, measured
  how, on a phone with no focus and a terminal with no pointer.

**Fix.** One checkable sentence per slice (a named test, a command, a
count that drops), a child issue per slice, and success criteria on #2568.

## U1-21 | Minor | The tier table changes two tiers while saying no modification is assumed, and re-asks an answered question

- The skill's Template is "Device/host shell around a screen", and the
  owner read back "template is a device shell". The plan's is "the shell
  that stays while screens change", with "the tab bar, a device frame" as
  one example of two different things. The skill's Organism is a "subtree
  owning behavior via composition". The plan's is "a part backed by one or
  more blocks". Navigation is added as a sixth row. Those are
  modifications.
- Open decision 3 asks for "the modification to atomic design he mentioned".
  He was asked and answered: "I don't know what modification you're wanting
  me to ask you to write in there". His first message reads as "this is a
  little bit of a modification" to what exists, not a change to atomic
  design. CLAUDE.md says to consult the record "before asking a question it
  may already answer".

**Fix.** Remove open decision 3. Say the table changes Template and
Organism and adds Navigation, and update the skill's table in slice 3.

## Held

- The reference claims check out: Zag's typeahead clears after 350 ms
  (`dom-query/src/typeahead.ts`), its menu asks the page (`menu.dom.ts`
  `getNextEl`), its select uses a collection; the four Radix files exist as
  named; `computePlacement` is in the UI SDK's `platform/position.ts`;
  swift-navigation diffs the path near line 87 and writes a swipe back near
  line 284.
- The painter line references are right to within about ten lines, except
  where U1-09 and U1-17 say.
- `ShowProfile` sets `pages: [ProfilePage()]` (`update.ts:1001-1004`), the
  Dock is redrawn per page, the phone adapter builds the header and removes
  the Program's Back and title (`entryView.tsx:46, 138-141`), and the
  phone's instance changes each launch.
- Not wrapping Zag, and porting its semantics, matches the skill and the
  owner ("Porting zag wrapping it no porting its semantics yes").
- A timer as an instruction out and a fact back is sound for the runner
  half, and "items are data" is the right choice over asking the page.
- Terminal painters for rich widgets as P2, and leaving Issues out, are his
  own words.
- Surfacing ADR 0012 against his view of React Navigation as a decision,
  not settling it silently, is right. Its content is U1-04 and U1-14.
