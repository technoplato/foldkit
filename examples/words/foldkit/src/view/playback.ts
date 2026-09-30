import { Array, Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  ClickedCopyMomentLink,
  ClickedCopyRecordingLink,
  ClickedCopyTranscript,
  ClickedEnterFullScreen,
  ClickedExitFullScreen,
  ClickedOpenInApp,
  ClickedPause,
  ClickedPlay,
  ClickedRetryAudio,
  ClickedReturnToPlayhead,
  ClickedSkip,
  EndedScrub,
  GotShareMessage,
  type Message,
  type Model,
  MovedScrub,
  type ReadyPlayback,
  SKIP_SECONDS,
  Share,
  type TranscriptFormat,
  displayedPositionOf,
  durationOf,
  formatClock,
  isLiveRecording,
  isReturnShownOf,
  playbackPhaseOf,
  shortcutKeyOf,
} from 'words-core-example'

import { RunWallClock } from '../mount.js'
import { type IconName, type SkipDirection, icon, skipIcon } from './icon.js'
import type { ViewConfig } from './shell.js'
import { transcript } from './transcript.js'
import { badge, button, compactButton, quietIconButton } from './ui.js'

const COPY_MENU_ID = 'copy-transcript-menu'
const COPY_MENU_ANCHOR = '--copy-transcript'

const startedLabel = (startedAtMs: number): string =>
  new Date(startedAtMs).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

const keyHint = (label: string, key: string): string => `${label} (${key})`

const copyFormatItem = (format: TranscriptFormat, label: string): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.Popovertarget(COPY_MENU_ID),
      h.Popovertargetaction('hide'),
      h.OnClick(ClickedCopyTranscript({ format })),
      h.Class(
        'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-subhead text-label hover:bg-fill',
      ),
    ],
    [icon('Copy', 'size-[18px] text-secondary'), label],
  )
}

const copyMenu = (): ReadonlyArray<Html> => {
  const h = html<Message>()
  return [
    h.button(
      [
        h.Type('button'),
        h.Popovertarget(COPY_MENU_ID),
        h.AriaLabel('Copy Transcript'),
        h.Title('Copy Transcript'),
        h.Style({ anchorName: COPY_MENU_ANCHOR }),
        h.Class(
          'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-fill px-4 text-subhead font-semibold text-label transition hover:bg-fill-strong max-sm:px-3',
        ),
      ],
      [
        icon('Copy', 'size-[18px]'),
        h.span([h.Class('max-sm:hidden')], ['Copy Transcript']),
        icon('ChevronDown', 'size-4 text-secondary'),
      ],
    ),
    h.div(
      [
        h.Id(COPY_MENU_ID),
        h.Popover('auto'),
        h.AriaLabel('Copy Transcript'),
        h.Style({ positionAnchor: COPY_MENU_ANCHOR }),
        h.Class('menu-popover glass'),
      ],
      [
        copyFormatItem('Markdown', 'Markdown'),
        copyFormatItem('PlainText', 'Plain Text'),
        copyFormatItem('Srt', 'SubRip (SRT)'),
      ],
    ),
  ]
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

const metaLineOf = (ready: ReadyPlayback): string =>
  isLiveRecording(ready)
    ? `Started ${startedLabel(ready.detail.summary.startedAtMs)}`
    : `${startedLabel(ready.detail.summary.startedAtMs)} · ${formatClock(Math.max(ready.detail.summary.durationSeconds, durationOf(ready)))}`

const recordingHeader = (ready: ReadyPlayback, config: ViewConfig): Html => {
  const h = html<Message>()
  const summary = ready.detail.summary
  const [rangeStartIndex, rangeEndIndex] = shareRangeOf(ready)
  const hasFinalSections = Array.some(
    ready.detail.sections,
    section => section.isFinal,
  )
  return h.header(
    [h.Class('mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pt-3 sm:px-6')],
    [
      h.div(
        [h.Class('flex flex-wrap items-center gap-x-2.5 gap-y-1')],
        [
          h.h1(
            [
              h.Id('recording-title'),
              h.Class(
                'folding-title text-title font-bold tracking-tight text-label sm:text-large-title lg:text-display',
              ),
            ],
            [summary.title],
          ),
          ...Option.match(playbackPhaseOf(ready), {
            onNone: () => [],
            onSome: phase => [badge(phase, phase)],
          }),
        ],
      ),
      h.p(
        [h.Class('tabular text-subhead text-secondary')],
        [metaLineOf(ready)],
      ),
      ...(ready.skippedCount > 0
        ? [
            h.p(
              [
                h.Class(
                  'rounded-2xl bg-caution-soft px-4 py-3 text-subhead text-caution',
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
            'Copy Link',
            ClickedCopyRecordingLink({ recordingID: ready.recordingID }),
            'Gray',
            'Link',
          ),
          ...copyMenu(),
          quietIconButton(
            'Open in Scribe',
            'External',
            ClickedOpenInApp({ scheme: config.appScheme }),
          ),
          quietIconButton(
            'Full Screen',
            'Expand',
            ClickedEnterFullScreen(),
            Option.some(shortcutKeyOf('ToggleFullScreen')),
          ),
        ],
      ),
    ],
  )
}

/**
 * Full Screen's own controls: Exit Full Screen, and the wall clock turned on
 * its side along the right edge, like the iPhone's vertical timestamps.
 */
const fullScreenChrome = (): ReadonlyArray<Html> => {
  const h = html<Message>()
  return [
    h.button(
      [
        h.Type('button'),
        h.AriaLabel('Exit Full Screen'),
        h.Title('Exit Full Screen (Esc)'),
        h.AriaKeyshortcuts('Escape'),
        h.OnClick(ClickedExitFullScreen()),
        h.Class(
          'glass fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 inline-flex size-11 items-center justify-center rounded-full text-label transition active:scale-95',
        ),
      ],
      [icon('Contract', 'size-5')],
    ),
    h.div(
      [
        h.OnMount(RunWallClock()),
        h.Class(
          'pointer-events-none fixed bottom-0 right-0 top-16 z-20 flex w-8 items-center justify-center',
        ),
      ],
      [
        h.span(
          [
            h.AriaHidden(true),
            h.DataAttribute('wall-clock-face', ''),
            h.Class(
              'tabular whitespace-nowrap text-caption text-secondary [writing-mode:vertical-rl]',
            ),
          ],
          [],
        ),
        h.span(
          [h.DataAttribute('wall-clock-spoken', ''), h.Class('sr-only')],
          [],
        ),
      ],
    ),
  ]
}

type TranscriptionProblem = Readonly<{ title: string; nextStep: string }>

const isTranscribingOf = (model: Model, ready: ReadyPlayback): boolean =>
  M.value(model.capture.state).pipe(
    M.withReturnType<boolean>(),
    M.tag(
      'Capturing',
      capturing =>
        capturing.draft.recordingID !== ready.recordingID ||
        capturing.transcriber !== 'Unavailable',
    ),
    M.orElse(() => true),
  )

const transcriptionNoticeOf = (
  model: Model,
  ready: ReadyPlayback,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  return M.value(model.capture.state).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tag('Capturing', capturing => {
      const isThisRecording = capturing.draft.recordingID === ready.recordingID
      const maybeProblem = M.value(capturing.transcriber).pipe(
        M.withReturnType<Option.Option<TranscriptionProblem>>(),
        M.when('Unavailable', () =>
          Option.some({
            title: 'Transcription is unavailable',
            nextStep:
              'Scribe keeps recording, and the audio saves to your account when you stop. Words appear here once transcription is back.',
          }),
        ),
        M.when('Reconnecting', () =>
          Option.some({
            title: 'Reconnecting transcription',
            nextStep:
              'Scribe keeps recording. Words spoken meanwhile appear once it reconnects.',
          }),
        ),
        M.orElse(() => Option.none()),
      )
      return isThisRecording
        ? Option.match(maybeProblem, {
            onNone: () => [],
            onSome: ({ title, nextStep }) => [
              h.div(
                [
                  h.Role('status'),
                  h.Class(
                    'mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-caution-soft px-4 py-3 sm:mx-auto sm:w-[calc(100%-3rem)] sm:max-w-[calc(48rem-3rem)]',
                  ),
                ],
                [
                  icon('Alert', 'mt-0.5 size-5 text-caution'),
                  h.div(
                    [h.Class('flex min-w-0 flex-col gap-0.5')],
                    [
                      h.span(
                        [h.Class('text-subhead font-semibold text-label')],
                        [title],
                      ),
                      h.span(
                        [h.Class('text-subhead text-label')],
                        [
                          Option.match(capturing.maybeTranscriberNotice, {
                            onNone: () => nextStep,
                            onSome: reason => `${reason} ${nextStep}`,
                          }),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ],
          })
        : []
    }),
    M.orElse(() => []),
  )
}

const skipButton = (
  label: string,
  direction: SkipDirection,
  deltaSeconds: number,
  key: string,
  keyName: string,
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.AriaLabel(label),
      h.Title(keyHint(label, keyName)),
      h.AriaKeyshortcuts(key),
      h.OnClick(ClickedSkip({ deltaSeconds })),
      h.Class(
        'inline-flex size-11 items-center justify-center rounded-full text-label transition hover:bg-fill active:scale-95',
      ),
    ],
    [skipIcon(direction, SKIP_SECONDS)],
  )
}

const transportBar = (ready: ReadyPlayback): Html => {
  const h = html<Message>()
  const position = displayedPositionOf(ready)
  const duration = durationOf(ready)
  const isPlaying = ready.transport === 'Playing'
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  const playKey = shortcutKeyOf('TogglePlayback')
  return h.div(
    [
      h.Role('group'),
      h.AriaLabel('Playback'),
      h.Class('glass flex w-full flex-col rounded-[28px] px-4 pb-2 pt-0.5'),
    ],
    [
      h.input([
        h.Type('range'),
        h.AriaLabel('Playback position'),
        h.AriaValuetext(`${formatClock(position)} of ${formatClock(duration)}`),
        h.Min('0'),
        h.Max(String(duration)),
        h.Step('0.1'),
        h.Value(String(position)),
        h.OnInput(value => MovedScrub({ seconds: Number(value) })),
        h.OnChange(value => EndedScrub({ seconds: Number(value) })),
        h.Style({ '--progress': `${progress}%` }),
        h.Class('scrubber w-full'),
      ]),
      h.div(
        [h.Class('-mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2')],
        [
          h.span(
            [h.Class('tabular font-mono text-footnote text-secondary')],
            [formatClock(position)],
          ),
          h.div(
            [h.Class('flex items-center gap-2')],
            [
              skipButton(
                `Back ${SKIP_SECONDS} Seconds`,
                'Backward',
                -SKIP_SECONDS,
                shortcutKeyOf('SkipBackward'),
                'Left Arrow',
              ),
              h.button(
                [
                  h.Type('button'),
                  h.AriaLabel(isPlaying ? 'Pause' : 'Play'),
                  h.Title(keyHint(isPlaying ? 'Pause' : 'Play', playKey)),
                  h.AriaKeyshortcuts(playKey),
                  h.OnClick(isPlaying ? ClickedPause() : ClickedPlay()),
                  h.Class(
                    'inline-flex size-12 items-center justify-center rounded-full text-label transition hover:bg-fill active:scale-95',
                  ),
                ],
                [icon(isPlaying ? 'Pause' : 'Play', 'size-8')],
              ),
              skipButton(
                `Forward ${SKIP_SECONDS} Seconds`,
                'Forward',
                SKIP_SECONDS,
                shortcutKeyOf('SkipForward'),
                'Right Arrow',
              ),
            ],
          ),
          h.div(
            [h.Class('flex items-center justify-end')],
            [
              h.span(
                [h.Class('tabular font-mono text-footnote text-secondary')],
                [formatClock(duration)],
              ),
              h.button(
                [
                  h.Type('button'),
                  h.AriaLabel('Copy Link to This Moment'),
                  h.Title('Copy Link to This Moment'),
                  h.OnClick(ClickedCopyMomentLink()),
                  h.Class(
                    '-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-secondary transition hover:bg-fill hover:text-tint',
                  ),
                ],
                [icon('Link', 'size-[18px]')],
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
  title: string,
  detail: string,
  trailing: ReadonlyArray<Html> = [],
): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Role('status'),
      h.Class(
        'glass flex items-center gap-3 rounded-[26px] py-2.5 pl-5 pr-2.5',
      ),
    ],
    [
      icon(iconName, 'size-5 shrink-0 text-secondary'),
      h.span(
        [h.Class('flex min-w-0 flex-1 flex-col')],
        [
          h.span([h.Class('text-subhead font-semibold text-label')], [title]),
          h.span([h.Class('text-footnote text-secondary')], [detail]),
        ],
      ),
      ...trailing,
    ],
  )
}

const newestLineOf = (ready: ReadyPlayback): Option.Option<string> =>
  Option.map(Array.last(ready.detail.sections), section => section.text)

/**
 * Back to Playhead, or Back to Live while recording: shown only after the
 * listener scrolled the followed section off screen. Back to Live previews
 * the newest line.
 */
export const returnPill = (ready: ReadyPlayback): ReadonlyArray<Html> => {
  const h = html<Message>()
  const isLive = isLiveRecording(ready)
  const label = isLive ? 'Back to Live' : 'Back to Playhead'
  const key = shortcutKeyOf('ReturnToFollowed')
  return isReturnShownOf(ready)
    ? [
        h.button(
          [
            h.Type('button'),
            h.OnClick(ClickedReturnToPlayhead()),
            h.Title(keyHint(label, key)),
            h.AriaKeyshortcuts(key),
            h.Class(
              'glass animate-rise mx-auto inline-flex min-h-11 max-w-full items-center gap-2 rounded-full px-4 py-1.5 text-left text-tint',
            ),
          ],
          [
            icon(isLive ? 'ChevronDown' : 'Play', 'size-4 shrink-0'),
            h.span(
              [h.Class('flex min-w-0 flex-col')],
              [
                h.span([h.Class('text-subhead font-semibold')], [label]),
                ...(isLive
                  ? Option.match(newestLineOf(ready), {
                      onNone: () => [],
                      onSome: line => [
                        h.span(
                          [
                            h.Class(
                              'max-w-72 truncate text-footnote text-secondary',
                            ),
                          ],
                          [line],
                        ),
                      ],
                    })
                  : []),
              ],
            ),
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
          `Recording on another device · ${formatClock(ready.detail.summary.durationSeconds)}`,
          'Following along live. The audio arrives when the recording stops.',
        ),
      ]
    : M.value(ready.detail.audio).pipe(
        M.withReturnType<ReadonlyArray<Html>>(),
        M.tagsExhaustive({
          NoAudio: () => [
            statusBar(
              'Waveform',
              'No audio',
              'This recording has a transcript only.',
            ),
          ],
          UploadingAudio: () => [
            statusBar(
              'Clock',
              'The audio is still uploading',
              'It plays here once the device that recorded it finishes uploading.',
            ),
          ],
          StoredAudio: () =>
            M.value(ready.audioPlayer).pipe(
              M.withReturnType<ReadonlyArray<Html>>(),
              M.tagsExhaustive({
                NoAudioPlayer: () => [
                  statusBar('Clock', 'Loading the audio', 'One moment.'),
                ],
                AudioPlayerFailed: ({ reason }) => [
                  statusBar('Alert', 'The audio did not play', reason, [
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

/**
 * The recording page: its title, phase, and actions, any transcription
 * problem, the transcript, and a polite live region that reads new finished
 * sections of a recording in progress at most every few seconds.
 */
export const recordingPage = (
  model: Model,
  ready: ReadyPlayback,
  config: ViewConfig,
): Html => {
  const h = html<Message>()
  const isFullScreen = ready.screenMode === 'FullScreen'
  return h.main(
    [h.AriaLabelledBy('recording-title'), h.Class('flex flex-col')],
    [
      isFullScreen
        ? h.h1(
            [h.Id('recording-title'), h.Class('sr-only')],
            [ready.detail.summary.title],
          )
        : recordingHeader(ready, config),
      ...transcriptionNoticeOf(model, ready),
      transcript(ready, isTranscribingOf(model, ready), isFullScreen),
      h.div(
        [h.AriaLive('polite'), h.AriaAtomic(true), h.Class('sr-only')],
        Option.toArray(ready.maybeAnnouncedText),
      ),
      ...(isFullScreen ? fullScreenChrome() : []),
    ],
  )
}

/** The page while a recording opens, or when it cannot. */
export const playbackNotice = (title: string, body: string): Html => {
  const h = html<Message>()
  return h.main(
    [h.Class('mx-auto flex w-full max-w-2xl flex-col px-4 pb-40 pt-4 sm:px-6')],
    [
      h.div(
        [h.Class('card mt-2 flex flex-col gap-2 rounded-[26px] p-6')],
        [
          h.h1(
            [h.Class('text-title font-semibold tracking-tight text-label')],
            [title],
          ),
          h.p([h.Class('text-subhead text-secondary')], [body]),
        ],
      ),
    ],
  )
}
