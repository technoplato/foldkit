# Adversarial audit | UI v1 | Round 2 | 2026-11-20

Audited: `plans/14-ui-v1.md` as rewritten, `plans/14a-ui-coverage.md`, and
`plans/adversarial/ui-v1-round-1-response.md`. Everything here was read from
code and text. Nothing was built or run.

## Verdict

No Blocker is left. Four Majors are, so this is not yet the agreement asked
for. Each of the four is a correction to the plan's text, or one choice
between small options. None asks for a new design.

1. Home screens are the right smaller thing, and the core change is small.
   But the Books table names a function that keeps the pages, lists one of
   the five `update` arms that assume the library is the root, and
   `/books/profile` parses as a title named `profile` with the parser as it
   is. The slice's own test would not catch the first two (U2-01).
2. On the phone, "the homes share one carrier identity, each kept mounted
   and hidden" does not hold on Expo Router, which Books ships on. The route
   file is picked from the address, and each route file is its own
   component, so the kept homes are thrown away on every switch. Two smaller
   things work (U2-02).
3. "Slice 2 in full" is missing seven things the listener sees today, and
   the right column cannot yet say four of them. The largest: at the live
   edge no word is sounding, so nothing the shared rule hears would move the
   view (U2-03).
4. The painter ratchet does not cover the file the original failure was
   headed for, and it counts `let` in files that hold their state in `const`
   objects: `htmlEdge.ts` has 0 `let` and 3 such objects, `mount.ts` 0 and 6
   (U2-04).

Can the slices start. Slice 1: the core, web and terminal work can start
once U2-01's corrections are in the plan; the phone work waits on the choice
in U2-02. Slice 2: its first task, the before tests for the full list in
U2-03, can start now; growing the rule waits until the table has those rows.

This round: 0 Blocker, 4 Major, 7 Minor. Each Minor says the slice it is
safe to settle in.

## Round 1 findings

Closed 9, Partly 12, Open 0.

| Id    | Was     | Now    | What is left                                                                                                     |
| ----- | ------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| U1-01 | Blocker | Partly | The three homes and the per-block table hold. Left: `layers` as stored state, and one false claim (U2-05, U2-06) |
| U1-02 | Blocker | Partly | Growing the rule is the right answer. Left: the table's missing rows (U2-03)                                     |
| U1-03 | Blocker | Partly | No tabs, no address change: accepted. Left: the Books table against the code (U2-01)                             |
| U1-04 | Major   | Partly | The cost is stated. Left: the answer to it does not work on Expo Router (U2-02)                                  |
| U1-05 | Major   | Partly | `SelectedTab` is gone. Left: `replacedRoot` keeps the pages, so a `Show*` lands by device again (U2-01)          |
| U1-06 | Major   | Partly | A Part is defined and the gesture test can fail. Left: three details (U2-06)                                     |
| U1-07 | Major   | Closed | The claims are removed, extraction moved to slice 6, focus is active-descendant                                  |
| U1-08 | Major   | Partly | The core rule is now true from slice 3 and the gate is named. Left: the ratchet's reach and counts (U2-04)       |
| U1-09 | Major   | Closed | A column per painter, Svelte frozen by name, the Words rule placed in Words core                                 |
| U1-10 | Major   | Partly | Parts declare Actions, one Catalog. Left: the UI mark has no slice (U2-07)                                       |
| U1-11 | Major   | Partly | Place and mode only, never the Model. Left: who may read it, and his ask deferred without asking him (U2-07)     |
| U1-12 | Major   | Partly | Upstream measured. Node design as slice 9's first task: accepted. Left: slice 9 against "not in v1" (U2-09)      |
| U1-13 | Major   | Closed | `Block` replaces the skill's sketch, `Machine.define` stays for domain charts, with the reason                   |
| U1-14 | Major   | Closed | 14a, the sources table with foldkit-plus, the plain sentence on React Navigation                                 |
| U1-15 | Minor   | Partly | `timedHint` added, three blocks out. Left: slice 6's sentence against `fieldDraft` (U2-10)                       |
| U1-16 | Minor   | Closed | Widening Fact and Port in place of renaming: accepted, since the definitions are written                         |
| U1-17 | Minor   | Closed | Counts corrected                                                                                                 |
| U1-18 | Minor   | Closed | `Option`, Schemas on `Block`, the move, all in slice 3                                                           |
| U1-19 | Minor   | Closed | The sentence is gone and the order is stated                                                                     |
| U1-20 | Minor   | Partly | Eight of ten sentences can fail. Left: slices 2, 4, 6, 7 (U2-10)                                                 |
| U1-21 | Minor   | Closed | Open decision 3 removed, Template unchanged                                                                      |

## New findings, and what is left

| Id    | Severity | One line                                                                                                       |
| ----- | -------- | -------------------------------------------------------------------------------------------------------------- |
| U2-01 | Major    | Home screens: the Books table disagrees with the code in three places, and the slice's test misses two         |
| U2-02 | Major    | The phone: a shared identity with homes kept mounted does not hold on Expo Router                              |
| U2-03 | Major    | Slice 2's table is missing seven things the listener sees, and the right column cannot say four of them        |
| U2-04 | Major    | The ratchet misses the file the failure was headed for and the way these files hold state                      |
| U2-05 | Minor    | `layers` as device state would be a second record of what the Model already says is open                       |
| U2-06 | Minor    | The Part: a painter named in a core declaration, a gesture list short of v1's own blocks, one false claim      |
| U2-07 | Minor    | The UI mark is a third hand-kept classification in no slice; presence has no reader rule; one ask not put back |
| U2-08 | Minor    | Slice 7: the phone's own alert cannot be closed by the Program                                                 |
| U2-09 | Minor    | Slice 9 needs two blocks the plan says are not in v1, and no app uses its three parts                          |
| U2-10 | Minor    | Four "Done when" sentences still cannot fail, or contradict the plan                                           |
| U2-11 | Minor    | Three counts and one omission                                                                                  |

## U2-01 | Major | Home screens: the Books table disagrees with the code in three places, and the slice's test misses two

**Claim.** Plan lines 270-303: `ShowProfile` becomes
`replacedRoot(stack, ProfilePage())`, `ShowLibrary`
`replacedRoot(stack, LibraryPage())`; "`parseRoots` already tries every root
route"; "No address changes"; "Each names where it lands". Slice 1 is done
when "a test shows `ShowProfile` then `ShowLibrary` leaves `pages` empty".

**What holds.** Printing works with the code as it is: `printStates` finds
the root's route among all routes, whatever its placement
(`packages/foldkit/src/navigation/uri.ts:199-203`), so a stack whose root is
`ProfilePage` with no pages prints `/books/profile`, and Audible above it
prints `/books/profile/audible`. `/books/profile/audible` also parses
correctly as it is: under the library root, `profile` reads as a title, and
`audible` is refused above a title, so the parse falls to the profile root.
`NavigatedBack({ uri: '/books' })` folds to the bare library through
`backTo`'s parse (`transition.ts:58-60`). `replacedRoot` and `SetRoot` are
unused outside tests, as claimed. `screens` taking `homes` is a small change
(`declaration.ts:678-711`).

**Evidence.**

- `/books/profile` alone parses wrongly. `parseRoots` tries root routes in
  declared order (`uri.ts:418`). The library's route is `Route.here`, which
  takes no segment, so `profile` is left for the entries above it, and
  `TitleSlug` accepts it (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`,
  `examples/books/core/src/ids.ts:18-20`). The result is the library with a
  title named `profile`. Today the profile's exact word wins because entry
  routes are sorted exact words first (`uri.ts:316-321, 338`); root routes
  are not. `/books/profile/session` and `/books/profile/menu` go wrong the
  same way. The fix is one line: sort the root routes the same way in
  `parseRoots`. `routesRoundTrip.test.ts` would fail without it, since
  `roundTripOf` builds a stack from every Root row
  (`routeTable.ts:368-371`), so this one is caught.
- `replacedRoot` keeps the pages: "Returns the stack with `nextRoot` beneath
  the unchanged entries" (`structure.ts:291-295`). Today `ShowLibrary` sets
  `pages: []` and `ShowProfile` sets `pages: [ProfilePage()]`, each with the
  modal cleared (`examples/books/core/src/update.ts:993-1008`), from
  anywhere: both are enabled `unlessAsking`, not only on a home, and
  `ShowLibrary` is also a Primary button outside the Dock
  (`screen.ts:1172`). With `replacedRoot`, `ShowLibrary` from a title's page
  leaves the title's page up, and `ShowProfile` from the player gives the
  profile under a title and a player. So "each names where it lands" is
  false as written, and U1-05's relative landing is back.
- The slice's test passes anyway. From the library, `pages` is empty before
  and after. No existing test folds `ShowLibrary` from a deep page; only
  `goldenFold.test.ts:22` uses it.
- Four more arms assume the library is the root and the table lists one.
  `openedTitle` sets `pages: []` and pushes a title (`update.ts:185-196`).
  `openedPlayer` sets `pages: [TitlePage({ slug })]` (`:222-229`), which the
  table covers. `ShowReadAloud` sets `pages: [ReadAloudShelf()]` (`:1009-1016`);
  the table says "the same". The player-page replace at `:261`. A title is
  allowed "only above the library" (`routes.ts:165-168`). From a profile
  root each builds a stack the declaration refuses, and Session's `allowed`
  trims it without a word (`packages/foldkit/src/session/session.ts:781-786`).
  So `books open <title>` typed on the terminal while the profile is up
  would do nothing.
- Three smaller things the slice must change and the plan does not name.
  `backMessages` is "Empty at the root" (`transition.ts:135-153`), so the
  Program's own Back on the profile sends nothing until it learns the first
  home. A root change is a carrier `Reset`, which the browser driver answers
  with a replace, not a new entry (`browserHistory.ts:334-344, 361`); a move
  that changes the home and adds pages at once, such as `OpenPlayer` from
  the profile, is one `Reset` too, where today it is a pop and two pushes.
  And the three Actions' `mutates` gain `at.navigation.root`
  (`message.ts:527, 536, 548`), so "keep their Catalog entries" is not
  quite so; `touches.test.ts` will say so.
- "The phone's carrier plan keeps one root key" (slice 1). A plan entry's
  `key` is its printed path (`carrier.ts:130`), so the two homes have two
  keys by "no address changes". The sentence means `identity`.
- `routesRoundTrip.test.ts` does not pin addresses. It checks that each
  printed stack parses back and that more than 50 print. A dropped address
  passes it.

**Fix.** In the table: `ShowProfile` is `stackAtRoot(ProfilePage())` and
`ShowLibrary` is `stackAtRoot(LibraryPage())`. Add the rule "an arm that
puts a library-only page on the stack sets the root to the library", with
the five arms named. Add the one-line parser change to the slice. Replace
the test with: from the profile root, each of `Open`, `Listen`,
`OpenPlayer`, `ShowReadAloud` and `ShowLibrary` lands where it lands today
from library, profile; `ShowLibrary` from a title's page lands on the bare
library; `ShowProfile` from the player lands on the bare profile. Pin the
addresses with `addressesOf(App.navigation)` equal before and after. For the
browser, two tests: a switch to the profile is a new entry, and a switch
back by the tab returns to the entry beneath, as it does today.

## U2-02 | Major | The phone: a shared identity with homes kept mounted does not hold on Expo Router

**Claim.** Plan lines 313-322: "The homes share one carrier identity, so a
switch is the same native screen with new contents"; "the phone's home
screen keeps each home it has shown mounted and hides the ones not
selected".

**Evidence.**

- A mechanism for a shared identity exists: `identity` is the path printed
  after each screen's `identityOf` (`carrier.ts:72-93, 111-117`), and the
  phone keys its native routes by it (`reactNavigation/stack.ts:67-70`). A
  root screen takes no `identityOf` today (`declaration.ts:589-604`), which
  is a small change.
- The route's name is another matter. The Expo Router stack picks the route
  file from the entry's address, not its identity: `routerRouteOf` calls
  `routeNameFor(segments of route.uri, …)`
  (`packages/react-native/src/expoRouter/routerStack.ts:44-62`). So one key,
  `/books`, would be named `books/index` on the library and
  `books/profile/index` on the profile.
- In Expo Router each route file is its own component:
  `getQualifiedRouteComponent(route)` builds one per route node and keeps it
  in a `WeakMap`, and each screen is
  `Screen { name: route.route, getComponent: () => getQualifiedRouteComponent(route) }`
  (`examples/books/expo/node_modules/expo-router/build/useScreens.js:186-190, 380-381`,
  version 57.0.24). A route that keeps its key and changes its name renders
  a different component type under that key, and React replaces the
  subtree. By reading, not by a run: the `EntryView` under it remounts on
  every home switch, and the homes it was keeping go with it.
- The only use of a shared identity today never changes the file: the
  player at `…/listen/12s` and `…/listen/13s` are both
  `books/[slug]/listen/[atMs]/index`.
- With one native root, Android's back button on the profile has nothing to
  pop, so "does on Profile what it does today" needs a back handler the plan
  does not name.
- A hidden home must also be still and out of reach: not painted again each
  second a book plays (a covered page has `quietWhile` for this,
  `reactNavigation/entryView.tsx:71-84`), and hidden from VoiceOver. Unsaid.

**The smallest things that work.**

- **B, a card with no animation.** On the phone only, a home that is not
  the first is shown as a native route above the first home, with
  `animation: 'none'`, `headerBackVisible: false` and
  `gestureEnabled: false` from `entryOptionsOf`. The native stack keeps the
  library alive beneath, as it does today, frozen and quiet by the code that
  already exists (`freezeOnBlur`, `isCoveredOf`). Route files and addresses
  are untouched, Expo's web address stays right, and Android's back pops
  natively, which is the Back rule the plan states. Cost: one keyed-stack
  wrapper in the family of `renewedStack` that puts the first home beneath
  a non-first root on write and takes it off on read, and the plan's own
  "list of homes" so the first home can be painted while it is not in the
  plan's entries. The profile is taken down when the person returns to the
  library, as today.
- **C, less still.** Keep `ProfilePage` a pushed page in the Model and
  declare it a home: `pushScreen(ProfilePage, …, { isHome: true })`. Every
  painter reads the flag: the phone uses the three options above, the web
  and the terminal leave out their Back control. No parser change, no
  restore rewrite, no arm changes, no `backMessages` change, no browser
  driver change. Everything in U2-01 disappears. What C does not give is
  `stack.root` naming the selected home.
- **A, as planned,** works only if the Expo stack names a route by its
  identity's address on native, and by its address on the web so the
  address bar stays right, plus the keep-mounted host, the stillness and
  the back handler.

**Fix.** Choose one in the plan. If the root must change in core, B is the
phone's part. If nothing needs `root` to name the home in v1, C is the whole
slice.

**What would change my mind.** A reason the selected home must be
`stack.root` in v1 (it is the natural base for plan 04's kept stacks later,
which may be reason enough), and for the phone either B, or a look at a
device showing the library keeping its scroll place under A.

## U2-03 | Major | Slice 2's table is missing seven things the listener sees, and the right column cannot say four of them

**Claim.** Plan lines 414-433: six rows, "the page looks the same", and
deleted are "`RunSpokenWord`, `ObserveFollowedSection`, the wheel and touch
handlers in `view.ts`, and `followCommands`' scroll on a section change".
Slice 2 is done when "the five behaviors listed below each have a test that
passed before and passes after".

**Rows missing from the left column.**

1. **Nothing moves when a recording opens.** "The first look only marks:
   where the page opens is the Model's to say"
   (`examples/words/foldkit/src/mount.ts:964-976`). The page opens on the
   title, a linked section, or the live edge (`openingScrollOf`,
   `examples/words/core/src/update.ts:1303-1312`). The shared rule measures
   on the first `ChangedSpokenWord` and brings the word to the middle if it
   is outside the middle band, which the first section under a title is.
2. **Every new section is centred, in view or not.** `bringsIntoView` is
   true on any crossing (`playbackClock.ts:153-160`) and the scroll follows
   with no measuring. The shared rule scrolls only when the measured unit is
   outside the middle half (`transcriptFollow.ts:42-44, 213`), so a short
   section already in the band would not be centred.
3. **At the live edge the view moves when the newest section arrives or
   grows,** not when a word sounds. No word is marked there
   (`isMarking: !isFollowingLiveEdgeOf(ready)`, `playbackClock.ts:53`) and
   the edge does not follow there (`keepsInView`, `:54`). The trigger is
   `followedExtentOf`, the section's id and its text length
   (`update.ts:1279-1301`). The plan deletes that trigger and the right
   column has `BringTo({ where: 'End' })` with no fact that would ask for
   it.
4. **A recording that just finished stays where the listener is**
   (`update.ts:1298`, the guard on the live edge before and after).
5. **Only a wheel or a finger stops following.** A key, the scrollbar, or a
   scroll the page makes itself does not (`view.ts:315-325`: `OnWheel` and
   `OnTouchMove`, nothing on `scroll`). The HTML edge also listens for
   `scroll` and tells `ScrolledView`
   (`packages/foldkit/src/renderers/htmlEdge.ts:482-484, 499-500`), which
   the rule counts as the reader's unless the rule itself scrolled within
   900 ms (`transcriptFollow.ts:264-267`). The plan keeps "the
   `ScrollToSection` Command for jumps a person asks for". The rule does not
   know of that scroll, so with `leaveOn: 'ReaderScroll'` Back to Playhead
   would scroll, be heard as the reader, and detach.
6. **No quiet second.** Words follows the very next section after any
   scroll that did not detach. The shared rule waits one second
   (`shouldFollowWord`, `transcriptFollow.ts:178-188`).
7. **The mark itself.** `RunSpokenWord` marks the section and the word by
   the page's own rule, `spokenAt` (`mount.ts:941-963`), and the page leaves
   the shared `clock` out on purpose (`view/transcript.ts:289-309`).
   Deleting the Mount deletes the marks, and the live word mark is
   `liveClock`, slice 6.

Two details of rows already there. The page has two clearances, not one:
64 and 168 px decide what counts as on screen (`mount.ts:27-28, 84`), and
the root's scroll padding, 4.5rem and 12rem, decides where a section lands
(`styles.css:131-132`, `browser.ts:196-208`). And the page scrolls the
window, not `scrollIntoView`, because in Chromium `scrollIntoView` moves
where Tab starts from, and it jumps under Reduce Motion
(`browser.ts:210-228`). The HTML edge uses `scrollIntoView` with
`behavior: 'smooth'` always (`htmlEdge.ts:391-405`). Those two are
mechanics, and they are the HTML edge's to gain in this slice.

**What the right column cannot say yet.** Rows 1, 2, 3 and 5. They need: a
memory of the last followed unit, so only a crossing acts and the first
look does not; in `Passage` unit, bring on every crossing without the
middle test; a fact for "the followed passage arrived or grew", and which
passage is followed as something the Program says; and `ScrolledView` not
counting as the reader in `ReaderScroll` mode, with every jump the page
makes going through the rule (a named passage, as `focusToken` names a
word) so the rule knows its own scrolls.

**One rule or two.** `unit` and `where` are parameters of one rule: what is
measured and where it is put. `leaveOn` is a second rule in the same file.
It changes four of the six fact handlers (`ScrolledByReader`,
`ScrolledView`, `ElapsedLeaveWait`, `MeasuredWord` for leaving), it turns
the quiet second on and off, and Words pairs it with following again by
itself, which Books never does. Written as two blocks, "bring the followed
unit into place" and "when has the reader left" with two policies, each
stays small, and open decision 3 becomes a choice of policy. This part is
advice, safe to settle in the slice. The missing rows are not.

**The test.** "Passed before and passes after" is the right bar, but it
needs a level both versions share. The edge rows have no test today: the
34 core test lines cover what stays in the Model, and no test names
`RunSpokenWord` or `ObserveFollowedSection`. A unit test of `bringsIntoView`
is deleted with it. Only a test that drives the page (a wheel, a clock, a
growing section) and reads where the window is can be the same test twice.
The sentence also says five behaviors and the table has six rows.

**Fix.** Add the seven rows and the two details. Say for each what the
shared rule gains. Name the level of the before and after tests, and make
writing them the slice's first commit. Move the mark with the follow, or
keep `RunSpokenWord`'s marking until slice 6 and delete only its scroll.

## U2-04 | Major | The ratchet misses the file the failure was headed for and the way these files hold state

**Claim.** Plan lines 367-375: per painter file, counts of timers, held
state ("`useState`, `useRef`, module or closure `let`"), listeners, and
"constants named with a unit (`Ms`, `Px`)"; "This is the guard against the
failure that started this plan". Slice 3 is done when "the ratchet test
fails on a `setTimeout` added to `paintReact.tsx`".

**Evidence.**

- The failure, in the owner's reading: "I was about to move more follow
  logic into the browser file which is a wrong direction by your rule".
  `examples/words/foldkit/src/browser.ts` holds the page's scroll code and
  is not in the covered list. Nor is `view/`.
- Other painter files outside the list: `packages/foldkit/src/interaction/documentHints.ts`
  (4 timers and the 350, 400 and 1,600 ms waits; it is the `timedHint`
  copy), `packages/foldkit/src/cli/surface.ts` and `terminalScreen.ts`
  (both cited in the plan's own measured table), `packages/react/src`
  outside `paintReact.tsx`, `packages/react-native/src/reactNavigation` and
  `expoRouter`, and each example's Client folders.
- A new file beside a covered one has no baseline. The plan does not say an
  unknown file fails.
- Held state is not held in `let` here. `htmlEdge.ts` has no `let` and
  three `const state` or `const held` objects that are written to
  (`:130`, `:213-216`, `:425`); Words' `mount.ts` has none and six. AGENTS.md says
  "Use `const`". A `Map`, a `useReducer` and Svelte's `$state` are not
  counted either.
- A rule needs no timer. The Svelte follow copy is a compare:
  `Date.now() - lastUserScrollAtMs < userScrollQuietMs`
  (`packages/svelte/src/interaction/TranscriptView.svelte:44`). Pasted into
  `paintReact.tsx` with its number inline it raises no count. `Effect.sleep`
  is a timer the count does not name.
- A rule's number need not end in `Ms` or `Px`. The plan's own example of a
  rule, "5 tries", is `maximumJumps = 5`
  (`packages/react-native/src/interaction/transcript.tsx:460`). The HTML
  edge's are `LONG_PRESS_MS` and `LONG_PRESS_SLACK_PX`, and Words has
  `_SECONDS`.
- The baseline is a file the same commit can edit. The likeliest way an
  agent meets a failing ratchet is to raise the number.

**Fix.** Cover painter folders, not named files, with a rule that a file not
in the baseline starts at zero: add `examples/*/` Client folders,
`interaction/document*.ts`, `cli/surface.ts`, `cli/terminalScreen.ts`, and
all of `packages/react/src` and `packages/react-native/src`. Count what
these files use: objects and collections that are written to after they are
made, `Date.now` and `performance.now`, `Effect.sleep` and `Effect.delay`,
and every numeric literal other than 0 and 1, named or inline. Have the gate
compare the baseline with the branch point and fail on any number that
rose, with a message that says where the rule goes. Make slice 3's sentence
the set of cases that must fail: the Svelte quiet check pasted into
`paintReact.tsx`; a `const held = {}` written to in `htmlEdge.ts`; a new
file beside `paintReact.tsx` with a timer; a rule added to Words'
`browser.ts`; a baseline number raised.

## U2-05 | Minor | `layers` as device state would be a second record of what the Model already says is open

The homes table gives `layers` ("what is open, in what order") the device
home. What is open is already in the Model three ways: navigation's
`maybeModal`, which is logged and mirrored; Books' `maybeTitleMenu`, which
is device; the word menu in the player's own state. A stored stack beside
them can disagree with them, and it would straddle two homes. Make `layers`
a pure reading over what the Program says is open, with no state, like
`placement`. Safe to settle in slice 5.

## U2-06 | Minor | The Part: a painter named in a core declaration, a gesture list short of v1's own blocks, one false claim

- "Which one a painter does is written in the part's declaration, per
  painter" (lines 34-35). A core declaration that lists painters names
  Clients in core, which layer 1 forbids and `Declaration.clientWordsOf`
  fails for the words `terminal` and `browser`. Let the painter say what it
  recognizes itself, and the part say "hold" once.
- Then the test's sentence needs one more word. The web tells three raw
  facts and the phone tells `HeldLong()`, so "the same gesture gives the
  same facts" is false for a hold by design. Compare the outcome: the same
  Action.
- The closed gesture list has no typing or submit (`listFilter` now lives in
  the Model and needs both), no pointer rest or focus (`timedHint`), and no
  coming into view (slice 2's two new facts).
- A token field acts "once per new token value". The same instruction twice
  running, such as bringing the same row into view again after the person
  scrolled, is no new value. The token needs a count.
- `ActionMenu` is "painted today ... with no painter naming it" (line 180).
  Every painter names it: `packages/react-native/src/interaction/actionMenuModal.tsx`,
  `packages/svelte/src/interaction/ActionMenuDialog.svelte`, and the entry
  view is `Screen | Menu` with its own arm
  (`reactNavigation/entryView.tsx:209`). It is a sound exemplar of state in
  the Model on non-DOM Clients. It is not one of a generic host.
- Slice 4's sentence covers hold and second button. It does not cover the
  generic host or the composition call proved on `ActionMenu`, which are
  the other half of the slice.

Safe to settle in slice 4.

## U2-07 | Minor | The UI mark is a third hand-kept classification in no slice; presence has no reader rule; one ask not put back

- Books already sorts every Message twice by hand: `categoryOf`
  (`examples/books/core/src/program.ts:18-139`) and `isLocalOnlyMessage`.
  "Marked as a UI Action" is a third. Derive it from the two, or say why
  not. No slice builds the mark or the split in `books actions --json`.
- Presence goes to an Instant room, and round 4 found rooms carry no
  permissions (R4-07). The address a person is on, such as a title and a
  place in it, would be readable by anyone who has the room's id. The plan
  writes a reader rule for the part it defers and none for the part it
  builds. Books' sync path joins no room today; only
  `examples/instant-counter` calls `makeProcessorRoom`. Add to slice 8's
  sentence: another signed-in person's Processor cannot read it.
- The owner: "so that we can know the state of an individual client ... So
  we need that to be working". v1 now gives place and mode. The plan says so
  under "Not in v1", but it is not among the open decisions. It was my
  finding that moved it out, so he has not been asked. Add it as open
  decision 5.

Safe to settle in slice 8.

## U2-08 | Minor | Slice 7: the phone's own alert cannot be closed by the Program

"Drawn as the platform's own alert on the phone." React Native's `Alert`
has no call to dismiss it on iOS. `CancelDeleteBookmark` is Navigation
(`program.ts:89`), so under Mirror a desk can close the question, and the
Program closes it when the bookmark is gone. The phone's alert would stay
up. The sentence for the slice checks the data half only. Add: a close from
the Program removes the alert on the phone. That forces the right drawing.
Safe to settle in slice 7.

## U2-09 | Minor | Slice 9 needs two blocks the plan says are not in v1, and no app uses its three parts

- Slice 9 builds tabs and menu in v1. 14a gives tabs `rovingFocus` and menu
  `rovingFocus` and `typeahead`. Plan line 439 puts both blocks outside v1.
  One of the three is wrong.
- Books, Counter and Words would use none of the three parts. Name a user:
  Books' title menu as the core menu, its delete question as the core
  dialog. Or say slice 9 is the first slice past v1.
- Under open decision 2 (a), "nothing that imports it breaks" is the claim.
  The sentence that can fail it: `@foldkit/ui`'s own tests for the three
  widgets pass unchanged.

Safe to settle before slice 9, with its node design.

## U2-10 | Minor | Four "Done when" sentences still cannot fail, or contradict the plan

- Slice 6: "each row of the measured table reads 'core'" is an edit to a
  table. The Text field row can never read core, since `fieldDraft` stays
  in painters by the plan's own note. Say it by the ratchet's counts and the
  line ranges deleted.
- Slice 2: the level of the test (U2-03).
- Slice 4: half the slice (U2-06).
- Slice 7: the data half only (U2-08).

Each is safe to settle when its slice opens.

## U2-11 | Minor | Three counts and one omission

- Slice 0: "14 rule tests". `transcriptFollow.test.ts` has 15 `it(` lines
  by grep. Not run.
- Slice 2: "five behaviors", six rows.
- Line 272: "`SetRoot` carrier instruction". It is a stack instruction
  (`structure.ts:300-308`). The carrier's moves have no `SetRoot`; a root
  change is `Reset` (`carrier.ts:258`).
- 14a leaves out Zag's `rating-group`.

## Held

- The three homes, asked in that order, with the Books title menu, the
  Words `scrub` and the Words follow each landing where the code has them.
- Home screens in place of kept stacks. Books shows its tabs on two pages
  only, so nothing is lost, and plan 04 stays Proposed and said to be.
- Printing a profile root, parsing `/books/profile/audible`, and
  `NavigatedBack` to the first home, all with the code as it is.
- Growing `TranscriptFollow` so the Words page looks the same, in place of
  swapping the rule. `follow` and `playheadVisibility` staying in the Words
  Model is right.
- The rule and mechanics line, and one fact where the platform recognizes
  the gesture.
- Ports left undesigned until slice 6, with three requirements kept.
- `Block` as the one contract, with Schemas on it and no sentinel.
- Presence for place and mode, never the Model.
- Open decision 2 with (a) proposed, and the upstream facts measured.
- 14a as the map past v1. Every family I checked against the two vendored
  package lists is there but one.
- The two points not accepted as written in the response (the node design
  at slice 9's start, and widening Fact and Port): both accepted.
