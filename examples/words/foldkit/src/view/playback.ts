import { Array, Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  ClickedCloseMiniPlayer,
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
  ClickedTryOpeningAgain,
  type Connectivity,
  EndedScrub,
  GotShareMessage,
  type Message,
  type Model,
  MovedScrub,
  type OpeningPatience,
  PressedScrubberArrow,
  RECORDING_TITLE_ELEMENT_ID,
  type ReadyPlayback,
  RecordingRoute,
  SKIP_SECONDS,
  Share,
  type TranscriptFormat,
  displayedLengthOf,
  displayedPositionOf,
  durationOf,
  formatClock,
  isLiveRecording,
  isReturnShownOf,
  playbackPhaseOf,
  scribeRouteToPath,
  shortcutKeyOf,
} from 'words-core-example'

import { RunWallClock } from '../mount.js'
import { type IconName, type SkipDirection, icon, skipIcon } from './icon.js'
import type { ViewConfig } from './shell.js'
import { transcript } from './transcript.js'
import { badge, button, compactButton, quietIconButton, spinner } from './ui.js'

const COPY_MENU_ID = 'copy-transcript-menu'
const COPY_MENU_ANCHOR = '--copy-transcript'

const keyHint = (label: string, key: string): string => `${label} (${key})`

const MORE_MENU_ID = 'recording-more-menu'
const MORE_MENU_ANCHOR = '--recording-more'

const menuButton = (
  menuID: string,
  iconName: IconName,
  label: string,
  message: Message,
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.Popovertarget(menuID),
      h.Popovertargetaction('hide'),
      h.OnClick(message),
      h.Class(
        'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-subhead text-label hover:bg-fill',
      ),
    ],
    [icon(iconName, 'size-[18px] text-secondary'), label],
  )
}

const menuGroupLabel = (text: string): Html => {
  const h = html<Message>()
  return h.p(
    [
      h.AriaHidden(true),
      h.Class('px-3 pb-1 pt-2 text-footnote font-semibold text-secondary'),
    ],
    [text],
  )
}

/**
 * The recording's actions on a phone, beside Share: Copy Link, the transcript
 * formats, Open in Scribe, and Full Screen, in one More menu, so the header
 * needs no row of its own.
 */
const moreMenu = (
  ready: ReadyPlayback,
  config: ViewConfig,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  return [
    h.button(
      [
        h.Type('button'),
        h.Popovertarget(MORE_MENU_ID),
        h.AriaLabel('More Actions'),
        h.Title('More Actions'),
        h.Style({ anchorName: MORE_MENU_ANCHOR }),
        h.Class(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-fill text-label transition hover:bg-fill-strong',
        ),
      ],
      [icon('More', 'size-5')],
    ),
    h.div(
      [
        h.Id(MORE_MENU_ID),
        h.Popover('auto'),
        h.AriaLabel('More Actions'),
        h.Style({ positionAnchor: MORE_MENU_ANCHOR }),
        h.Class('menu-popover glass'),
      ],
      [
        menuButton(
          MORE_MENU_ID,
          'Link',
          'Copy Link',
          ClickedCopyRecordingLink({ recordingID: ready.recordingID }),
        ),
        menuGroupLabel('Copy Transcript'),
        menuButton(
          MORE_MENU_ID,
          'Copy',
          'Markdown',
          ClickedCopyTranscript({ format: 'Markdown' }),
        ),
        menuButton(
          MORE_MENU_ID,
          'Copy',
          'Plain Text',
          ClickedCopyTranscript({ format: 'PlainText' }),
        ),
        menuButton(
          MORE_MENU_ID,
          'Copy',
          'SubRip (SRT)',
          ClickedCopyTranscript({ format: 'Srt' }),
        ),
        h.div([h.Class('my-1 border-t border-separator')], []),
        menuButton(
          MORE_MENU_ID,
          'External',
          'Open in Scribe',
          ClickedOpenInApp({ scheme: config.appScheme }),
        ),
        menuButton(
          MORE_MENU_ID,
          'Expand',
          'Full Screen',
          ClickedEnterFullScreen(),
        ),
      ],
    ),
  ]
}

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

const startedDateLabel = (startedAtMs: number): string =>
  new Date(startedAtMs).toLocaleDateString(undefined, { dateStyle: 'medium' })

const startedTimeLabel = (startedAtMs: number): string =>
  new Date(startedAtMs).toLocaleTimeString(undefined, { timeStyle: 'short' })

/**
 * The start date, time, and length under a recording's title. The time and
 * the length stay together, so a narrow screen wraps after the date.
 */
const metaLineOf = (ready: ReadyPlayback): ReadonlyArray<Html | string> => {
  const h = html<Message>()
  const startedAtMs = ready.detail.summary.startedAtMs
  const time = startedTimeLabel(startedAtMs)
  const date = `${isLiveRecording(ready) ? 'Started ' : ''}${startedDateLabel(startedAtMs)}, `
  return [
    date,
    h.span(
      [h.Class('whitespace-nowrap')],
      [
        isLiveRecording(ready)
          ? time
          : `${time} · ${formatClock(Math.max(ready.detail.summary.durationSeconds, durationOf(ready)))}`,
      ],
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
  const openShare = GotShareMessage({
    message: Share.openShareSheet({
      recordingID: ready.recordingID,
      rangeStartIndex,
      rangeEndIndex,
    }),
  })
  const phaseBadges = (visibilityClass: string): ReadonlyArray<Html> =>
    Option.match(playbackPhaseOf(ready), {
      onNone: () => [],
      onSome: phase => [
        h.span([h.Class(visibilityClass)], [badge(phase, phase)]),
      ],
    })
  return h.header(
    [
      h.Class(
        'mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pt-3 max-sm:gap-0 sm:px-6 min-[100rem]:max-w-[61rem]',
      ),
    ],
    [
      h.div(
        [h.Class('flex flex-wrap items-center gap-x-2.5 gap-y-1')],
        [
          h.h1(
            [
              h.Id(RECORDING_TITLE_ELEMENT_ID),
              h.Class(
                'folding-title page-title-when-large text-title font-bold tracking-tight text-label max-sm:sr-only sm:text-large-title',
              ),
            ],
            [summary.title],
          ),
          ...phaseBadges('inline-flex max-sm:hidden'),
        ],
      ),
      h.div(
        [h.Class('flex items-center gap-2')],
        [
          h.p(
            [h.Class('tabular min-w-0 flex-1 text-subhead text-secondary')],
            [
              ...phaseBadges('mr-2 inline-flex align-middle sm:hidden'),
              ...metaLineOf(ready),
            ],
          ),
          h.div(
            [h.Class('flex shrink-0 items-center gap-2 sm:hidden')],
            [
              h.button(
                [
                  h.Type('button'),
                  h.AriaLabel('Share'),
                  h.Title('Share'),
                  h.Disabled(!hasFinalSections),
                  h.OnClick(openShare),
                  h.Class(
                    'inline-flex size-11 items-center justify-center rounded-full bg-tint-soft text-tint transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40',
                  ),
                ],
                [icon('Share', 'size-5')],
              ),
              ...moreMenu(ready, config),
            ],
          ),
        ],
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
        [h.Class('hidden flex-wrap items-center gap-2 pt-1 sm:flex')],
        [
          button(
            'Share',
            openShare,
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
          'pointer-events-none fixed bottom-0 right-[max(0px,calc((100vw_-_48rem)/2_-_2.5rem))] top-16 z-20 flex w-8 items-center justify-center min-[100rem]:right-[max(0px,calc((100vw_-_61rem)/2_-_2.5rem))]',
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
                    `mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-caution-soft px-4 py-3 sm:mx-auto sm:w-[calc(100%-3rem)] sm:max-w-[calc(48rem-3rem)] min-[100rem]:max-w-[calc(61rem-3rem)] ${ready.screenMode === 'FullScreen' ? 'mr-16 sm:mr-auto sm:mt-16' : ''}`,
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

/**
 * The scrubber. It steps one second, so each assistive adjustment and Up or
 * Down Arrow changes the spoken time; Left and Right Arrow move 5 seconds.
 * The browser snaps its own thumb to the step, so the thumb it draws is
 * hidden and one at the exact playhead is drawn over it.
 */
const scrubberInput = (ready: ReadyPlayback, className: string): Html => {
  const h = html<Message>()
  const position = displayedPositionOf(ready)
  const duration = durationOf(ready)
  const fraction = duration > 0 ? Math.min(1, position / duration) : 0
  return h.div(
    [
      h.Style({
        '--progress': `${fraction * 100}%`,
        '--progress-fraction': String(fraction),
      }),
      h.Class(`relative flex items-center ${className}`),
    ],
    [
      h.input([
        h.Type('range'),
        h.AriaLabel('Playback position'),
        h.AriaValuetext(`${formatClock(position)} of ${formatClock(duration)}`),
        h.Min('0'),
        h.Max(String(duration)),
        h.Step('1'),
        h.Value(String(position)),
        h.OnInput(value => MovedScrub({ seconds: Number(value) })),
        h.OnChange(value => EndedScrub({ seconds: Number(value) })),
        h.OnKeyDownPreventDefault((key, modifiers) =>
          modifiers.altKey ||
          modifiers.ctrlKey ||
          modifiers.metaKey ||
          modifiers.shiftKey
            ? Option.none()
            : M.value(key).pipe(
                M.withReturnType<Option.Option<Message>>(),
                M.when('ArrowLeft', () =>
                  Option.some(PressedScrubberArrow({ arrow: 'Left' })),
                ),
                M.when('ArrowRight', () =>
                  Option.some(PressedScrubberArrow({ arrow: 'Right' })),
                ),
                M.orElse(() => Option.none()),
              ),
        ),
        h.Class('scrubber w-full'),
      ]),
      h.span([h.AriaHidden(true), h.Class('scrubber-thumb')], []),
    ],
  )
}

const playPauseButton = (ready: ReadyPlayback, className: string): Html => {
  const h = html<Message>()
  const isPlaying = ready.transport === 'Playing'
  const playKey = shortcutKeyOf('TogglePlayback')
  return h.button(
    [
      h.Type('button'),
      h.AriaLabel(isPlaying ? 'Pause' : 'Play'),
      h.Title(keyHint(isPlaying ? 'Pause' : 'Play', playKey)),
      h.AriaKeyshortcuts(playKey),
      h.OnClick(isPlaying ? ClickedPause() : ClickedPlay()),
      h.Class(
        `inline-flex shrink-0 items-center justify-center rounded-full text-label transition hover:bg-fill active:scale-95 ${className}`,
      ),
    ],
    [icon(isPlaying ? 'Pause' : 'Play', 'size-8')],
  )
}

const clockLabel = (seconds: number): Html => {
  const h = html<Message>()
  return h.span(
    [h.Class('tabular shrink-0 font-mono text-footnote text-secondary')],
    [formatClock(seconds)],
  )
}

const transportBar = (ready: ReadyPlayback): Html => {
  const h = html<Message>()
  const position = displayedPositionOf(ready)
  const duration = durationOf(ready)
  return h.div(
    [
      h.Role('group'),
      h.AriaLabel('Playback'),
      h.Class(
        'glass flex w-full flex-col rounded-[28px] px-4 pb-1.5 pt-0.5 sm:pb-2',
      ),
    ],
    [
      scrubberInput(ready, 'w-full'),
      h.div(
        [
          h.Class(
            '-mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:-mt-1',
          ),
        ],
        [
          clockLabel(position),
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
              playPauseButton(ready, 'size-11 sm:size-12'),
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
              clockLabel(duration),
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

/**
 * The player in Full Screen on a phone: one row with Play or Pause, the
 * position, the scrubber, and the length, so the transcript keeps more of the
 * screen. The arrow keys and the system controls still skip.
 */
const compactTransportBar = (ready: ReadyPlayback): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Role('group'),
      h.AriaLabel('Playback'),
      h.Class(
        'glass flex w-full items-center gap-2 rounded-full py-1 pl-1 pr-4 sm:hidden',
      ),
    ],
    [
      playPauseButton(ready, 'size-11'),
      clockLabel(displayedPositionOf(ready)),
      scrubberInput(ready, 'min-w-0 flex-1'),
      clockLabel(durationOf(ready)),
    ],
  )
}

/**
 * The player beside this browser's own live recording on a phone: one row
 * with Back 15, Play or Pause, Forward 15, the position, the scrubber, and
 * the length, so the recorder's row and this one leave the transcript most
 * of the screen. `.beside-compact` shows it only there (styles.css).
 */
const besideTransportBar = (ready: ReadyPlayback): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Role('group'),
      h.AriaLabel('Playback'),
      h.Class(
        'beside-compact glass w-full items-center gap-1 rounded-full pr-4',
      ),
    ],
    [
      skipButton(
        `Back ${SKIP_SECONDS} Seconds`,
        'Backward',
        -SKIP_SECONDS,
        shortcutKeyOf('SkipBackward'),
        'Left Arrow',
      ),
      playPauseButton(ready, 'size-11'),
      skipButton(
        `Forward ${SKIP_SECONDS} Seconds`,
        'Forward',
        SKIP_SECONDS,
        shortcutKeyOf('SkipForward'),
        'Right Arrow',
      ),
      h.span(
        [h.Class('flex min-w-0 flex-1 items-center gap-2 pl-1')],
        [
          clockLabel(displayedPositionOf(ready)),
          scrubberInput(ready, 'min-w-0 flex-1'),
          clockLabel(durationOf(ready)),
        ],
      ),
    ],
  )
}

/**
 * A bar that says where the audio stands. Its title and detail are a status
 * region, so a change is announced; the trailing controls and clocks sit
 * outside it, so a ticking clock is not read out every second.
 */
const statusBar = (
  iconName: IconName,
  title: string,
  detail: string,
  trailing: ReadonlyArray<Html> = [],
): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Class(
        'glass flex items-center gap-3 rounded-[26px] py-2.5 pl-5 pr-2.5',
      ),
    ],
    [
      icon(iconName, 'size-5 shrink-0 text-secondary'),
      h.span(
        [h.Role('status'), h.Class('flex min-w-0 flex-1 flex-col')],
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
            icon(isLive ? 'ChevronDown' : 'Playhead', 'size-4 shrink-0'),
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

/**
 * The player for a recording that keeps playing while the listener browses,
 * like the playback piece in the iPhone's bar: Play or Pause, the recording's
 * title and time (the title opens it again, where it is), and Close.
 */
export const miniPlayer = (ready: ReadyPlayback): ReadonlyArray<Html> => {
  const h = html<Message>()
  const title = ready.detail.summary.title
  const time = `${formatClock(displayedPositionOf(ready))} of ${formatClock(durationOf(ready))}`
  return [
    h.div(
      [
        h.Role('group'),
        h.AriaLabel('Recording playing in the background'),
        h.Class(
          'glass flex w-full items-center gap-2 rounded-full py-1.5 pl-1.5 pr-2',
        ),
      ],
      [
        playPauseButton(ready, 'size-11'),
        h.a(
          [
            h.Href(
              scribeRouteToPath(
                RecordingRoute({ recordingID: ready.recordingID }),
              ),
            ),
            h.AriaLabel(`Open ${title}, ${time}`),
            h.Class(
              'flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-2xl px-1 py-0.5',
            ),
          ],
          [
            h.span(
              [h.Class('truncate text-subhead font-semibold text-label')],
              [title],
            ),
            h.span(
              [h.Class('tabular truncate text-footnote text-secondary')],
              [
                Option.match(playbackPhaseOf(ready), {
                  onNone: () => time,
                  onSome: phase => `${phase} · ${time}`,
                }),
              ],
            ),
          ],
        ),
        h.button(
          [
            h.Type('button'),
            h.AriaLabel('Close Player'),
            h.Title('Close Player'),
            h.OnClick(ClickedCloseMiniPlayer()),
            h.Class(
              'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-secondary transition hover:bg-fill hover:text-label',
            ),
          ],
          [icon('Close', 'size-4')],
        ),
      ],
    ),
  ]
}

const liveLengthClock = (seconds: number): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.Role('timer'),
      h.AriaLabel(`${formatClock(seconds)} recorded`),
      h.Class('tabular shrink-0 pr-2.5 text-body font-semibold text-label'),
    ],
    [formatClock(seconds)],
  )
}

/**
 * The floating controls for the open recording, when this browser is not
 * recording it. A recording in progress on another device shows its length
 * counting up (`displayedLengthOf`). Beside this browser's own live
 * recording (`isBesideRecorder`), a phone gets the one-row player.
 */
export const playbackBar = (
  model: Model,
  ready: ReadyPlayback,
  isBesideRecorder: boolean,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  const main = isLiveRecording(ready)
    ? [
        statusBar(
          'Microphone',
          'Recording on another device',
          'Following along live. The audio arrives when the recording stops.',
          [liveLengthClock(displayedLengthOf(model, ready.detail.summary))],
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
                AudioPlayerReady: () => {
                  if (ready.screenMode === 'FullScreen') {
                    return [
                      compactTransportBar(ready),
                      h.div(
                        [h.Class('hidden w-full sm:block')],
                        [transportBar(ready)],
                      ),
                    ]
                  } else if (isBesideRecorder) {
                    return [
                      besideTransportBar(ready),
                      h.div(
                        [h.Class('beside-full w-full')],
                        [transportBar(ready)],
                      ),
                    ]
                  } else {
                    return [transportBar(ready)]
                  }
                },
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
    [h.AriaLabelledBy(RECORDING_TITLE_ELEMENT_ID), h.Class('flex flex-col')],
    [
      isFullScreen
        ? h.h1(
            [h.Id(RECORDING_TITLE_ELEMENT_ID), h.Class('sr-only')],
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

/**
 * The page while a recording opens, or when it cannot: a title, what is
 * happening, and what the listener can do. It is a status region, so a
 * change (such as "still loading") is announced.
 */
export const playbackNotice = (
  title: string,
  body: string,
  leading: ReadonlyArray<Html> = [],
  actions: ReadonlyArray<Html> = [],
): Html => {
  const h = html<Message>()
  return h.main(
    [h.Class('mx-auto flex w-full max-w-2xl flex-col px-4 pb-40 pt-4 sm:px-6')],
    [
      h.div(
        [
          h.Role('status'),
          h.Class('card mt-2 flex flex-col gap-4 rounded-[26px] p-6'),
        ],
        [
          h.div(
            [h.Class('flex items-start gap-3')],
            [
              ...Array.map(leading, child =>
                h.span([h.Class('mt-1 flex shrink-0')], [child]),
              ),
              h.div(
                [h.Class('flex min-w-0 flex-col gap-2')],
                [
                  h.h1(
                    [
                      h.Class(
                        'text-title font-semibold tracking-tight text-label',
                      ),
                    ],
                    [title],
                  ),
                  h.p([h.Class('text-subhead text-secondary')], [body]),
                ],
              ),
            ],
          ),
          ...Array.match(actions, {
            onEmpty: () => [],
            onNonEmpty: nonEmpty => [
              h.div([h.Class('flex flex-wrap gap-2')], nonEmpty),
            ],
          }),
        ],
      ),
    ],
  )
}

const tryOpeningAgainButton = (): Html =>
  button(
    'Try Again',
    ClickedTryOpeningAgain(),
    'Tinted',
    Option.some('Refresh'),
  )

/**
 * The page while a recording opens: a spinner and what it loads; offline,
 * that it waits for the network (the offline notice above already says "You
 * are offline"); and when Scribe has not answered for a few seconds, that the
 * transcript is still loading, with Try Again.
 */
export const openingNotice = (
  connectivity: Connectivity,
  patience: OpeningPatience,
): Html => {
  if (connectivity === 'Offline') {
    return playbackNotice(
      'Waiting for the network',
      'This browser is offline. The recording opens as soon as the network is back.',
      [spinner('size-5 text-caution')],
    )
  } else {
    return M.value(patience).pipe(
      M.withReturnType<Html>(),
      M.when('Loading', () =>
        playbackNotice(
          'Opening the recording',
          'Loading the transcript from Scribe.',
          [spinner('size-5 text-secondary')],
        ),
      ),
      M.when('Slow', () =>
        playbackNotice(
          'Still loading the transcript',
          'Scribe has not answered yet. It keeps trying; Try Again asks once more.',
          [spinner('size-5 text-secondary')],
          [tryOpeningAgainButton()],
        ),
      ),
      M.exhaustive,
    )
  }
}

/** The page when a recording did not load: why, and Try Again. */
export const failedOpeningNotice = (reason: string): Html =>
  playbackNotice(
    'The recording could not load',
    reason,
    [icon('Alert', 'size-5 text-accent-strong')],
    [tryOpeningAgainButton()],
  )
