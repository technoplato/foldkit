import { Array, Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  ClickedCopyMomentLink,
  ClickedCopyRecordingLink,
  ClickedCopyTranscript,
  ClickedOpenInApp,
  ClickedPause,
  ClickedPlay,
  ClickedRetryAudio,
  ClickedReturnToPlayhead,
  ClickedSkip,
  EndedScrub,
  GotShareMessage,
  type Message,
  MovedScrub,
  type ReadyPlayback,
  Share,
  type TranscriptFormat,
  displayedPositionOf,
  durationOf,
  formatClock,
  isLiveRecording,
} from 'words-core-example'

import { type IconName, icon } from './icon.js'
import { type ViewConfig, backToRecordings } from './shell.js'
import { transcript } from './transcript.js'
import { badge, button, compactButton } from './ui.js'

const SKIP_SECONDS = 15

const startedLabel = (startedAtMs: number): string =>
  new Date(startedAtMs).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

const copyFormatItem = (format: TranscriptFormat, label: string): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.Role('menuitem'),
      h.OnClick(ClickedCopyTranscript({ format })),
      h.Class(
        'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-label hover:bg-fill',
      ),
    ],
    [icon('Copy', 'size-4 text-secondary'), label],
  )
}

const copyMenu = (): Html => {
  const h = html<Message>()
  return h.details(
    [h.Class('group relative')],
    [
      h.summary(
        [
          h.AriaLabel('Copy the transcript'),
          h.Title('Copy the transcript'),
          h.Class(
            'inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full bg-fill px-4 text-[15px] font-semibold text-label transition hover:bg-fill-strong max-sm:px-3',
          ),
        ],
        [
          icon('Copy', 'size-[18px]'),
          h.span([h.Class('max-sm:hidden')], ['Copy transcript']),
          icon(
            'ChevronDown',
            'size-4 text-secondary transition group-open:rotate-180',
          ),
        ],
      ),
      h.div(
        [
          h.Role('menu'),
          h.Class(
            'glass absolute left-0 top-[calc(100%+6px)] z-20 w-56 rounded-2xl p-1.5',
          ),
        ],
        [
          copyFormatItem('PlainText', 'Plain text'),
          copyFormatItem('Markdown', 'Markdown'),
          copyFormatItem('Srt', 'SRT subtitles'),
        ],
      ),
    ],
  )
}

const shareRangeOf = (ready: ReadyPlayback): readonly [number, number] => {
  const finals = Array.filter(ready.detail.sections, section => section.isFinal)
  return [
    Option.getOrElse(
      Option.map(Array.head(finals), section => section.index),
      () => 0,
    ),
    Option.getOrElse(
      Option.map(Array.last(finals), section => section.index),
      () => 0,
    ),
  ]
}

const recordingHeader = (ready: ReadyPlayback, config: ViewConfig): Html => {
  const h = html<Message>()
  const summary = ready.detail.summary
  const [rangeStartIndex, rangeEndIndex] = shareRangeOf(ready)
  const hasFinalSections = Array.some(
    ready.detail.sections,
    section => section.isFinal,
  )
  return h.header(
    [h.Class('mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-4 sm:px-6')],
    [
      backToRecordings(),
      h.div(
        [h.Class('flex flex-col gap-2')],
        [
          h.div(
            [h.Class('flex flex-wrap items-center gap-2.5')],
            [
              h.h1(
                [
                  h.Class(
                    'text-[26px] font-bold leading-tight tracking-tight text-label sm:text-[30px]',
                  ),
                ],
                [summary.title],
              ),
              ...(isLiveRecording(ready) ? [badge('Live', 'LIVE')] : []),
            ],
          ),
          h.p(
            [h.Class('tabular text-[15px] text-secondary')],
            [
              `${startedLabel(summary.startedAtMs)} · ${formatClock(Math.max(summary.durationSeconds, durationOf(ready)))}`,
            ],
          ),
        ],
      ),
      ...(ready.skippedCount > 0
        ? [
            h.p(
              [
                h.Class(
                  'rounded-2xl bg-caution-soft px-4 py-3 text-[14px] text-caution',
                ),
              ],
              [
                `${ready.skippedCount} rows of this recording could not be read and are not shown. ${Option.getOrElse(ready.maybeSkippedReason, () => '')}`,
              ],
            ),
          ]
        : []),
      h.div(
        [h.Class('flex flex-wrap items-center gap-2 pt-1')],
        [
          button(
            'Share',
            GotShareMessage({
              message: Share.openShareSheet({
                recordingID: ready.recordingID,
                rangeStartIndex,
                rangeEndIndex,
              }),
            }),
            'Tinted',
            Option.some('Share'),
            !hasFinalSections,
          ),
          compactButton(
            'Copy link',
            ClickedCopyRecordingLink({ recordingID: ready.recordingID }),
            'Gray',
            'Link',
          ),
          copyMenu(),
          compactButton(
            'Open in Scribe',
            ClickedOpenInApp({ scheme: config.appScheme }),
            'Plain',
            'External',
          ),
        ],
      ),
    ],
  )
}

const skipButton = (
  label: string,
  iconName: IconName,
  deltaSeconds: number,
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.AriaLabel(label),
      h.Title(label),
      h.OnClick(ClickedSkip({ deltaSeconds })),
      h.Class(
        'relative inline-flex size-11 items-center justify-center rounded-full text-label transition hover:bg-fill active:scale-95',
      ),
    ],
    [
      icon(iconName, 'size-7'),
      h.span(
        [
          h.Class(
            'absolute inset-0 flex items-center justify-center pt-[3px] text-[9px] font-bold',
          ),
        ],
        [String(SKIP_SECONDS)],
      ),
    ],
  )
}

const transportBar = (ready: ReadyPlayback): Html => {
  const h = html<Message>()
  const position = displayedPositionOf(ready)
  const duration = durationOf(ready)
  const isPlaying = ready.transport === 'Playing'
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  return h.div(
    [
      h.Role('group'),
      h.AriaLabel('Playback'),
      h.Class(
        'glass flex w-full flex-col gap-1.5 rounded-[28px] px-4 pb-3 pt-3.5',
      ),
    ],
    [
      h.input([
        h.Type('range'),
        h.AriaLabel('Playback position'),
        h.Min('0'),
        h.Max(String(duration)),
        h.Step('0.1'),
        h.Value(String(position)),
        h.OnInput(value => MovedScrub({ seconds: Number(value) })),
        h.OnChange(value => EndedScrub({ seconds: Number(value) })),
        h.Style({
          background: `linear-gradient(to right, var(--label) ${progress}%, var(--fill-strong) ${progress}%)`,
        }),
        h.Class(
          'h-1.5 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgb(0_0_0/0.35)]',
        ),
      ]),
      h.div(
        [h.Class('flex items-center justify-between gap-2')],
        [
          h.span(
            [h.Class('tabular w-14 font-mono text-[12px] text-secondary')],
            [formatClock(position)],
          ),
          h.div(
            [h.Class('flex items-center gap-3')],
            [
              skipButton(`Back ${SKIP_SECONDS} seconds`, 'Back', -SKIP_SECONDS),
              h.button(
                [
                  h.Type('button'),
                  h.AriaLabel(isPlaying ? 'Pause' : 'Play'),
                  h.OnClick(isPlaying ? ClickedPause() : ClickedPlay()),
                  h.Class(
                    'inline-flex size-12 items-center justify-center rounded-full bg-label text-canvas transition active:scale-95',
                  ),
                ],
                [icon(isPlaying ? 'Pause' : 'Play', 'size-6')],
              ),
              skipButton(
                `Forward ${SKIP_SECONDS} seconds`,
                'Forward',
                SKIP_SECONDS,
              ),
            ],
          ),
          h.div(
            [h.Class('flex w-14 items-center justify-end gap-1')],
            [
              h.button(
                [
                  h.Type('button'),
                  h.AriaLabel('Copy link to this moment'),
                  h.Title('Copy link to this moment'),
                  h.OnClick(ClickedCopyMomentLink()),
                  h.Class(
                    'inline-flex size-9 items-center justify-center rounded-full text-secondary transition hover:bg-fill hover:text-tint',
                  ),
                ],
                [icon('Link', 'size-4')],
              ),
              h.span(
                [h.Class('tabular font-mono text-[12px] text-secondary')],
                [formatClock(duration)],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}

const statusBar = (
  iconName: IconName,
  text: string,
  trailing: ReadonlyArray<Html> = [],
): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Role('status'),
      h.Class('glass flex items-center gap-3 rounded-full py-2.5 pl-5 pr-2.5'),
    ],
    [
      icon(iconName, 'size-5 text-secondary'),
      h.span([h.Class('min-w-0 flex-1 text-[14px] text-label')], [text]),
      ...trailing,
    ],
  )
}

const returnPill = (ready: ReadyPlayback): ReadonlyArray<Html> => {
  const h = html<Message>()
  return ready.follow === 'Detached'
    ? [
        h.button(
          [
            h.Type('button'),
            h.OnClick(ClickedReturnToPlayhead()),
            h.Class(
              'glass animate-rise mx-auto inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-tint',
            ),
          ],
          [
            icon(isLiveRecording(ready) ? 'ChevronDown' : 'Play', 'size-4'),
            isLiveRecording(ready) ? 'Jump to latest' : 'Return to playhead',
          ],
        ),
      ]
    : []
}

/** The floating controls for the open recording, when this browser is not recording it. */
export const playbackBar = (ready: ReadyPlayback): ReadonlyArray<Html> => {
  const h = html<Message>()
  const main = isLiveRecording(ready)
    ? [
        statusBar(
          'Microphone',
          `Live on another device · ${formatClock(ready.detail.summary.durationSeconds)}. Following along; audio arrives when it ends.`,
        ),
      ]
    : M.value(ready.detail.audio).pipe(
        M.withReturnType<ReadonlyArray<Html>>(),
        M.tagsExhaustive({
          NoAudio: () => [
            statusBar('Waveform', 'This recording has no audio.'),
          ],
          UploadingAudio: () => [
            statusBar(
              'Clock',
              'The audio is still uploading from the device that recorded it.',
            ),
          ],
          StoredAudio: () =>
            M.value(ready.audioPlayer).pipe(
              M.withReturnType<ReadonlyArray<Html>>(),
              M.tagsExhaustive({
                NoAudioPlayer: () => [statusBar('Clock', 'Loading the audio')],
                AudioPlayerFailed: ({ reason }) => [
                  statusBar('Alert', reason, [
                    button(
                      'Retry',
                      ClickedRetryAudio(),
                      'Tinted',
                      Option.some('Refresh'),
                    ),
                  ]),
                ],
                AudioPlayerReady: () => [transportBar(ready)],
              }),
            ),
        }),
      )
  return [...returnPill(ready), h.div([h.Class('w-full')], main)]
}

/** The recording page: its title and actions, and its transcript. */
export const recordingPage = (
  ready: ReadyPlayback,
  config: ViewConfig,
): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('flex flex-col')],
    [recordingHeader(ready, config), transcript(ready)],
  )
}

/** The page while a recording opens, or when it cannot. */
export const playbackNotice = (title: string, body: string): Html => {
  const h = html<Message>()
  return h.main(
    [h.Class('mx-auto flex w-full max-w-2xl flex-col px-4 pb-40 pt-4 sm:px-6')],
    [
      backToRecordings(),
      h.div(
        [h.Class('card mt-4 flex flex-col gap-2 rounded-[26px] p-6')],
        [
          h.h1(
            [h.Class('text-[20px] font-semibold tracking-tight text-label')],
            [title],
          ),
          h.p([h.Class('text-[15px] leading-6 text-secondary')], [body]),
        ],
      ),
    ],
  )
}
