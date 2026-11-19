import { Array, Match as M, Option, Record, Schema as S, pipe } from 'effect'
import { type Html, createKeyedLazy, createLazy, html } from 'foldkit/html'
import {
  ChangedFindQuery,
  ClickedCopySectionLink,
  ClickedCopySectionText,
  ClickedCopySectionWordLink,
  ClickedCopyWordLink,
  ClickedWord,
  type ClipboardEntry,
  ClosedFind,
  ClosedWordMenu,
  FIND_FIELD_ID,
  type FileUrls,
  type FindState,
  type ImageEntry,
  type Message,
  type ReadyPlayback,
  type RecordingDetail,
  type Section,
  SteppedFind,
  type Word,
  type WordsSeal,
  findOf,
  followedSectionOf,
  formatClock,
  isAudioPlayableOf,
  isLiveRecording,
  sealedLineTextOf,
  sectionElementIDOf,
  sectionPlaybackStart,
  speakerLabelOf,
  speakerRunStartIDsOf,
  timelineOf,
  wordMenuOf,
} from 'words-core-example'

import {
  ObservePlayheadVisibility,
  RunSpokenWord,
  TrackWordClicks,
  TrackWordMenus,
} from '../mount.js'
import { clockAttributes } from './clock.js'
import { type IconName, icon } from './icon.js'

const sectionSlots = createKeyedLazy()
const transcriptSlot = createLazy()

// NOTE: The view does not mark the word being spoken. It says when each
// word starts, and the edge marks the one the playback clock has reached
// (RunSpokenWord), so the place need only be heard about once a second.
/** How the search inside the recording marks a word, if it does. */
type FindMark = 'Found' | 'Selected'

const wordView = (
  word: Word,
  isPlayable: boolean,
  maybeMark: FindMark | undefined,
): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.Key(word.id),
      ...(isPlayable
        ? [h.DataAttribute('word-seconds', String(word.startSeconds))]
        : []),
      ...(maybeMark === undefined ? [] : [h.DataAttribute('find', maybeMark)]),
      h.Class(isPlayable ? 'word' : ''),
    ],
    [`${word.text} `],
  )
}

const menuIDOf = (section: Section): string => `section-menu-${section.id}`

const anchorNameOf = (section: Section): string => `--section-${section.id}`

const menuItem = (
  menuID: string,
  iconName: IconName,
  label: string,
  message: Message,
  isDisabled = false,
  maybeHelp?: string,
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.Popovertarget(menuID),
      h.Popovertargetaction('hide'),
      h.OnClick(message),
      h.Disabled(isDisabled),
      ...(maybeHelp === undefined ? [] : [h.Title(maybeHelp)]),
      h.Class(
        'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-subhead text-label enabled:hover:bg-fill disabled:opacity-40',
      ),
    ],
    [icon(iconName, 'size-[18px] text-secondary'), label],
  )
}

const sectionMenu = (section: Section, isPlayable: boolean): Html => {
  const h = html<Message>()
  const menuID = menuIDOf(section)
  return h.div(
    [
      h.Id(menuID),
      h.Popover('auto'),
      h.AriaLabel(`Section at ${formatClock(section.startSeconds)}`),
      h.Style({ positionAnchor: anchorNameOf(section) }),
      h.Class('menu-popover glass'),
    ],
    [
      menuItem(
        menuID,
        'Play',
        'Play from Here',
        ClickedWord({ seconds: sectionPlaybackStart(section) }),
        !isPlayable,
      ),
      menuItem(
        menuID,
        'Link',
        'Copy Link to This Moment',
        ClickedCopySectionLink({ sectionID: section.id }),
      ),
      menuItem(
        menuID,
        'Link',
        'Copy Link to This Word',
        ClickedCopySectionWordLink({ sectionID: section.id }),
        false,
        'A link to the word being spoken in this section, or to its first word. On a computer, a right click on any word offers its own link.',
      ),
      menuItem(
        menuID,
        'Copy',
        'Copy Text',
        ClickedCopySectionText({ sectionID: section.id }),
      ),
    ],
  )
}

const timestampClass =
  'tabular flex min-h-11 items-start justify-end self-start rounded-xl px-1.5 pt-[calc(var(--type-unit)*9)] font-mono text-footnote text-secondary'

const sectionMenuButton = (
  section: Section,
  isPlayable: boolean,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  const time = formatClock(section.startSeconds)
  return [
    h.button(
      [
        h.Type('button'),
        h.Popovertarget(menuIDOf(section)),
        h.AriaLabel(`${time}, section actions`),
        h.Title('Play, copy a link, or copy the text'),
        h.Style({ anchorName: anchorNameOf(section) }),
        h.Class(`${timestampClass} transition hover:bg-fill hover:text-label`),
      ],
      [time],
    ),
    sectionMenu(section, isPlayable),
  ]
}

const plainTimestamp = (
  section: Section,
  maybeMomentHref: string | undefined,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  const time = formatClock(section.startSeconds)
  return [
    maybeMomentHref === undefined
      ? h.span([h.Class(timestampClass)], [time])
      : // A time that opens something is the link, and wears the link's color (#1392, #1465).
        h.a(
          [
            h.Href(maybeMomentHref),
            h.AriaLabel(`Link to this moment, ${time}`),
            h.Class(`${timestampClass} !text-tint hover:underline`),
          ],
          [time],
        ),
  ]
}

const playheadSentinel = (section: Section): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.AriaHidden(true),
      h.OnMount(ObservePlayheadVisibility({ sectionID: section.id })),
      h.Class('pointer-events-none absolute inset-0'),
    ],
    [],
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

/**
 * The words of a section the search found, and those of the match the
 * listener is on, as two lists of word ids joined by commas: plain text,
 * so a section is drawn again only when its own marks change.
 */
type SectionMarks = Readonly<{ found: string; selected: string }>

const noMarks: SectionMarks = { found: '', selected: '' }

const markOf = (marks: SectionMarks, wordID: string): FindMark | undefined => {
  if (marks.selected !== '' && marks.selected.split(',').includes(wordID)) {
    return 'Selected'
  } else if (marks.found !== '' && marks.found.split(',').includes(wordID)) {
    return 'Found'
  } else {
    return undefined
  }
}

const openLineWords = (
  section: Section,
  isPlayable: boolean,
  marks: SectionMarks,
): Html => {
  const h = html<Message>()
  return h.p(
    [
      h.Class(
        `text-body leading-relaxed ${section.isFinal ? 'text-label' : 'text-secondary'}`,
      ),
    ],
    Array.match(section.words, {
      onEmpty: () => [section.text],
      onNonEmpty: words =>
        Array.map(words, word =>
          wordView(word, isPlayable, markOf(marks, word.id)),
        ),
    }),
  )
}

const lineWords = (
  section: Section,
  isPlayable: boolean,
  marks: SectionMarks,
): Html =>
  Option.match(section.maybeWordsSeal, {
    onNone: () => openLineWords(section, isPlayable, marks),
    onSome: sealedLineWords,
  })

const sectionView = (
  section: Section,
  isFocused: boolean,
  isFollowed: boolean,
  speakerLabel: string | undefined,
  isPlayable: boolean,
  hasActions: boolean,
  maybeMomentHref?: string,
  found = '',
  selected = '',
): Html => {
  const h = html<Message>()
  return h.article(
    [
      h.Key(section.id),
      h.Id(sectionElementIDOf(section.id)),
      h.DataAttribute('section-seconds', String(section.startSeconds)),
      h.Class(
        `relative grid grid-cols-[calc(var(--type-unit)*56)_minmax(0,1fr)] gap-x-2 rounded-2xl px-2 py-1 transition sm:grid-cols-[calc(var(--type-unit)*68)_minmax(0,1fr)] ${isFocused ? 'section-focused' : ''}`,
      ),
    ],
    [
      ...(hasActions
        ? sectionMenuButton(section, isPlayable)
        : plainTimestamp(section, maybeMomentHref)),
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
          lineWords(section, isPlayable, { found, selected }),
        ],
      ),
      ...(isFollowed ? [playheadSentinel(section)] : []),
    ],
  )
}

const clipboardView = (clipboard: ClipboardEntry): Html => {
  const h = html<Message>()
  return h.aside(
    [
      h.Key(clipboard.id),
      h.Class(
        'my-1.5 ml-[calc(var(--type-unit)*60)] mr-2 flex flex-col gap-1 rounded-2xl border border-separator bg-surface px-4 py-3 sm:ml-[calc(var(--type-unit)*72)]',
      ),
    ],
    [
      h.span(
        [
          h.Class(
            'flex items-center gap-1.5 text-footnote font-semibold text-secondary',
          ),
        ],
        [
          icon('Copy', 'size-3.5'),
          `Clipboard at ${formatClock(clipboard.timestampSeconds)}`,
        ],
      ),
      h.span(
        [h.Class('line-clamp-4 whitespace-pre-wrap text-subhead text-label')],
        [clipboard.text],
      ),
    ],
  )
}

const imageView = (
  image: ImageEntry,
  maybeUrl: Option.Option<string>,
): Html => {
  const h = html<Message>()
  return h.figure(
    [
      h.Key(image.id),
      h.Class(
        'my-2 ml-[calc(var(--type-unit)*60)] mr-2 sm:ml-[calc(var(--type-unit)*72)]',
      ),
    ],
    [
      Option.match(maybeUrl, {
        onNone: () =>
          h.div(
            [
              h.Class(
                'flex h-44 items-center justify-center rounded-2xl bg-fill text-subhead text-secondary',
              ),
            ],
            ['Loading image'],
          ),
        onSome: url =>
          h.img([
            h.Src(url),
            h.Alt(`Image at ${formatClock(image.timestampSeconds)}`),
            h.Loading('lazy'),
            h.Class('max-h-96 rounded-2xl border border-separator'),
          ]),
      }),
      h.figcaption(
        [h.Class('tabular mt-1 font-mono text-footnote text-secondary')],
        [formatClock(image.timestampSeconds)],
      ),
    ],
  )
}

const timelineView = (
  detail: RecordingDetail,
  fileUrls: FileUrls,
  focusedSectionID: string | undefined,
  followedSectionID: string | undefined,
  isPlayable: boolean,
  marksKey: string,
): Html => {
  const h = html<Message>()
  const runStartIDs = speakerRunStartIDsOf(detail.sections)
  const marks = marksOfKey(marksKey)
  return h.div(
    [h.OnMount(TrackWordClicks()), h.Class('flex flex-col gap-0.5')],
    Array.map(timelineOf(detail), entry =>
      M.value(entry).pipe(
        M.withReturnType<Html>(),
        M.tagsExhaustive({
          SectionEntry: ({ section }) =>
            sectionSlots(section.id, sectionView, [
              section,
              section.id === focusedSectionID,
              section.id === followedSectionID,
              Array.contains(runStartIDs, section.id)
                ? Option.getOrUndefined(speakerLabelOf(detail, section))
                : undefined,
              isPlayable,
              true,
              undefined,
              (marks[section.id] ?? noMarks).found,
              (marks[section.id] ?? noMarks).selected,
            ]),
          ClipboardTimelineEntry: ({ clipboard }) => clipboardView(clipboard),
          ImageTimelineEntry: ({ image }) =>
            imageView(image, Record.get(fileUrls, image.fileID)),
        }),
      ),
    ),
  )
}

const sectionIDOf = (
  maybeSection: Option.Option<Section>,
): string | undefined =>
  Option.getOrUndefined(Option.map(maybeSection, section => section.id))

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

/**
 * Every section's marks from the search inside the recording, as one
 * piece of text, so the timeline is drawn again only when what is found,
 * or the match the listener is on, changes. Empty while nothing is found.
 */
const marksKeyOf = (ready: ReadyPlayback): string =>
  Option.match(findOf(ready), {
    onNone: () => '',
    onSome: find =>
      Array.match(find.matches, {
        onEmpty: () => '',
        onNonEmpty: matches => {
          const maybeSelected = Option.flatMap(find.maybeSelectedIndex, index =>
            Array.get(matches, index),
          )
          const sectionIDs = Array.dedupe(
            Array.map(matches, match => match.sectionID),
          )
          return JSON.stringify(
            Array.map(sectionIDs, sectionID => [
              sectionID,
              pipe(
                matches,
                Array.filter(match => match.sectionID === sectionID),
                Array.flatMap(match => match.wordIDs),
                Array.join(','),
              ),
              Option.match(
                Option.filter(
                  maybeSelected,
                  selected => selected.sectionID === sectionID,
                ),
                {
                  onNone: () => '',
                  onSome: selected => selected.wordIDs.join(','),
                },
              ),
            ]),
          )
        },
      }),
  })

const MarksRows = S.fromJsonString(
  S.Array(S.Tuple([S.String, S.String, S.String])),
)

const marksOfKey = (key: string): Readonly<Record<string, SectionMarks>> =>
  key === ''
    ? {}
    : Option.match(S.decodeUnknownOption(MarksRows)(key), {
        onNone: () => ({}),
        onSome: rows =>
          Object.fromEntries(
            Array.map(rows, ([sectionID, found, selected]) => [
              sectionID,
              { found, selected },
            ]),
          ),
      })

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

const wordMenuItem = (
  iconName: IconName,
  label: string,
  message: Message,
  isDisabled = false,
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.Role('menuitem'),
      h.OnClick(message),
      h.Disabled(isDisabled),
      h.Class(
        'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-subhead text-label enabled:hover:bg-fill disabled:opacity-40',
      ),
    ],
    [icon(iconName, 'size-[18px] text-secondary'), label],
  )
}

/**
 * A word's menu, opened by a right click on the word: Play from Here and
 * Copy Link to This Word, drawn where the word was pressed. Whether it is
 * open, and on which word, is the Model's; a click outside it or Escape
 * closes it. The element is always there, since it carries the listener
 * that opens the menu.
 */
const wordMenu = (ready: ReadyPlayback): Html => {
  const h = html<Message>()
  return h.div(
    [h.OnMount(TrackWordMenus()), h.DataAttribute('word-menu-host', '')],
    Option.match(wordMenuOf(ready), {
      onNone: () => [],
      onSome: ({ word, x, y }) => [
        h.div(
          [
            h.AriaHidden(true),
            h.OnClick(ClosedWordMenu()),
            h.OnContextMenu(ClosedWordMenu()),
            h.Class('word-menu-backdrop'),
          ],
          [],
        ),
        h.div(
          [
            h.Role('menu'),
            h.AriaLabel(`“${word.text}” at ${formatClock(word.startSeconds)}`),
            h.Style({
              '--word-menu-x': `${x}px`,
              '--word-menu-y': `${y}px`,
            }),
            h.OnKeyDownPreventDefault(key =>
              key === 'Escape' ? Option.some(ClosedWordMenu()) : Option.none(),
            ),
            h.Class('word-menu glass'),
          ],
          [
            wordMenuItem(
              'Play',
              'Play from Here',
              ClickedWord({ seconds: word.startSeconds }),
              !isAudioPlayableOf(ready),
            ),
            wordMenuItem(
              'Link',
              'Copy Link to This Word',
              ClickedCopyWordLink({ wordID: word.id }),
            ),
          ],
        ),
      ],
    }),
  )
}

/**
 * The timeline. The section playing (or, while recording, the newest one)
 * stays on screen until the listener scrolls away; a linked section is shown
 * and highlighted first. Each timestamp opens the section's menu.
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
      ...clockAttributes(ready),
      h.OnMount(RunSpokenWord()),
      h.Class(
        `mx-auto w-full max-w-3xl pb-52 sm:px-4 min-[100rem]:max-w-[61rem] ${isFullScreen ? 'pl-2 pr-10 pt-16' : 'px-2 pt-2'}`,
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
        onNonEmpty: () =>
          transcriptSlot(timelineView, [
            ready.detail,
            ready.fileUrls,
            Option.getOrUndefined(ready.maybeFocusedSectionID),
            sectionIDOf(followedSectionOf(ready)),
            isAudioPlayableOf(ready),
            marksKeyOf(ready),
          ]),
      }),
      wordMenu(ready),
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
      sectionView(
        section,
        false,
        false,
        Array.contains(runStartIDs, section.id)
          ? speakerLabel(section)
          : undefined,
        false,
        false,
        momentHref?.(section),
      ),
    ),
  )
}
