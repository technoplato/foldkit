import { Array, Option, Record } from 'effect'
import { type Html, html } from 'foldkit/html'
import type { TextImage } from 'foldkit/renderers'
import { createPassageSlots, paintHtml } from 'foldkit/renderers/html'
import {
  ChangedFindQuery,
  ClosedFind,
  FIND_FIELD_ID,
  type FindState,
  type ImageEntry,
  type Message,
  type ReadyPlayback,
  type Section,
  SteppedFind,
  type Word,
  type WordsSeal,
  findOf,
  formatClock,
  isLiveRecording,
  readAlongPlaybackOf,
  readerMessageOf,
  readerOf,
  sealedLineTextOf,
  speakerRunStartIDsOf,
} from 'words-core-example'

import { icon } from './icon.js'

const passageSlots = createPassageSlots()

const PICTURE_WIDTH = 1200

const PICTURE_HEIGHT = 900

const wordView = (word: Word): Html => {
  const h = html<Message>()
  return h.span([h.Key(word.id)], [`${word.text} `])
}

const timestampClass =
  'tabular flex min-h-11 items-start justify-end self-start rounded-xl px-1.5 pt-[calc(var(--type-unit)*9)] font-mono text-footnote text-secondary'

const plainTimestamp = (
  section: Section,
  maybeMomentHref: string | undefined,
): Html => {
  const h = html<Message>()
  const time = formatClock(section.startSeconds)
  return maybeMomentHref === undefined
    ? h.span([h.Class(timestampClass)], [time])
    : // A time that opens something is the link, and wears the link's color (#1392, #1465).
      h.a(
        [
          h.Href(maybeMomentHref),
          h.AriaLabel(`Link to this moment, ${time}`),
          h.Class(`${timestampClass} !text-tint hover:underline`),
        ],
        [time],
      )
}

const softBar = (widthClass: string): Html => {
  const h = html<Message>()
  return h.span(
    [h.AriaHidden(true), h.Class(`h-3 ${widthClass} rounded-full bg-fill`)],
    [],
  )
}

const sealedLineWords = (seal: WordsSeal): Html => {
  const h = html<Message>()
  return h.p(
    [
      h.DataAttribute('sealed-line', seal),
      h.Title(sealedLineTextOf(seal)),
      h.Class('flex min-h-7 flex-wrap items-center gap-1.5 py-1'),
    ],
    [
      h.span([h.Class('sr-only')], [sealedLineTextOf(seal)]),
      softBar('w-16'),
      softBar('w-24'),
      softBar('w-10'),
      softBar('w-20'),
    ],
  )
}

const openLineWords = (section: Section): Html => {
  const h = html<Message>()
  return h.p(
    [
      h.Class(
        `text-body leading-relaxed ${section.isFinal ? 'text-label' : 'text-secondary'}`,
      ),
    ],
    Array.match(section.words, {
      onEmpty: () => [section.text],
      onNonEmpty: words => Array.map(words, wordView),
    }),
  )
}

const readOnlySectionView = (
  section: Section,
  speakerLabel: string | undefined,
  maybeMomentHref: string | undefined,
): Html => {
  const h = html<Message>()
  return h.article(
    [
      h.Key(section.id),
      h.DataAttribute('section-seconds', String(section.startSeconds)),
      h.Class(
        'relative grid grid-cols-[calc(var(--type-unit)*56)_minmax(0,1fr)] gap-x-2 rounded-2xl px-2 py-1 sm:grid-cols-[calc(var(--type-unit)*68)_minmax(0,1fr)]',
      ),
    ],
    [
      plainTimestamp(section, maybeMomentHref),
      h.div(
        [h.Class('flex min-w-0 flex-col py-1')],
        [
          ...(speakerLabel === undefined
            ? []
            : [
                h.span(
                  [h.Class('text-footnote font-semibold text-secondary')],
                  [speakerLabel],
                ),
              ]),
          Option.match(section.maybeWordsSeal, {
            onNone: () => openLineWords(section),
            onSome: sealedLineWords,
          }),
        ],
      ),
    ],
  )
}

const waitingForWords = (isTranscribing: boolean): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Class(
        'flex flex-col items-center gap-2 rounded-3xl border border-dashed border-separator px-6 py-12 text-center',
      ),
    ],
    [
      icon('Microphone', 'size-7 text-secondary'),
      h.p(
        [h.Class('text-subhead text-secondary')],
        [
          isTranscribing
            ? 'Listening. Words appear here as they are spoken.'
            : 'Recording. There is no live transcript right now.',
        ],
      ),
    ],
  )
}

const findStatusOf = (find: FindState): string => {
  if (find.query.trim() === '') {
    return ''
  } else if (find.matches.length === 0) {
    return 'No matches'
  } else {
    return Option.match(find.maybeSelectedIndex, {
      onNone: () =>
        `${find.matches.length.toString()} ${find.matches.length === 1 ? 'match' : 'matches'}`,
      onSome: index =>
        `${(index + 1).toString()} of ${find.matches.length.toString()}`,
    })
  }
}

const findStepButton = (
  label: string,
  direction: 'Next' | 'Previous',
  isDisabled: boolean,
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.AriaLabel(label),
      h.Title(label),
      h.Disabled(isDisabled),
      h.OnClick(SteppedFind({ direction })),
      h.Class(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-label enabled:hover:bg-fill disabled:opacity-40',
      ),
    ],
    [
      icon(
        'ChevronDown',
        direction === 'Previous' ? 'size-5 rotate-180' : 'size-5',
      ),
    ],
  )
}

/**
 * The search inside the recording, while it is open: a field for the
 * words, how the search stands (`2 of 7`), the match before and the next
 * one, and Done. Enter goes to the next match, Shift-Enter to the one
 * before, Escape closes. It stays at the top of the words while they
 * scroll to each match.
 */
const findBar = (ready: ReadyPlayback): ReadonlyArray<Html> => {
  const h = html<Message>()
  return Option.match(findOf(ready), {
    onNone: () => [],
    onSome: find => [
      h.div(
        [
          h.Role('search'),
          h.AriaLabel('Find in Recording'),
          h.Class('find-bar'),
        ],
        [
          icon('Search', 'ml-3 size-[18px] shrink-0 text-secondary'),
          h.input([
            h.Id(FIND_FIELD_ID),
            h.Type('search'),
            h.AriaLabel('Find in Recording'),
            h.Placeholder('Find in this recording'),
            h.Autocomplete('off'),
            h.Autofocus(true),
            h.Value(find.query),
            h.OnInput(query => ChangedFindQuery({ query })),
            h.OnKeyDownPreventDefault((key, modifiers) => {
              if (key === 'Enter') {
                return Option.some(
                  SteppedFind({
                    direction: modifiers.shiftKey ? 'Previous' : 'Next',
                  }),
                )
              } else if (key === 'Escape') {
                return Option.some(ClosedFind())
              } else {
                return Option.none()
              }
            }),
            h.Class(
              'min-h-11 min-w-0 flex-1 appearance-none border-0 bg-transparent text-body text-label outline-none placeholder:text-secondary [&::-webkit-search-cancel-button]:hidden',
            ),
          ]),
          h.span(
            [
              h.AriaLive('polite'),
              h.Class('tabular shrink-0 text-footnote text-secondary'),
            ],
            [findStatusOf(find)],
          ),
          findStepButton(
            'Previous Match',
            'Previous',
            find.matches.length === 0,
          ),
          findStepButton('Next Match', 'Next', find.matches.length === 0),
          h.button(
            [
              h.Type('button'),
              h.OnClick(ClosedFind()),
              h.Class(
                'mr-1 inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-subhead font-semibold text-tint hover:bg-fill',
              ),
            ],
            ['Done'],
          ),
        ],
      ),
    ],
  })
}

const pictureOf =
  (ready: ReadyPlayback) =>
  (image: ImageEntry): Option.Option<TextImage> =>
    Option.map(Record.get(ready.fileUrls, image.fileID), src => ({
      src,
      width: PICTURE_WIDTH,
      height: PICTURE_HEIGHT,
    }))

// NOTE: the page adds nothing to the shared reader's follow. The painter's
// own edge marks the word the reader's clock has reached, keeps it in the
// middle while the words follow the voice, brings the word the reader names
// to the middle, and presses the reader's leave action when the listener
// scrolls the spoken word away.
const readerView = (ready: ReadyPlayback): Html =>
  paintHtml<Message>(
    readerOf(ready, readAlongPlaybackOf(ready), {
      pictureOf: pictureOf(ready),
    }),
    press => Option.getOrUndefined(readerMessageOf(ready, press)),
    { passageSlots },
  )

/**
 * The timeline, painted from the shared reader (`readerOf`) as every
 * Client paints it. The word being spoken (or, while recording, the newest
 * one) stays in the middle until the listener scrolls it away; a linked
 * section is shown and highlighted first. Each time opens its section's
 * menu, and a right click or a long press on a word opens the word's.
 */
export const transcript = (
  ready: ReadyPlayback,
  isTranscribing: boolean,
  isFullScreen: boolean,
): Html => {
  const h = html<Message>()
  return h.section(
    [
      h.AriaLabel('Transcript'),
      h.Class(
        `words-reader mx-auto w-full max-w-3xl pb-52 sm:px-4 min-[100rem]:max-w-[61rem] ${isFullScreen ? 'pl-2 pr-10 pt-16' : 'px-2 pt-2'}`,
      ),
    ],
    [
      ...findBar(ready),
      Array.match(ready.detail.sections, {
        onEmpty: () =>
          isLiveRecording(ready)
            ? waitingForWords(isTranscribing)
            : h.p(
                [h.Class('px-4 text-subhead text-secondary')],
                ['This recording has no transcript.'],
              ),
        onNonEmpty: () => readerView(ready),
      }),
    ],
  )
}

/** A read-only list of sections, for a shared range without audio; speakers labeled once per run. */
export const readOnlySections = (
  sections: ReadonlyArray<Section>,
  speakerLabel: (section: Section) => string | undefined,
  momentHref?: (section: Section) => string | undefined,
): Html => {
  const h = html<Message>()
  const runStartIDs = speakerRunStartIDsOf(sections)
  return h.div(
    [h.Class('flex flex-col gap-0.5')],
    Array.map(sections, section =>
      readOnlySectionView(
        section,
        Array.contains(runStartIDs, section.id)
          ? speakerLabel(section)
          : undefined,
        momentHref?.(section),
      ),
    ),
  )
}
