---
'foldkit': minor
---

How the words on screen stand to the voice is now one rule on the Model's side too: `Reader`, in the new `foldkit/behavior`. `Reader.State` is `Following` or `Detached` with the place to show, a word by the time it starts (`Reader.Word({ startMs: 10_802_400 })`) or a passage by its key (`Reader.Passage({ key: 's7' })`). `Reader.step(state, context, fact)` is pure and takes what happened: `LeftVoice()` when a painter presses leave, `ReturnedToVoice()`, `MovedVoice()` for a picked word, a seek or a skip, `NamedPlace({ place })` for a match of a search or a linked section, `ForgotWord()`, `ForgotPassage()`, and `FinishedLive({ isPlaceSpoken })` when a recording in progress ends. `Reader.project(state, transcript, { leaveAction })` writes `isFollowing`, `leaveAction`, `focusToken` and a passage's `isFocused` on the Transcript every painter draws, and `Reader.returnControlOf(state, { isLive })` gives the way back as data: `Back to Playhead`, or `Back to Live` while the newest word of a recording in progress is followed. A Program keeps the State in its Model, on the device that reads, and never logs it.

The HTML painter's edge now stops its own glide to the middle when the reader's wheel or finger lands on it, so a scroll made while the page is still gliding is not lost to the glide.
