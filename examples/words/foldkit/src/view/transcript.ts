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
  speakerRunStartIDsOf,
  timelineOf,
  wordAt,
} from 'words-core-example'

import { ScrollSectionIntoView } from '../mount.js'
import { icon } from './icon.js'

const sectionSlots = createKeyedLazy()
const transcriptSlot = createLazy()

const wordView = (word: Word, isActive: boolean, isPlayable: boolean): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.Key(word.id),
      ...(isPlayable
        ? [h.OnClick(ClickedWord({ seconds: word.startSeconds }))]
        : []),
      h.Class(
        `${isPlayable ? 'word cursor-pointer' : ''} ${isActive ? 'word-current' : ''}`,
      ),
    ],
    [`${word.text} `],
  )
}

const sectionActionClass =
  'inline-flex size-8 items-center justify-center rounded-full text-tertiary transition hover:bg-fill hover:text-label'

const sectionView = (
  section: Section,
  activeWordID: string | undefined,
  isCurrent: boolean,
  isFocused: boolean,
  isScrollTarget: boolean,
  speakerLabel: string | undefined,
  isPlayable: boolean,
): Html => {
  const h = html<Message>()
  const surface = isCurrent ? 'bg-fill/70' : 'hover:bg-fill/40'
  return h.article(
    [
      h.Key(section.id),
      h.Class(
        `group/section grid scroll-mt-28 grid-cols-[3.5rem_1fr] gap-x-2 rounded-2xl px-2 py-2.5 transition sm:grid-cols-[4.25rem_1fr] ${surface} ${isFocused ? 'section-focused' : ''}`,
      ),
      ...(isScrollTarget
        ? [h.OnMount(ScrollSectionIntoView({ sectionID: section.id }))]
        : []),
    ],
    [
      h.button(
        [
          h.Type('button'),
          h.Title('Play from here'),
          h.AriaLabel(`Play from ${formatClock(section.startSeconds)}`),
          h.Disabled(!isPlayable),
          h.OnClick(ClickedWord({ seconds: sectionPlaybackStart(section) })),
          h.Class(
            'tabular self-start rounded-lg px-1.5 py-1 text-right font-mono text-[12px] leading-6 text-tertiary transition enabled:hover:bg-fill enabled:hover:text-tint disabled:cursor-default',
          ),
        ],
        [formatClock(section.startSeconds)],
      ),
      h.div(
        [h.Class('flex min-w-0 flex-col gap-0.5')],
        [
          h.div(
            [h.Class('flex min-h-6 items-center gap-2')],
            [
              ...(speakerLabel === undefined
                ? []
                : [
                    h.span(
                      [h.Class('text-[13px] font-semibold text-secondary')],
                      [speakerLabel],
                    ),
                  ]),
              h.span([h.Class('flex-1')], []),
              h.span(
                [
                  h.Class(
                    'flex items-center gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover/section:opacity-100 [@media(hover:none)]:opacity-100',
                  ),
                ],
                [
                  h.button(
                    [
                      h.Type('button'),
                      h.AriaLabel('Copy link to this section'),
                      h.Title('Copy link'),
                      h.OnClick(
                        ClickedCopySectionLink({ sectionID: section.id }),
                      ),
                      h.Class(sectionActionClass),
                    ],
                    [icon('Link', 'size-4')],
                  ),
                  h.button(
                    [
                      h.Type('button'),
                      h.AriaLabel('Copy this section’s text'),
                      h.Title('Copy text'),
                      h.OnClick(
                        ClickedCopySectionText({ sectionID: section.id }),
                      ),
                      h.Class(sectionActionClass),
                    ],
                    [icon('Copy', 'size-4')],
                  ),
                ],
              ),
            ],
          ),
          h.p(
            [
              h.Class(
                `text-[17px] leading-[1.65] ${section.isFinal ? 'text-label' : 'text-secondary'}`,
              ),
            ],
            Array.match(section.words, {
              onEmpty: () => [section.text],
              onNonEmpty: words =>
                Array.map(words, word =>
                  wordView(word, word.id === activeWordID, isPlayable),
                ),
            }),
          ),
        ],
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
        'my-1.5 ml-[3.75rem] mr-2 flex flex-col gap-1 rounded-2xl border border-separator bg-surface px-4 py-3 sm:ml-[4.5rem]',
      ),
    ],
    [
      h.span(
        [
          h.Class(
            'flex items-center gap-1.5 text-[12px] font-semibold text-secondary',
          ),
        ],
        [
          icon('Copy', 'size-3.5'),
          `Clipboard at ${formatClock(clipboard.timestampSeconds)}`,
        ],
      ),
      h.span(
        [h.Class('line-clamp-4 whitespace-pre-wrap text-[15px] text-label')],
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
    [h.Key(image.id), h.Class('my-2 ml-[3.75rem] mr-2 sm:ml-[4.5rem]')],
    [
      Option.match(maybeUrl, {
        onNone: () =>
          h.div(
            [
              h.Class(
                'flex h-44 items-center justify-center rounded-2xl bg-fill text-[14px] text-secondary',
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
        [h.Class('mt-1 font-mono text-[12px] text-tertiary')],
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
  isPlayable: boolean,
): Html => {
  const h = html<Message>()
  const runStartIDs = speakerRunStartIDsOf(detail.sections)
  return h.div(
    [h.Class('flex flex-col gap-0.5')],
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
              Array.contains(runStartIDs, section.id)
                ? Option.getOrUndefined(speakerLabelOf(detail, section))
                : undefined,
              isPlayable,
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

const waitingForWords = (): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Class(
        'flex flex-col items-center gap-2 rounded-3xl border border-dashed border-separator px-6 py-12 text-center',
      ),
    ],
    [
      icon('Microphone', 'size-7 text-tertiary'),
      h.p(
        [h.Class('text-[15px] text-secondary')],
        ['Listening. Words appear here as they are spoken.'],
      ),
    ],
  )
}

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
      h.AriaLabel('Transcript'),
      h.Class('mx-auto w-full max-w-3xl px-2 pb-52 pt-3 sm:px-4'),
      ...(ready.follow === 'Following'
        ? [
            h.OnWheel(ScrolledTranscriptAway()),
            h.OnTouchMove(ScrolledTranscriptAway()),
          ]
        : []),
    ],
    [
      Array.match(ready.detail.sections, {
        onEmpty: () =>
          isLiveRecording(ready)
            ? waitingForWords()
            : h.p(
                [h.Class('px-4 text-[15px] text-secondary')],
                ['This recording has no transcript.'],
              ),
        onNonEmpty: () =>
          transcriptSlot(timelineView, [
            ready.detail,
            ready.fileUrls,
            sectionIDOf(maybeCurrent),
            activeWordID,
            focusedSectionID,
            focusedSectionID ?? followedSectionID,
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
      ),
    ),
  )
}
