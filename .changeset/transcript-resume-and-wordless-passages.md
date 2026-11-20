---
'foldkit': minor
'@foldkit/react': patch
'@foldkit/react-native': patch
---

Two changes to how every painter reads along with a Transcript.

`TranscriptFollow` gains the fact `ResumedFollowing()`, for a Transcript that says its words follow the voice again, as after the reader pressed the way back. It asks for `MeasureWord({ purpose: 'Follow' })` at once, whatever the reader scrolled before, and forgets that scroll, so the next word is followed too and a leave check that was still waiting presses nothing. The HTML edge, the React painter and the React Native painter tell it in place of `ChangedSpokenWord()` when following resumes. Before, a return pressed within a second of the last scroll followed again and moved nothing until the next word, and while paused there was none.

A passage with no words and a `startMs`, such as a line of text with no word times or one whose words are held back, is now spoken as one unit. `spokenUnitAt(transcript, nowMs)` answers `SpokenWord({ token })` or `SpokenPassage({ key })`. `transcriptAt` marks such a passage current, alone, while the place is in it, and clears every mark when the place is before the first word or wordless passage. `currentWordTokenAt` is none while the place is in a wordless passage. The HTML edge marks it the same way and follows it as it follows a word. The React and React Native painters mark it while the clock runs; they do not yet measure it or bring it to the middle.

A painter that calls `TranscriptFollow.step` itself with `ElapsedLeaveWait()` now gets no `MeasureWord` unless a reader's scroll is on record.
