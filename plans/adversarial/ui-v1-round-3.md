# Adversarial audit | UI v1 | Round 3 | 2026-11-20

Audited: `plans/14-ui-v1.md` as revised after round 2,
`plans/14a-ui-coverage.md`, and
`plans/adversarial/ui-v1-round-2-response.md`. Read from code and text.
Nothing was built or run.

## Verdict

**Agreed: no Blocker or Major is left, slices 1 and 2 can start.**

Five Minors are new. Each is a sentence in the plan or a choice inside its
slice.

Slice 1's core and phone change is already in the working tree, uncommitted
(16 files by `git status`). I read it. It is option C, and it already makes
the correction U3-01 asks for, so what U3-01 leaves is the plan's text.

## Round 2 findings

All eleven are Closed.

| Id    | Was   | Now    | Note                                                                                                                                     |
| ----- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| U2-01 | Major | Closed | Moot under option C: the root, the arms, the parser, Back and the browser driver are untouched                                           |
| U2-02 | Major | Closed | Option C checked against both phone paths, below. The plan's text lags the code: U3-01                                                   |
| U2-03 | Major | Closed | The seven rows and two details are in, the rule is two blocks, `RunSpokenWord` keeps its marking. Two in-slice notes are U3-03           |
| U2-04 | Major | Closed | Folders, zero for an unknown file, clocks, written-to objects, numbers, Words' `browser.ts` named, five failing cases. One note is U3-04 |
| U2-05 | Minor | Closed | `layers` is a pure reading                                                                                                               |
| U2-06 | Minor | Closed | The part names no Client, the test compares the outcome, the gesture list is complete for v1, the token counts                           |
| U2-07 | Minor | Closed | Reader rule in slice 8's sentence; open decision 5 added. The derived UI mark is U3-05                                                   |
| U2-08 | Minor | Closed | Slice 7's sentence forces a drawing the Program can close                                                                                |
| U2-09 | Minor | Closed | v1 ends at slice 8; the three widgets are the first slice past it, with users named                                                      |
| U2-10 | Minor | Closed | Slices 4, 6 and 7 can fail. Slice 2's is U3-03                                                                                           |
| U2-11 | Minor | Closed | Counts corrected                                                                                                                         |

## Option C against the code

It works on both phone paths. Line numbers are the working tree's, with
slice 1's change in it.

- **The option reaches the route.** `pushScreen` passes its options to
  `pushRoute` (`packages/foldkit/src/navigation/declaration.ts:627`, `:116`).
  The flag is a seventh field on a route (`:47-55`). `liftRoute` builds a
  route field by field and carries it (`:165`, `isTab: route.isTab` at
  `:195`), so Session and the action menu do not drop it when they wrap the
  Program.
- **The route reaches the plan.** `planOf` reads the entry's route for the
  title and now for the flag (`carrier.ts:136-140`).
- **The plan reaches both stacks.** `entryOptionsOf` finds the entry by the
  navigator's key and adds the three options for a tab
  (`packages/react-native/src/reactNavigation/entryOptions.ts:68, 99`). The
  React Navigation stack and the Expo Router stack both spread its result
  into `screenOptions` (`foldkitStack.tsx:100-101`,
  `expoRouter/foldkitRouter.tsx:115-116`). One test of `entryOptionsOf`
  covers both.
- **The three options exist.** `animation`, `headerBackVisible` and
  `gestureEnabled` are in native-stack 7.18.6
  (`packages/react-native/node_modules/@react-navigation/native-stack/src/types.tsx:168, 597, 632`).
  A pop uses the leaving screen's animation, so the way back is in place
  too. Not checked on a device.
- **Back.** Android's back pops the native route, the carrier reads a
  strict prefix, and that is `NavigatedBack({ uri: '/books' })`
  (`carrier.ts:300-307`), as today. `gestureEnabled` is the iOS swipe only.
- **The page's own Back button** is already left out under a native header
  (`reactNavigation/entryView.tsx:46, 138`), and stays out.
- **The header title and the menu button.** Both screens are cards with a
  header, the title is each entry's own, and `HeaderMenuButton` is set for
  every screen in the same place. With no animation the title changes at
  once and the button does not move. Nothing to add to the plan.
- One nit in the tree: `presentScreen` takes the same options type, so it
  accepts `isTab` and ignores it (`declaration.ts:646-660`, `:149`). Narrow
  the type or leave it; either is fine.

## New findings

| Id    | Severity | One line                                                                                               |
| ----- | -------- | ------------------------------------------------------------------------------------------------------ |
| U3-01 | Minor    | The plan says `isHome` and two Client changes; the code has `isTab` and one                            |
| U3-02 | Minor    | What a look at the phone should also check: two Docks, and a profile built again each visit            |
| U3-03 | Minor    | Slice 2: no harness that has a window, one row with no mechanism, and a count that does not exist yet  |
| U3-04 | Minor    | The ratchet counts style numbers and blocks splitting a file, so a way to record a fair rise is needed |
| U3-05 | Minor    | The derived UI mark labels Play, Pause and SeekTo as UI Actions                                        |

## U3-01 | Minor | The plan says `isHome` and two Client changes; the code has `isTab` and one

- Before slice 1, the fact was already declared: `Session.compose` took
  `isTab`, "the pages a tab bar reaches, such as a Profile page: they show
  no Back button", and Books and Reminders each set
  `isTab: isProfilePage` in `app.ts` (at `7f3f069d0`). So no Client drew
  Back on the profile before this plan.
- The working tree does the right thing with that. The flag is `isTab` on
  the screen (`examples/books/core/src/routes.ts:115`), Session reads it
  from the route (`packages/foldkit/src/session/session.ts:659-660`), its
  own option is gone, and the two `app.ts` lines are deleted. One
  declaration, one word.
- The plan still says otherwise in three places. Lines 282-292 declare
  `isHome: true`. The table at lines 300-304 says the web has "a Back
  control" today and loses it, and the terminal stops drawing a Back row.
  Neither drew one. The only Client that changes is the phone. Slice 1's
  sentence says "has `isHome`".

**Fix.** In the plan: `isTab` for `isHome` (or rename the code, but pick
one word), the Web and Terminal rows as "no change: Session already leaves
Back out of a tab page", and one line saying Session's option moved to the
screen so the fact is declared once. Safe to settle now; it is text only.

## U3-02 | Minor | What a look at the phone should also check

- The Dock is two views, one per screen, not one. The library beneath is
  frozen while the profile shows (`freezeOnBlur`,
  `reactNavigation/entryOptions.ts:95`) and hears the Model once when it
  is back (`entryView.tsx:71-84`). Today a slide hides that moment. With no
  animation the library's Dock can show the place and the play or pause
  icon from when it froze, for a frame. The profile's Dock is mounted new
  on each visit, so its cover can blink.
- The profile is taken down each time the person returns to the library,
  as today, so it does not keep its scroll place. The library does. Say so
  under "What this does not give".

**Fix.** Add to slice 1's by-eye list: the Dock does not blink or show a
stale place on a switch, either way. If it does, the cure is a declared
shell, which the plan already lists as not in v1. Safe to settle in slice

1.

## U3-03 | Minor | Slice 2: no harness that has a window, one row with no mechanism, and a count that does not exist yet

- The first commit is "tests that drive the page ... and read where the
  window is". The Words page's tests run in `environment: 'node'`
  (`examples/words/foldkit/vitest.config.ts`), and happy-dom has no layout.
  A real window is in `packages/examples-e2e` (Playwright), which the
  plan's gate does not name. Choose: a Playwright spec over the page's
  made-up data, or vitest with faked rects that reads the calls to
  `window.scrollTo`. Name it in the plan.
- "A recording that just finished stays where the listener is": the right
  column says Words' `update` "tells the rule nothing". The rule now hears
  of the followed passage from the tree, and when a recording finishes the
  followed passage changes from the newest to the one at the position
  (`examples/words/core/src/update.ts:895-900`). How the Program holds that
  change back is not said. The row's own test will fail until it is, so
  this is safe.
- The last commit needs "the ratchet's counts for `mount.ts` and
  `browser.ts`" to be lower. The ratchet is slice 3. Land the counting
  script before slice 2's last commit, or drop that clause.

Safe to settle in slice 2.

## U3-04 | Minor | The ratchet counts style numbers and blocks splitting a file

- "Every number other than 0 and 1" includes a phone painter's layout:
  `padding: 24`, `cardMaxWidth = 480`
  (`reactNavigation/entryView.tsx:50, 167`). A new painted element raises
  the count with no rule in it, and slice 7 will add one.
- "A file not in the list starts at zero" fails a split of
  `paintReact.tsx` (1,934 lines) into two files.
- "The counts at the branch point" is a fixed commit on a branch that takes
  direct commits. A count lowered in slice 4 could rise again in slice 5
  and pass.

**Fix.** Compare with the commit before. Let a rise pass only with an entry
in the checked-in file that names the file, the count and one sentence of
why, so a fair rise is on the record and an unfair one has to be written
down. Safe to settle in slice 3.

## U3-05 | Minor | The derived UI mark labels Play, Pause and SeekTo as UI Actions

The mark is "device-homed ... or whose category is Navigation". In Books,
`Play`, `Pause`, `SeekTo` and `SetSpeed` are category Navigation
(`examples/books/core/src/program.ts:23-26, 76`). The category there means
"moves under the session's policy", not "is about the screen". The owner
wanted the UI list "UI related and not domain related", and playing a book
is the domain. Deriving from the Action's own declaration is closer: UI
when it triggers no Command and mutates only navigation and device paths.
Put the result to him with open decision 4. Safe to settle in slice 4.

## Held

- A home as a flag on a pushed page. Nothing else in the plan is stale
  from the root no longer changing: the tiers table, the homes table, the
  swift-navigation paragraph and the "not in v1" list all read correctly.
- The slice 2 table, row for row against `update.ts`, `playbackClock.ts`,
  `mount.ts` and `browser.ts`.
- `bringIntoPlace` and `readerLeft` as two blocks, with open decision 3 as
  a choice of policy.
- The ratchet's reach and what it counts.
- v1 ending at slice 8.
