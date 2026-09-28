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
  ScrolledTranscriptAway,
  type Section,
  type Word,
  displayedPositionOf,
  followedSectionOf,
  formatClock,
  isLiveRecording,
  sectionAt,
  sectionPlaybackStart,
  speakerLabelOf,
  timelineOf,
  wordAt,
} from 'words-core-example'

import { ScrollSectionIntoView } from '../mount.js'

const sectionSlots = createKeyedLazy()
const transcriptSlot = createLazy()

const wordView = (word: Word, isActive: boolean): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.Key(word.id),
      h.OnClick(ClickedWord({ seconds: word.startSeconds })),
      h.Class(
        isActive
          ? 'cursor-pointer rounded bg-amber-200 text-stone-950'
          : 'cursor-pointer rounded hover:bg-stone-200',
      ),
    ],
    [`${word.text} `],
  )
}

const sectionClass = (
  isCurrent: boolean,
  isFocused: boolean,
  isFinal: boolean,
): string => {
  const tone = isFinal ? 'text-stone-900' : 'text-stone-500 italic'
  if (isFocused) {
    return `scroll-mt-24 rounded-xl bg-amber-50 px-3 py-2 ring-2 ring-amber-300 transition ${tone}`
  } else if (isCurrent) {
    return `scroll-mt-24 rounded-xl bg-sky-50 px-3 py-2 transition ${tone}`
  } else {
    return `scroll-mt-24 rounded-xl px-3 py-2 transition ${tone}`
  }
}

const smallButtonClass =
  'min-h-9 rounded-full px-3 text-xs text-stone-500 hover:bg-stone-200 hover:text-stone-900'

const sectionView = (
  section: Section,
  activeWordID: string | undefined,
  isCurrent: boolean,
  isFocused: boolean,
  isScrollTarget: boolean,
  speakerLabel: string | undefined,
): Html => {
  const h = html<Message>()
  return h.article(
    [
      h.Key(section.id),
      h.Class(sectionClass(isCurrent, isFocused, section.isFinal)),
      ...(isScrollTarget
        ? [h.OnMount(ScrollSectionIntoView({ sectionID: section.id }))]
        : []),
    ],
    [
      h.div(
        [h.Class('flex flex-wrap items-center gap-1 text-xs text-stone-500')],
        [
          h.button(
            [
              h.Type('button'),
              h.Title('Play from here'),
              h.OnClick(
                ClickedWord({ seconds: sectionPlaybackStart(section) }),
              ),
              h.Class(`${smallButtonClass} font-mono`),
            ],
            [formatClock(section.startSeconds)],
          ),
          ...(speakerLabel === undefined
            ? []
            : [
                h.span(
                  [h.Class('font-semibold text-stone-700')],
                  [speakerLabel],
                ),
              ]),
          h.span([h.Class('flex-1')], []),
          h.button(
            [
              h.Type('button'),
              h.AriaLabel('Copy link to this moment'),
              h.OnClick(ClickedCopySectionLink({ sectionID: section.id })),
              h.Class(smallButtonClass),
            ],
            ['Copy link'],
          ),
          h.button(
            [
              h.Type('button'),
              h.AriaLabel('Copy this section'),
              h.OnClick(ClickedCopySectionText({ sectionID: section.id })),
              h.Class(smallButtonClass),
            ],
            ['Copy text'],
          ),
        ],
      ),
      h.p(
        [h.Class('text-[15px] leading-7')],
        Array.match(section.words, {
          onEmpty: () => [section.text],
          onNonEmpty: words =>
            Array.map(words, word => wordView(word, word.id === activeWordID)),
        }),
      ),
    ],
  )
}

const clipboardView = (clipboard: ClipboardEntry): Html => {
  const h = html<Message>()
  return h.aside(
    [
      h.Key(clipboard.id),
      h.Class(
        'mx-3 my-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700',
      ),
    ],
    [
      h.span(
        [h.Class('mr-2 font-mono text-xs text-stone-400')],
        [`${formatClock(clipboard.timestampSeconds)} Clipboard`],
      ),
      h.span([h.Class('line-clamp-4 whitespace-pre-wrap')], [clipboard.text]),
    ],
  )
}

const imageView = (
  image: ImageEntry,
  maybeUrl: Option.Option<string>,
): Html => {
  const h = html<Message>()
  return h.figure(
    [h.Key(image.id), h.Class('mx-3 my-2')],
    [
      Option.match(maybeUrl, {
        onNone: () =>
          h.div(
            [
              h.Class(
                'flex h-40 items-center justify-center rounded-xl bg-stone-200 text-sm text-stone-500',
              ),
            ],
            ['Loading image…'],
          ),
        onSome: url =>
          h.img([
            h.Src(url),
            h.Alt(`Image at ${formatClock(image.timestampSeconds)}`),
            h.Loading('lazy'),
            h.Class('max-h-96 rounded-xl border border-stone-200'),
          ]),
      }),
      h.figcaption(
        [h.Class('mt-1 font-mono text-xs text-stone-400')],
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
  scrollTargetID: string | undefined,
): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('flex flex-col gap-1')],
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
              section.id === scrollTargetID,
              Option.getOrUndefined(speakerLabelOf(detail, section)),
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

/**
 * The timeline. The section playing (or, while recording, the newest one)
 * stays on screen until the listener scrolls; a linked section is shown and
 * highlighted first.
 */
export const transcript = (ready: ReadyPlayback): Html => {
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
  const focusedSectionID = Option.getOrUndefined(ready.maybeFocusedSectionID)
  const followedSectionID =
    ready.follow === 'Following'
      ? sectionIDOf(followedSectionOf(ready))
      : undefined
  return h.section(
    [
      h.Class('mx-auto w-full max-w-3xl px-2 pb-48 pt-2'),
      ...(ready.follow === 'Following'
        ? [
            h.OnWheel(ScrolledTranscriptAway()),
            h.OnTouchMove(ScrolledTranscriptAway()),
          ]
        : []),
    ],
    [
      transcriptSlot(timelineView, [
        ready.detail,
        ready.fileUrls,
        sectionIDOf(maybeCurrent),
        activeWordID,
        focusedSectionID,
        focusedSectionID ?? followedSectionID,
      ]),
    ],
  )
}
