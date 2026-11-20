import { Array, Option, String } from 'effect'
import { Reader } from 'foldkit/behavior'
import {
  type MenuAction,
  type TranscriptNode,
  type TranscriptPassage,
  transcriptWithMatches,
} from 'foldkit/renderers'

import {
  ClickedCopySectionLink,
  ClickedCopySectionText,
  ClickedCopySectionWordLink,
  ClickedCopyWordLink,
  ClickedWord,
  ClosedSectionMenu,
  ClosedWordMenu,
  type Message,
  OpenedSectionMenu,
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
import { sectionPlaybackStart } from './transcript.js'
import { isAudioPlayableOf, sectionMenuOf, wordMenuOf } from './update.js'

// PRESS

const playWordPress = 'ClickedWord'

const wordMenuPress = 'OpenedWordMenu'

const closeWordMenuPress = 'ClosedWordMenu'

const copyWordLinkPress = 'ClickedCopyWordLink'

const leavePress = 'ScrolledTranscriptAway'

const sectionMenuPress = 'OpenedSectionMenu'

const closeSectionMenuPress = 'ClosedSectionMenu'

const playSectionPress = 'ClickedPlaySection'

const copySectionLinkPress = 'ClickedCopySectionLink'

const copySectionWordLinkPress = 'ClickedCopySectionWordLink'

const copySectionTextPress = 'ClickedCopySectionText'

const pressSeparator = ':'

const pressOf = (tag: string, id: string): string =>
  `${tag}${pressSeparator}${id}`

type Word = Section['words'][number]

const wordOf = (ready: ReadyPlayback, wordID: string): Option.Option<Word> =>
  Array.findFirst(
    Array.flatMap(ready.detail.sections, section => section.words),
    word => word.id === wordID,
  )

const sectionOf = (
  ready: ReadyPlayback,
  sectionID: string,
): Option.Option<Section> =>
  Array.findFirst(ready.detail.sections, section => section.id === sectionID)

// READER

// NOTE: a passage keeps its identity from one render to the next while its
// section does, so the press on its time is added once per passage, and a
// page that keeps passages drawn draws again only those that changed.
const pressablePassages = new WeakMap<TranscriptPassage, TranscriptPassage>()

const withSectionMenuPress = (
  passage: TranscriptPassage,
): TranscriptPassage => {
  const maybeKept = pressablePassages.get(passage)
  if (maybeKept !== undefined) {
    return maybeKept
  }
  const pressable = {
    ...passage,
    labelAction: pressOf(sectionMenuPress, passage.key),
  }
  pressablePassages.set(passage, pressable)
  return pressable
}

const sectionMenuItemsOf = (
  ready: ReadyPlayback,
  section: Section,
): ReadonlyArray<MenuAction> => {
  const play: MenuAction = {
    action: pressOf(playSectionPress, section.id),
    label: 'Play from Here',
    icon: 'Play',
  }
  return [
    ...(isAudioPlayableOf(ready) ? [play] : []),
    ...sectionCopyItemsOf(section),
  ]
}

const sectionCopyItemsOf = (section: Section): ReadonlyArray<MenuAction> => [
  {
    action: pressOf(copySectionLinkPress, section.id),
    label: 'Copy Link to This Moment',
    icon: 'Link',
  },
  {
    action: pressOf(copySectionWordLinkPress, section.id),
    label: 'Copy Link to This Word',
    icon: 'Link',
  },
  {
    action: pressOf(copySectionTextPress, section.id),
    label: 'Copy Text',
  },
]

const wordMenuItemsOf = (
  ready: ReadyPlayback,
  word: Word,
): ReadonlyArray<MenuAction> => {
  const play: MenuAction = {
    action: pressOf(playWordPress, word.id),
    label: 'Play from Here',
    icon: 'Play',
  }
  const copyLink: MenuAction = {
    action: pressOf(copyWordLinkPress, word.id),
    label: 'Copy Link to This Word',
    icon: 'Link',
  }
  return isAudioPlayableOf(ready) ? [play, copyLink] : [copyLink]
}

/**
 * The open recording as the one Transcript every Client paints, with
 * everything the Model says about reading it: the whole timeline of
 * `timelineReadAlongOf`, the words the search inside the recording found
 * and the match the listener is on, the menu open on a word or on a
 * section's time, and what Foldkit's reader rule says of how the words
 * stand to the voice: whether they follow it, the word to bring into
 * view, and the section a link opened on. A painter
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
  const pressable: TranscriptNode = {
    ...marked,
    passages: Array.map(marked.passages, withSectionMenuPress),
    action: playWordPress,
    wordMenuAction: wordMenuPress,
    ...Option.match(sectionMenuOf(ready), {
      onNone: () => ({}),
      onSome: section => ({
        passageMenu: {
          key: section.id,
          items: sectionMenuItemsOf(ready, section),
          dismissAction: closeSectionMenuPress,
        },
      }),
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
  return Reader.project(ready.reader, pressable, { leaveAction: leavePress })
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
 * readerMessageOf(ready, 'OpenedSectionMenu:section-1') // Some(OpenedSectionMenu({ sectionID: 'section-1' }))
 * readerMessageOf(ready, 'ClickedWord:not-a-word') // None
 * ```
 */
export const readerMessageOf = (
  ready: ReadyPlayback,
  press: string,
): Option.Option<Message> => {
  if (press === closeWordMenuPress) {
    return Option.some(ClosedWordMenu())
  } else if (press === closeSectionMenuPress) {
    return Option.some(ClosedSectionMenu())
  } else if (press === leavePress) {
    return Option.some(ScrolledTranscriptAway())
  } else {
    return Option.flatMap(String.indexOf(pressSeparator)(press), at => {
      const tag = press.slice(0, at)
      const id = press.slice(at + pressSeparator.length)
      return Option.orElse(wordMessageOf(ready, tag, id), () =>
        sectionMessageOf(ready, tag, id),
      )
    })
  }
}

const wordMessageOf = (
  ready: ReadyPlayback,
  tag: string,
  wordID: string,
): Option.Option<Message> =>
  Option.flatMap(wordOf(ready, wordID), (word): Option.Option<Message> => {
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
  })

const sectionMessageOf = (
  ready: ReadyPlayback,
  tag: string,
  sectionID: string,
): Option.Option<Message> =>
  Option.flatMap(
    sectionOf(ready, sectionID),
    (section): Option.Option<Message> => {
      if (tag === sectionMenuPress) {
        return Option.some(OpenedSectionMenu({ sectionID: section.id }))
      } else if (tag === playSectionPress) {
        return Option.some(
          ClickedWord({ seconds: sectionPlaybackStart(section) }),
        )
      } else if (tag === copySectionLinkPress) {
        return Option.some(ClickedCopySectionLink({ sectionID: section.id }))
      } else if (tag === copySectionWordLinkPress) {
        return Option.some(
          ClickedCopySectionWordLink({ sectionID: section.id }),
        )
      } else if (tag === copySectionTextPress) {
        return Option.some(ClickedCopySectionText({ sectionID: section.id }))
      } else {
        return Option.none()
      }
    },
  )
