import { Array, Match as M, Option, Record, pipe } from 'effect'
import { type Html, createKeyedLazy, createLazy, html } from 'foldkit/html'
import {
  ClickedCopySectionLink,
  ClickedCopySectionText,
  ClickedWord,
  type ClipboardEntry,
  type FileUrls,
  type ImageEntry,
  type Message,
  type ReadyPlayback,
  type RecordingDetail,
  type Section,
  type Word,
  type WordsSeal,
  displayedPositionOf,
  followedSectionOf,
  formatClock,
  isLiveRecording,
  sealedLineTextOf,
  sectionAt,
  sectionElementIDOf,
  sectionPlaybackStart,
  speakerLabelOf,
  speakerRunStartIDsOf,
  timelineOf,
  wordAt,
} from 'words-core-example'

import { ObservePlayheadVisibility, TrackWordClicks } from '../mount.js'
import { type IconName, icon } from './icon.js'

const sectionSlots = createKeyedLazy()
const transcriptSlot = createLazy()

const wordView = (word: Word, isActive: boolean, isPlayable: boolean): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.Key(word.id),
      ...(isPlayable
        ? [h.DataAttribute('word-seconds', String(word.startSeconds))]
        : []),
      h.Class(`${isPlayable ? 'word' : ''} ${isActive ? 'word-current' : ''}`),
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
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.Popovertarget(menuID),
      h.Popovertargetaction('hide'),
      h.OnClick(message),
      h.Disabled(isDisabled),
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

const plainTimestamp = (section: Section): ReadonlyArray<Html> => {
  const h = html<Message>()
  return [
    h.span([h.Class(timestampClass)], [formatClock(section.startSeconds)]),
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

const sealedLineWords = (seal: WordsSeal): Html => {
  const h = html<Message>()
  return h.p(
    [h.Class('text-body leading-relaxed italic text-secondary')],
    [sealedLineTextOf(seal)],
  )
}

const openLineWords = (
  section: Section,
  activeWordID: string | undefined,
  isPlayable: boolean,
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
          wordView(word, word.id === activeWordID, isPlayable),
        ),
    }),
  )
}

const lineWords = (
  section: Section,
  activeWordID: string | undefined,
  isPlayable: boolean,
): Html =>
  Option.match(section.maybeWordsSeal, {
    onNone: () => openLineWords(section, activeWordID, isPlayable),
    onSome: sealedLineWords,
  })

const sectionView = (
  section: Section,
  activeWordID: string | undefined,
  isCurrent: boolean,
  isFocused: boolean,
  isFollowed: boolean,
  speakerLabel: string | undefined,
  isPlayable: boolean,
  hasActions: boolean,
): Html => {
  const h = html<Message>()
  const surface = isCurrent ? 'bg-fill/70' : ''
  return h.article(
    [
      h.Key(section.id),
      h.Id(sectionElementIDOf(section.id)),
      h.Class(
        `relative grid grid-cols-[calc(var(--type-unit)*56)_minmax(0,1fr)] gap-x-2 rounded-2xl px-2 py-1 transition sm:grid-cols-[calc(var(--type-unit)*68)_minmax(0,1fr)] ${surface} ${isFocused ? 'section-focused' : ''}`,
      ),
    ],
    [
      ...(hasActions
        ? sectionMenuButton(section, isPlayable)
        : plainTimestamp(section)),
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
          lineWords(section, activeWordID, isPlayable),
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
  currentSectionID: string | undefined,
  activeWordID: string | undefined,
  focusedSectionID: string | undefined,
  followedSectionID: string | undefined,
  isPlayable: boolean,
): Html => {
  const h = html<Message>()
  const runStartIDs = speakerRunStartIDsOf(detail.sections)
  return h.div(
    [h.OnMount(TrackWordClicks()), h.Class('flex flex-col gap-0.5')],
    Array.map(timelineOf(detail), entry =>
      M.value(entry).pipe(
        M.withReturnType<Html>(),
        M.tagsExhaustive({
          SectionEntry: ({ section }) =>
            sectionSlots(section.id, sectionView, [
              section,
              section.id === currentSectionID ? activeWordID : undefined,
              section.id === currentSectionID,
              section.id === focusedSectionID,
              section.id === followedSectionID,
              Array.contains(runStartIDs, section.id)
                ? Option.getOrUndefined(speakerLabelOf(detail, section))
                : undefined,
              isPlayable,
              true,
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

const hasPlayableAudio = (ready: ReadyPlayback): boolean =>
  ready.detail.audio._tag === 'StoredAudio' && !isLiveRecording(ready)

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
  const position = displayedPositionOf(ready)
  const maybeCurrent = isLiveRecording(ready)
    ? Option.none<Section>()
    : sectionAt(ready.detail.sections, position)
  const activeWordID = pipe(
    maybeCurrent,
    Option.flatMap(section => wordAt(section, position)),
    Option.map(word => word.id),
    Option.getOrUndefined,
  )
  return h.section(
    [
      h.AriaLabel('Transcript'),
      h.Class(
        `mx-auto w-full max-w-3xl pb-52 sm:px-4 min-[100rem]:max-w-[61rem] ${isFullScreen ? 'pl-2 pr-10 pt-16' : 'px-2 pt-2'}`,
      ),
    ],
    [
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
            sectionIDOf(maybeCurrent),
            activeWordID,
            Option.getOrUndefined(ready.maybeFocusedSectionID),
            sectionIDOf(followedSectionOf(ready)),
            hasPlayableAudio(ready),
          ]),
      }),
    ],
  )
}

/** A read-only list of sections, for a shared range without audio; speakers labeled once per run. */
export const readOnlySections = (
  sections: ReadonlyArray<Section>,
  speakerLabel: (section: Section) => string | undefined,
): Html => {
  const h = html<Message>()
  const runStartIDs = speakerRunStartIDsOf(sections)
  return h.div(
    [h.Class('flex flex-col gap-0.5')],
    Array.map(sections, section =>
      sectionView(
        section,
        undefined,
        false,
        false,
        false,
        Array.contains(runStartIDs, section.id)
          ? speakerLabel(section)
          : undefined,
        false,
        false,
      ),
    ),
  )
}
