---
'foldkit': minor
'@foldkit/react': patch
'@foldkit/react-native': patch
---

How a Transcript's view follows the voice is now one rule every painter shares, `TranscriptFollow` in `foldkit/renderers`. `TranscriptFollow.step(state, context, fact)` is a pure function: it takes what happened, such as `ScrolledByReader()` or `MeasuredWord({ purpose: 'Leave', maybeSight })`, and returns what to do, such as `BringToMiddle({ word: 'Spoken' })` or `PressLeave()`. `TranscriptFollow.start(ports)` runs it for one painted Transcript: a painter gives it `now`, `told`, `measure`, `bringToMiddle` and `pressLeave`, and tells it facts. The HTML edge, the React painter and the React Native painter no longer carry their own copies of the quiet period after a scroll, the middle band, or the leave check. The HTML painter now also brings the spoken word back to the middle when a Program says the words follow again, as the other two already did. `shouldFollowWord` is still exported from `foldkit/renderers/html`.
