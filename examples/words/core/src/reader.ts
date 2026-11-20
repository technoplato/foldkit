import { Array, Option, String } from 'effect'
import {
  type MenuAction,
  type TranscriptNode,
  transcriptWithMatches,
} from 'foldkit/renderers'

import {
  ClickedCopyWordLink,
  ClickedWord,
  ClosedWordMenu,
  type Message,
  OpenedWordMenu,
  ScrolledTranscriptAway,
} from './message.js'
import type { ReadyPlayback } from './model.js'
import {
  type ReadAlongPlayback,
  type TimelineOptions,
  timelineReadAlongOf,
} from './readAlong.js'
import type { Section } from './recording.js'
import { findOf, isAudioPlayableOf, wordMenuOf } from './update.js'

// PRESS

const playWordPress = 'ClickedWord'

const wordMenuPress = 'OpenedWordMenu'

const closeWordMenuPress = 'ClosedWordMenu'

const copyWordLinkPress = 'ClickedCopyWordLink'

const leavePress = 'ScrolledTranscriptAway'

const pressSeparator = ':'

type Word = Section['words'][number]

const wordOf = (ready: ReadyPlayback, wordID: string): Option.Option<Word> =>
  Array.findFirst(
    Array.flatMap(ready.detail.sections, section => section.words),
    word => word.id === wordID,
  )

// READER

const wordMenuItemsOf = (
  ready: ReadyPlayback,
  word: Word,
): ReadonlyArray<MenuAction> => {
  const play: MenuAction = {
    action: `${playWordPress}${pressSeparator}${word.id}`,
    label: 'Play from Here',
    icon: 'Play',
  }
  const copyLink: MenuAction = {
    action: `${copyWordLinkPress}${pressSeparator}${word.id}`,
    label: 'Copy Link to This Word',
    icon: 'Link',
  }
  return isAudioPlayableOf(ready) ? [play, copyLink] : [copyLink]
}

/**
 * The open recording as the one Transcript every Client paints, with
 * everything the Model says about reading it: the whole timeline of
 * `timelineReadAlongOf`, the words the search inside the recording found
 * and the match the listener is on, whether the words follow the voice,
 * the word to bring into view, and the menu open on a word. A painter
 * draws it and presses what it says; `readerMessageOf` turns each press
 * back into the Message the Model takes. A web page, a phone and a
 * terminal read the same recording the same way from it.
 *
 * @example
 * ```typescript
 * readerOf(ready, { positionSeconds: 4.2, isPlaying: true, reportedAtMs: Date.now(), rate: 1 })
 * // Transcript: 'lamp' at 0:04 Selected, following the voice, a long press on a word presses 'OpenedWordMenu:section-0:4'
 * ```
 */
export const readerOf = (
  ready: ReadyPlayback,
  playback: ReadAlongPlayback,
  options: TimelineOptions = {},
): TranscriptNode => {
  const timeline = timelineReadAlongOf(ready.detail, playback, options)
  const marked = Option.match(ready.maybeFind, {
    onNone: () => timeline,
    onSome: find =>
      transcriptWithMatches(
        timeline,
        find.query,
        Option.getOrUndefined(find.maybeSelectedMs),
      ),
  })
  const maybeFocusToken = Option.flatMap(findOf(ready), find =>
    Option.flatMap(find.maybeSelectedIndex, index =>
      Option.flatMap(Array.get(find.matches, index), match =>
        Array.head(match.wordIDs),
      ),
    ),
  )
  return {
    ...marked,
    action: playWordPress,
    isFollowing: ready.follow === 'Following',
    leaveAction: leavePress,
    wordMenuAction: wordMenuPress,
    ...Option.match(maybeFocusToken, {
      onNone: () => ({}),
      onSome: focusToken => ({ focusToken }),
    }),
    ...Option.match(wordMenuOf(ready), {
      onNone: () => ({}),
      onSome: ({ word }) => ({
        wordMenu: {
          token: word.id,
          items: wordMenuItemsOf(ready, word),
          dismissAction: closeWordMenuPress,
        },
      }),
    }),
  }
}

/**
 * The Message a press on the reader stands for, or none for a press it
 * does not know or a word that is no longer in the recording. A painter
 * reports a press as the Transcript wrote it, the word's id after the
 * colon: `ClickedWord:section-0:4` plays from that word, as a click on it
 * does on the web.
 *
 * @example
 * ```typescript
 * readerMessageOf(ready, 'ClickedWord:section-0:4') // Some(ClickedWord({ seconds: 4 }))
 * readerMessageOf(ready, 'ClosedWordMenu') // Some(ClosedWordMenu())
 * readerMessageOf(ready, 'ClickedWord:not-a-word') // None
 * ```
 */
export const readerMessageOf = (
  ready: ReadyPlayback,
  press: string,
): Option.Option<Message> => {
  if (press === closeWordMenuPress) {
    return Option.some(ClosedWordMenu())
  } else if (press === leavePress) {
    return Option.some(ScrolledTranscriptAway())
  } else {
    return Option.flatMap(String.indexOf(pressSeparator)(press), at => {
      const tag = press.slice(0, at)
      return Option.flatMap(
        wordOf(ready, press.slice(at + pressSeparator.length)),
        (word): Option.Option<Message> => {
          if (tag === playWordPress) {
            return Option.some(ClickedWord({ seconds: word.startSeconds }))
          } else if (tag === wordMenuPress) {
            return Option.some(
              OpenedWordMenu({ seconds: word.startSeconds, x: 0, y: 0 }),
            )
          } else if (tag === copyWordLinkPress) {
            return Option.some(ClickedCopyWordLink({ wordID: word.id }))
          } else {
            return Option.none()
          }
        },
      )
    })
  }
}
