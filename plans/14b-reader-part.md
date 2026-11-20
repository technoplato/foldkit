# Plan 14b | The reader as one core block: following, the way back, and a named place

Status: Proposed, and built as written here; the owner has not accepted it.
Slice 2b of `14-ui-v1.md`. Scribe issue #2585, under #2568. Audited once
(R-01 to R-16, answered under "Audit"). Layer: Foldkit core
(`packages/foldkit/src/behavior/`), then the two domain cores that use it.

## His words (spoken 2026-11-20, Recording 474)

Told that live following, Back to Live, a linked moment and find would stay
in the Words app: "Those stay, but again, this needs to be built into the
core components." Of each: "you can scroll around a book and then it's
called ... Back to Playhead", "opening at a linked moment, that's in both",
and of find, "those are both". His standing rule: UI behavior is written
once, framework-free, in core, and each Client's painter only supplies
mechanics. On how Words should follow (slice 2): "Follow like books."

## Where the rule lives today

The painter side is already one rule. Its rule is not touched:
`renderers/transcriptFollow.ts`, run by `renderers/htmlEdge.ts`,
`packages/react/src/paintReact/paintReact.tsx` and
`packages/react-native/src/interaction/transcript.tsx`. The HTML painter
writes the fields as attributes (`renderers/html.ts:200-202`, `:805-809`),
and a terminal reads the same fields (`renderers/layout.ts:743`,
`renderers/liveFrame.ts:377`).

The Model side is written three times. This slice joins two of them:

- **Books**, in `examples/transcript-player/core/src`: `model.ts` (`Away`,
  `ScrolledAway`, `LookingAt`, `maybeAway`, `isFollowingPlayhead`,
  `viewPlaceOf`), `update.ts` (`following`, `movedTo`, `playedFromWord`,
  `playedFrom`, `lookingAt`, `steppedMatch`, the `LeavePlayhead` and
  `BackToPlayhead` arms), `message.ts` (the two Actions and their
  `meta.label`, every `mutates: [at.maybeAway]`, `isViewMessage`),
  `screen.ts` (`focusTokenOf`, `shownPassagesOf`, the `isFollowing` and
  `leaveAction` fields in `transcriptOf`, `readerButtonsOf`),
  `subscriptions.ts:136` (the window of words around `viewPlaceOf`). Books
  core only routes and samples: `find.ts:67`, `screen.ts:1525-1558`,
  `program.ts:41-42` and `:171`, `update.ts:998-999`, `message.ts:340-341`
  and `:839-840`, `touchSamples.ts:25` and `:266-271`.
- **Words**, in `examples/words/core/src`: `model.ts` (`Follow`, `follow`,
  `maybeFocusedSectionID`), `update.ts` (`readyFor`, `isReturnShownOf`,
  `applyRequest`, `stayingWhereItFinished`, `returnToFollowed`,
  `steppedFind`, `findOf`, `playbackShortcutsOf`,
  `ClearFocusHighlightLater`, the `ClickedWord`, `EndedScrub`,
  `ScrolledTranscriptAway`, `ClickedReturnToPlayhead`, `ClosedFind`,
  `ChangedFindQuery` and `ElapsedFocusHighlight` arms, the restore of a
  background playback at `:1582`), `reader.ts` (`isFollowing`,
  `leaveAction`, `focusToken`, `isFocused`), `keyboard.ts`
  (`ReturnToFollowed`), and two views that spell the labels:
  `examples/words/foldkit/src/view/playback.ts:852` and
  `view/account.ts:291`.
- **Transcribe** (`examples/transcribe/core/src`: `FollowLive | FollowAway`,
  `PressedFollowLive`, `ScrolledAway`) is a third copy. It is not touched
  here, as plan 14 leaves Svelte: the owner named Books and Words.

## The block

`packages/foldkit/src/behavior/reader.ts`, exported as `Reader` from
`foldkit/behavior` (a folder and an export this slice creates; slice 3 moves
`TranscriptFollow` in beside it). Device home: its State is a field of the
Model, never logged, never mirrored. No DOM, no React, no clock.

```ts
// A place to show: a word by the time it starts, 10_802_400, or a passage by its key, 's7'.
const Word = ts('Word', { startMs: S.Number })
const Passage = ts('Passage', { key: S.String })
const Place = S.Union([Word, Passage])

const Following = ts('Following')
const Detached = ts('Detached', { maybePlace: S.Option(Place) })
const State = S.Union([Following, Detached])
const initial: State = Following()

// What is so when a fact arrives: whether what is followed is the newest
// word of a recording in progress, rather than the word sounding.
const Context = S.Struct({ isLive: S.Boolean })

const LeftVoice = ts('LeftVoice') // a painter pressed leave
const ReturnedToVoice = ts('ReturnedToVoice') // the way back, its key, or coming back to the reader
const MovedVoice = ts('MovedVoice') // a picked word, a seek, a skip, a link to a time
const NamedPlace = ts('NamedPlace', { place: Place }) // a find match, a linked section
const ForgotWord = ts('ForgotWord') // the search that named the word closed or changed
const ForgotPassage = ts('ForgotPassage') // the passage's mark ran out
const FinishedLive = ts('FinishedLive', { isPlaceSpoken: S.Boolean }) // the recording in progress ended
const Fact = S.Union([
  LeftVoice,
  ReturnedToVoice,
  MovedVoice,
  NamedPlace,
  ForgotWord,
  ForgotPassage,
  FinishedLive,
])

const ReturnTarget = S.Literals(['Playhead', 'Live'])
const ReturnControl = S.Struct({ target: ReturnTarget, label: S.String })

step: (state: State, context: Context, fact: Fact) => State
project: (
  state: State,
  transcript: TranscriptNode,
  options: { leaveAction: string },
) => TranscriptNode
returnControlOf: (state: State, context: Context) => Option<ReturnControl>
returnLabelOf: (target: ReturnTarget) => string // 'Back to Playhead' | 'Back to Live'
```

`step`, as a table. Anything not listed leaves the State as it is.

| Fact                                              | From                    | To                         |
| ------------------------------------------------- | ----------------------- | -------------------------- |
| `LeftVoice`                                       | `Following`             | `Detached`, no place       |
| `ReturnedToVoice`, `MovedVoice`                   | any                     | `Following`                |
| `NamedPlace({ place })`                           | any                     | `Detached` with that place |
| `ForgotWord`                                      | `Detached` at a `Word`  | `Detached`, no place       |
| `ForgotPassage`                                   | `Detached` at a passage | `Detached`, no place       |
| `FinishedLive({ isPlaceSpoken: true })`, `isLive` | `Following`             | `Detached`, no place       |

`project` writes the four fields painters already draw: `isFollowing`,
`leaveAction`, `isFocused` on the `Passage`, and `focusToken` for a `Word`:
the first word of the node that starts on that millisecond, else the last
to start before it (`wordAtAddress`, what Books names today while a match's
words are still loading). Passages it does not mark keep their identity, so
a painter redraws none of them. `returnControlOf` is none while `Following`;
while `Detached` its target is `Live` when `context.isLive`, else
`Playhead`. `returnLabelOf` is the only place the two labels are spelled.

Choices, and why:

1. **Live is context, not stored.** Both apps read it from their Model
   (`isFollowingLiveEdgeOf` in Words; never, in Books). A copy in the block
   could disagree. Context is read from the Model a fact arrives at, as in
   any `update`: for `FinishedLive` that is the Model before the recording
   is marked finished.
2. **A word is named by its time, never by its token.** A token is a
   position in a line (`decode.ts:519`) and changes when words are made
   again; a time holds. The token is found each time the node is drawn.
3. **`step` returns the State alone.** The block asks a painter for nothing
   by instruction: what it asks travels on the screen tree. Slice 4's
   `Block` wraps it as `{ state, instructions: [] }`.
4. **`ReturnedToVoice` and `MovedVoice` step alike today.** They are two
   facts because they are two things that happened, and the one answer for
   a skip is the row they share.
5. **No synchronization helper.** Books' three answers are one line each
   and none is about following alone (`isViewMessage`, `listening` kept
   whole on a refold, a `projectLocal` that does not reset the reader). A
   helper would remove nothing. Not built.

Where this differs from plan 14, said plainly:

- Slice 2b says "one part" with Actions and "the return control as a node".
  This is a block with facts. The Actions stay each app's own (Books'
  Catalog Actions, Words' Messages) and tell the block; the control is
  data, and each app draws its own node from it. The Part declaration and
  the generic host are slice 4.
- Plan 14 says a token on the tree carries a count, so the same ask twice
  is two values. A `Place` carries none. Naming the place already named is
  one value, as it is in both apps today.

## Every behavior

| #   | Behavior                                                       | Books today                                                                                   | Words today                                                                                                         | After                                                                                                       |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | A reader opens                                                 | follows (`maybeAway` none)                                                                    | follows (`follow: 'Following'`)                                                                                     | `Reader.initial`, same                                                                                      |
| 2   | The reader scrolls the followed word out of the middle         | `LeavePlayhead`: `ScrolledAway({ anchorMs })`; nothing when already away                      | `ScrolledTranscriptAway`: `Detached`                                                                                | `LeftVoice`, same. Books keeps where its window of words stays in `maybeLeftAtMs`, see below                |
| 3   | The way back shows                                             | whenever away: `Back to playhead`, a pill by the words, no key                                | whenever `Detached`: `Back to Playhead`, or `Back to Live`, a pill over the controls, key L                         | `returnControlOf`. **Books' label gains a capital P.** Each app still places and keys it                    |
| 4   | Pressing the way back                                          | `BackToPlayhead`: follows, closes a word's menu                                               | `ClickedReturnToPlayhead` or L: follows, clears the linked section                                                  | `ReturnedToVoice`, same                                                                                     |
| 5   | Picking a word, playing from a place                           | `SeekToWord`, `PlayFrom`: follows                                                             | `ClickedWord`: follows                                                                                              | `MovedVoice`, same                                                                                          |
| 6   | A seek                                                         | `SeekTo`, a section, a paragraph: follows                                                     | letting go of the scrubber: follows. A seek from the system's media controls: stays detached                        | `MovedVoice`. **Words changes** for the media controls                                                      |
| 7   | A skip or a step                                               | `SkipBack`, `SkipForward`: follows                                                            | skip buttons and keys, the scrubber's arrow keys, the media controls' skip, word and paragraph keys: stays detached | `MovedVoice`: follows. **Words changes**                                                                    |
| 8   | Play, Pause                                                    | following does not change                                                                     | following does not change, also when Play joins the newest audio of a recording in progress                         | no fact, same                                                                                               |
| 9   | A find match is shown                                          | `ShowMatch`, a step, the first match arriving: `LookingAt({ atMs })`, the word there is named | `SteppedFind`: `Detached`; the match's first word is named, read from `maybeFind` on every draw                     | `NamedPlace(Word({ startMs }))` in both                                                                     |
| 10  | The search closes, or its words change                         | the match stays named                                                                         | no word is named; stays `Detached`                                                                                  | Books tells nothing; Words tells `ForgotWord`. Same                                                         |
| 11  | Following again while a match is still selected                | no word is named                                                                              | the match's word stays named on the node                                                                            | no word is named while `Following`. **Words changes**                                                       |
| 12  | Opening at a linked time, or by a plain link when already open | the place is set and the words follow                                                         | `?t=`, or no moment: follows, and a section mark is cleared                                                         | `MovedVoice`, same                                                                                          |
| 13  | Opening at a linked section                                    | no such link                                                                                  | `Detached`, the section marked for 4 s, brought to the middle by `ScrollToSection`                                  | `NamedPlace(Passage)`, then `ForgotPassage` after 4 s. `ScrollToSection` stays, see below                   |
| 14  | How many places can be named at once                           | one                                                                                           | two: a marked section and a selected match                                                                          | one. **Words changes** inside the 4 s                                                                       |
| 15  | The newest word of a recording in progress is followed         | never                                                                                         | the label reads `Back to Live`                                                                                      | `context.isLive`, same. The clock that stands at the newest word is not touched                             |
| 16  | A recording finishes while its newest word is followed         | never                                                                                         | `stayingWhereItFinished`: `Detached` when the place is on or past the first thing said                              | `FinishedLive`, same                                                                                        |
| 17  | Coming back to a recording playing in the mini player          | no mini player                                                                                | follows again; a section mark left from before stays                                                                | `ReturnedToVoice`: follows, no mark. **Words changes**                                                      |
| 18  | The app starts again from its kept Model                       | the reader is as it was, away or at a match                                                   | no Model is kept: the page starts from its address                                                                  | Books: a Model kept before this change opens following, once. Words: nothing to see; its version goes to 11 |
| 19  | What a painter does with the node (quiet second, middle band)  | shared rule                                                                                   | shared rule                                                                                                         | the rule is not touched                                                                                     |

Which Words arms tell `MovedVoice`: `skipBy`, `steppedBy` when it lands on a
word (a step that lands nowhere tells nothing, as Books' `movedToMaybe`),
`MediaSessionSeek`, `ClickedWord`, `EndedScrub`, and `applyRequest` when the
link names no section. `seekTo` itself tells nothing, because two of its
callers must not: Play joining the newest audio (`placedForPlay`), and a
section link, which ends `Detached` at its passage. Skips, steps and the
media controls go to the recording whose audio is loaded (`updateAudio`):
with a mini player open that is the one in the background, so the fact is
told to its reader, not the one on screen.

## What changes for a listener

Books:

- The way back reads `Back to Playhead`, with a capital P, on the web, the
  phone and the terminal. It read `Back to playhead`.
- Once, after the update: a player that was closed while reading away from
  the voice opens following it.

Words:

- A move of the voice resumes following: the skip buttons, the skip keys,
  the scrubber's arrow keys, the word and paragraph keys, and the system
  media controls' skip and seek. Today only a picked word and letting go of
  the scrubber do. This is the one answer for both apps, and it is Books':
  "Follow like books." It reverses a pinned test,
  `follow.test.ts:399-421`. One edge: a recording in progress whose audio
  plays from a stored file, not its live copy, keeps its newest word
  followed, so a skip there brings the newest word back.
- One place at a time. A linked section's 4 second mark ends early on any
  move of the voice (a skip, a step, the scrubber) and on a step to a find
  match. A match selected before a section link opens is no longer named.
- A find match is no longer named once the words follow again. So the page
  does not jump to an old match when the reader is drawn again, and a step
  to that same match after Back to Playhead now brings it back into view
  (today the word is still named, so nothing moves).
- When a recording's words change under a selected match so that no match
  starts there any more, the word now at that time is named. Today none is.
- Coming back from the mini player clears a section mark left from before.

Play does not resume following in either app today and still does not. Plan
14's slice 2 text lists "on play"; neither app's code or tests do that.

## Books' logged Actions, kept Models and the terminal

- The tags `LeavePlayhead` and `BackToPlayhead` stay, with their `what`,
  `why` and `enabled`. `BackToPlayhead`'s `meta.label` reads
  `Reader.returnLabelOf('Playhead')`. Both are in `isViewMessage`, so the
  log never held them and still does not.
- Logged Actions that move the voice (`SkipForward`, `SeekTo`, `PlayFrom`
  and the rest) keep their tags and fields.
- What these Actions say they mutate changes from `maybeAway` to `reader`
  and `maybeLeftAtMs`. `touches.test.ts:143` reads those names, so it
  changes with them. The player's samples and Books' gain a player
  scrolled away, alone and after a look at a match, so every path said is
  seen to change.
- `maybeLeftAtMs` is where the voice was when the reader left, so the
  words on screen stay around it. One function writes it with every fact:
  some on `Following` to `Detached` with no place, none on any step to
  `Following` or to a named place. `viewPlaceOf` is total: the place while
  `Following`; a named word's time; else `maybeLeftAtMs`, or the place when
  there is none.
- `TranscriptPlayer` no longer exports `Away`, `ScrolledAway` or
  `LookingAt`. `isFollowingPlayhead` and `viewPlaceOf` stay.
- Books' Program version stays 1 and `foldRevision` stays `books-fold-v1`.
  `reader` decodes to `Following` when a kept Model has none
  (`S.withDecodingDefaultKey`, as `read-aloud` uses), and an old reader
  ignores the new key, so a kept Model and a shared snapshot decode both
  ways. A test decodes a Model kept before this change. The golden fold
  holds no player and does not change.

## What stays in each app, and why

- **Words' `ScrollToSection` stays.** No painter can bring a passage into
  view: the HTML painter only marks `isFocused` (`renderers/html.ts:157`),
  and the follow rule names words only. The Command is also what moves a
  share page to its linked line. When a painter can, the passage is already
  in the block's State to read.
- **The 4 second timer and `focusRevision` stay in Words.** A timer is a
  Command. Words tells `ForgotPassage` only when the revision matches.
- **The key L stays in Words' own shortcut table**, and Books gives the way
  back no key. Not unified here.
- **Where the control is drawn** stays each app's layout. Whether it shows,
  its target and its label are the block's.
- **Books' window of words** (`viewPlaceOf`) stays in the player: it is
  about which passages are loaded, which Words does not have.
- Restore is left as it is. Plan 14 says a device-homed token is cleared on
  restore; Books' `projectLocal` does not clear the reader today, and #2571
  is redesigning restore.

## One painter mechanic, apart from the block

Asked with this slice, and only for the HTML edge (`htmlEdge.ts`), which the
Words page paints with. Books' web paints with React and the phone with
React Native; neither is changed or measured here.

A reader's wheel that lands while the edge's own glide to the middle is
still running is lost. The session that asked measured it in headless
Chromium on the Words page: one 1500 px wheel as a live sentence arrived
did not detach, and fifteen 100 px wheels did. The rule is not at fault: it
notes the reader's scroll and looks 250 ms later, and by then the glide has
put the word back in the middle. The fix is the edge's: on a reader's wheel
or touch it stops the glide it started, by a jump to where the view is.
Tests in `htmlFollow.test.ts` hold it.

Measured again here, in headless Chromium on the M5 (Playwright 1.61, an
800 px window, a page of 300 made-up passages painted with the edge alone;
the script and its output are in `~/Sync/audit/reader-glide-2585/`). The
voice moves to a word below, the edge glides, and a wheel lands 60 ms
later, five runs each:

| Glide of about 500 px       | Before                                      | After                                            |
| --------------------------- | ------------------------------------------- | ------------------------------------------------ |
| one wheel of 1500 px up     | detached 0 of 5; the view ended on the word | detached 5 of 5; the view stopped where it was   |
| fifteen wheels of 100 px up | detached 5 of 5                             | detached 5 of 5; the view ended about 1300 px up |

With a glide of about 3800 px and the wheel 120 ms in, before the fix the
view ended on the word in all ten runs, whatever was wheeled; after it, it
never did, and the reader was detached 10 of 10.

One thing the fix does not do: in Chromium the distance of the wheel that
stops the glide is itself not applied. After one 1500 px wheel the view
rested 60 to 115 px below where the wheel landed, not 1500 px above. The
next wheel scrolls as usual. Not measured: Safari, Firefox, a finger on a
phone, and the real Words page.

Whether "stop your own motion" should become an instruction of the rule, so
React and the phone do it too, is for slice 3, when `TranscriptFollow`
moves to `behavior/`.

## Tests

`packages/foldkit/src/behavior/reader.test.ts` holds the rule: every row of
the `step` table, the projection, and the labels. Each app's tests keep one
case per Message that reaches the block, and read the block's State where
they read `follow` or `maybeAway`. A test changes its expectation only for
a line under "What changes for a listener", or for a name this page says
changes (the mutated paths, the label).

## Audit

One fresh agent read this page against the code (2026-11-20). It found no
Blocker. Each finding, and the answer:

- **R-01, Major. The glide fix changes a painter the page said was not
  touched, and named Books for a painter Books does not use.** Taken. It
  has its own section now, says HTML edge and Words only, and says who
  measured it. It stays the edge's mechanic, as asked; moving it into the
  rule is noted for slice 3.
- **R-02, Major. In Words the named word became a stored token that goes
  stale when words change.** Taken. A word is named by its time only, and
  the token is found on each draw. The `Word({ token })` kind is gone.
- **R-03, Major. The skip decision did not name what it touches in
  Words.** Taken. The arms that tell `MovedVoice` and the two that must
  not are listed, with the mini player, the reversed test, and every way
  the 4 second mark now ends.
- **R-04, Major. `FinishedLive` read its context after the recording had
  finished, misnamed its field, and steps like `LeftVoice`.** Taken in
  part. Context is read before the update, said in choice 1. The field is
  `isPlaceSpoken`, true also for a first section with no words. The fact
  stays: the owner asked for the live rule in core, and with it Words
  holds no guard of its own.
- **R-05, Minor. A third copy exists in `examples/transcribe`.** Taken.
  Named, and left out on purpose.
- **R-06, Minor. Books' label is in the Catalog, and Words' help line
  spells both labels.** Taken. `meta.label` and the help line read
  `returnLabelOf`; the old spelling goes from comments and test names.
- **R-07, Minor. Kept Models: the shared snapshot, states the split field
  allows, unseen touches, and no test of an old Model.** Taken. All four
  are answered under "Books' logged Actions, kept Models and the
  terminal".
- **R-08, Minor. Three Words changes were not listed.** Taken. The step to
  the same match, the match selected before a section link, and the plain
  link to an open recording (row 12) are listed.
- **R-09, Minor. Differences from plan 14 not admitted.** Taken. See
  "Where this differs from plan 14".
- **R-10, Minor. Two facts share a row; `ForgotWord` was unclear for a
  word named by time.** Answered in choice 4. With one kind of word the
  second point is gone.
- **R-11, Minor. Books names the last word before a match while its words
  load, which the page did not say.** Taken. `project` says so, and keeps
  it.
- **R-12, Minor. Names missing from where the rule lives.** Taken. Added.
- **R-13, Nit. Words keeps no Model.** Taken. Row 18.
- **R-14, Nit. `project` must keep passage identity.** Taken. Said, and
  tested.
- **R-15, Nit. `hasWordAtPlace` broke the `is` rule; `isLive` and `target`
  say one thing twice.** The first is taken. The second stays: `isLive` is
  what the app knows, `target` is what a view draws.
- **R-16, Nit. `ForgotPassage` has no revision.** Taken. Words tells it
  only when its own revision matches.

What the audit did not check: nothing was run; the owner's quotes were
compared with plan 14, not the recording; tools outside the repo that read
Books' device traces by Model path.
