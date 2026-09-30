import { Array, Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  Capture,
  GotCaptureMessage,
  type Message,
  type Model,
  RecordingRoute,
  formatClock,
  scribeRouteToPath,
  shortcutKeyOf,
} from 'words-core-example'

import { type IconName, icon } from './icon.js'
import { largeTitle } from './shell.js'
import { button, spinner } from './ui.js'

const LEVEL_MINIMUM_HEIGHT_PX = 3
const LEVEL_RANGE_PX = 22
const LEVEL_BAR_SPACING = 5
const LEVEL_METER_HEIGHT = 28

const captureMessage = (message: Capture.Message.Message): Message =>
  GotCaptureMessage({ message })

const levelMeterPath = (levels: ReadonlyArray<number>): string =>
  Array.join(
    Array.map(levels, (level, position) => {
      const barHeight = LEVEL_MINIMUM_HEIGHT_PX + level * LEVEL_RANGE_PX
      const x = position * LEVEL_BAR_SPACING + LEVEL_BAR_SPACING / 2
      const top = (LEVEL_METER_HEIGHT - barHeight) / 2
      return `M${x.toFixed(1)} ${top.toFixed(1)}V${(top + barHeight).toFixed(1)}`
    }),
    '',
  )

const levelMeter = (levels: ReadonlyArray<number>, isPaused: boolean): Html => {
  const h = html<Message>()
  const color = isPaused ? 'text-tertiary' : 'text-accent'
  return h.span(
    [h.AriaHidden(true), h.Class('hidden items-center sm:flex')],
    [
      h.svg(
        [
          h.ViewBox(
            `0 0 ${levels.length * LEVEL_BAR_SPACING} ${LEVEL_METER_HEIGHT}`,
          ),
          h.Class(`h-7 w-[140px] motion-reduce:hidden ${color}`),
        ],
        [
          h.path(
            [
              h.D(levelMeterPath(levels)),
              h.Stroke('currentColor'),
              h.StrokeWidth('3'),
              h.StrokeLinecap('round'),
              h.Fill('none'),
            ],
            [],
          ),
        ],
      ),
      icon('Waveform', `hidden size-6 motion-reduce:block ${color}`),
    ],
  )
}

type PhaseLine = Readonly<{ phase: string; detail: string }>

const phaseLineOf = (
  capturing: typeof Capture.Model.Capturing.Type,
): PhaseLine =>
  capturing.transport === 'Paused'
    ? { phase: 'Paused', detail: '' }
    : M.value(capturing.transcriber).pipe(
        M.withReturnType<PhaseLine>(),
        M.when('Live', () => ({
          phase: 'Recording',
          detail: ' · Transcribing live',
        })),
        M.when('Connecting', () => ({
          phase: 'Recording',
          detail: ' · Connecting transcription',
        })),
        M.when('Reconnecting', () => ({
          phase: 'Recording',
          detail: ' · Reconnecting transcription',
        })),
        M.when('Unavailable', () => ({
          phase: 'Recording',
          detail: ' · No transcription',
        })),
        M.exhaustive,
      )

const capsuleButton = (
  label: string,
  visibleLabel: string,
  iconName: IconName,
  message: Message,
  className: string,
  maybeKey: Option.Option<string> = Option.none(),
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.AriaLabel(label),
      h.Title(
        Option.match(maybeKey, {
          onNone: () => label,
          onSome: key => `${label} (${key})`,
        }),
      ),
      ...Option.toArray(Option.map(maybeKey, key => h.AriaKeyshortcuts(key))),
      h.OnClick(message),
      h.Class(
        `inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 text-subhead font-semibold transition duration-150 active:scale-95 @max-[18rem]:w-11 @max-[18rem]:px-0 ${className}`,
      ),
    ],
    [
      icon(iconName, 'size-[18px]'),
      h.span([h.Class('@max-[18rem]:hidden')], [visibleLabel]),
    ],
  )
}

const capturingBar = (
  capturing: typeof Capture.Model.Capturing.Type,
  isOnRecordingPage: boolean,
): Html => {
  const h = html<Message>()
  const isPaused = capturing.transport === 'Paused'
  const pauseKey = shortcutKeyOf('TogglePauseRecording')
  const timer = h.span(
    [h.Class('flex items-center gap-2')],
    [
      isPaused
        ? icon('Pause', 'size-3 text-caution')
        : h.span(
            [h.Class('size-2.5 rounded-full bg-accent animate-breathe')],
            [],
          ),
      h.span(
        [h.Class('tabular text-body font-semibold text-label')],
        [formatClock(capturing.recordedSeconds)],
      ),
    ],
  )
  const { phase, detail } = phaseLineOf(capturing)
  const secondary = Option.match(capturing.maybeWriteProblem, {
    onNone: () =>
      h.span(
        [
          h.Class(
            `text-footnote ${isPaused ? 'font-medium text-caution' : 'text-secondary'}`,
          ),
        ],
        [phase, h.span([h.Class('max-sm:hidden')], [detail])],
      ),
    onSome: problem =>
      h.span(
        [h.Class('line-clamp-2 text-footnote text-accent-strong')],
        [problem],
      ),
  })
  const status = h.span(
    [h.Class('flex min-w-0 items-center gap-3')],
    [
      h.span([h.Class('flex min-w-0 flex-col')], [timer, secondary]),
      levelMeter(capturing.levels, isPaused),
    ],
  )
  return h.div(
    [
      h.Role('group'),
      h.AriaLabel('Recording controls'),
      h.Class(
        '@container glass flex w-full items-center gap-2 rounded-full py-2 pl-5 pr-2',
      ),
    ],
    [
      isOnRecordingPage
        ? h.span([h.Class('min-w-0 flex-1')], [status])
        : h.a(
            [
              h.Href(
                scribeRouteToPath(
                  RecordingRoute({ recordingID: capturing.draft.recordingID }),
                ),
              ),
              h.AriaLabel('Open the recording'),
              h.Class('min-w-0 flex-1 rounded-full'),
            ],
            [status],
          ),
      isPaused
        ? capsuleButton(
            'Resume Recording',
            'Resume',
            'Record',
            captureMessage(Capture.resumeRecording()),
            'bg-accent-soft text-accent-strong hover:brightness-95',
            Option.some(pauseKey),
          )
        : capsuleButton(
            'Pause Recording',
            'Pause',
            'Pause',
            captureMessage(Capture.pauseRecording()),
            'bg-fill text-label hover:bg-fill-strong',
            Option.some(pauseKey),
          ),
      capsuleButton(
        'Stop Recording',
        'Stop',
        'Stop',
        captureMessage(Capture.stopRecording()),
        'bg-accent-soft text-accent-strong hover:brightness-95',
      ),
    ],
  )
}

const statusText = (primary: string, secondary: string): Html => {
  const h = html<Message>()
  return h.span(
    [h.Class('flex min-w-0 flex-col')],
    [
      h.span([h.Class('text-subhead font-semibold text-label')], [primary]),
      h.span([h.Class('text-footnote text-secondary')], [secondary]),
    ],
  )
}

const workingBar = (label: string, detail: string): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Role('status'),
      h.Class('glass flex w-full items-center gap-3 rounded-full px-5 py-3'),
    ],
    [spinner('size-5 text-accent'), statusText(label, detail)],
  )
}

const problemCard = (
  iconName: IconName,
  title: string,
  detail: string,
  actions: ReadonlyArray<Html>,
): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Role('alert'),
      h.Class(
        'glass flex flex-col gap-3 rounded-[28px] p-4 sm:flex-row sm:items-center',
      ),
    ],
    [
      h.span(
        [h.Class('flex min-w-0 flex-1 items-start gap-3')],
        [
          icon(iconName, 'mt-0.5 size-5 text-accent-strong'),
          statusText(title, detail),
        ],
      ),
      h.span([h.Class('flex flex-wrap gap-2')], actions),
    ],
  )
}

const failedSaveBar = (reason: string): Html =>
  problemCard(
    'Alert',
    'The audio did not save',
    `${reason} The transcript is already saved, and the audio stays in this browser until Try Again uploads it.`,
    [
      button(
        'Keep Transcript Only',
        captureMessage(Capture.keepTranscriptOnly()),
        'Gray',
      ),
      button(
        'Try Again',
        captureMessage(Capture.retrySaveRecording()),
        'Prominent',
        Option.some('Refresh'),
      ),
    ],
  )

const failedStartCard = (reason: string): Html =>
  problemCard('Microphone', 'Recording did not start', reason, [
    button('Dismiss', captureMessage(Capture.dismissCaptureFailure()), 'Gray'),
    button(
      'Try Again',
      captureMessage(Capture.startRecording()),
      'Prominent',
      Option.some('Record'),
    ),
  ])

const recordDot = (sizeClass: string, dotClass: string): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.AriaHidden(true),
      h.Class(
        `inline-flex shrink-0 items-center justify-center rounded-full border-[3px] border-label/15 bg-surface ${sizeClass}`,
      ),
    ],
    [
      h.svg(
        [h.ViewBox('0 0 40 40'), h.Class(`${dotClass} text-accent`)],
        [
          h.circle(
            [h.Cx('20'), h.Cy('20'), h.R('20'), h.Fill('currentColor')],
            [],
          ),
        ],
      ),
    ],
  )
}

const newRecordingKey = shortcutKeyOf('NewRecording')

const recordBar = (isFullWidth: boolean): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.AriaLabel('New Recording'),
      h.Title(`New Recording (${newRecordingKey})`),
      h.AriaKeyshortcuts(newRecordingKey),
      h.OnClick(captureMessage(Capture.startRecording())),
      h.Class(
        `glass flex items-center gap-3.5 rounded-full py-2 pl-2 pr-6 text-left transition active:scale-[0.98] ${isFullWidth ? 'w-full' : ''}`,
      ),
    ],
    [
      recordDot('size-14', 'size-10'),
      h.span(
        [h.Class('flex flex-col')],
        [
          h.span(
            [h.Class('text-body font-semibold text-label')],
            ['New Recording'],
          ),
          h.span(
            [h.Class('hidden text-footnote text-secondary sm:block')],
            ['Transcribes live and saves to your account'],
          ),
        ],
      ),
    ],
  )
}

/**
 * The recorder in the floating bar, or nothing: New Recording when a
 * recording can start here, the live controls while recording, and progress
 * or failures while stopping and saving.
 */
export const captureBar = (
  model: Model,
  isRecordAvailable: boolean,
): ReadonlyArray<Html> => {
  const isOnRecordingPage = Option.exists(
    Capture.Model.draftOf(model.capture),
    draft =>
      model.route._tag === 'Recording' &&
      model.route.recordingID === draft.recordingID,
  )
  return M.value(model.capture.state).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tagsExhaustive({
      NotCapturing: () =>
        isRecordAvailable
          ? [recordBar(Option.isSome(model.maybeBackgroundPlayback))]
          : [],
      PreparingCapture: () => [
        workingBar('Starting', 'Preparing the recording'),
      ],
      StartingCapture: () => [
        workingBar(
          'Opening the microphone',
          'Allow the microphone if the browser asks',
        ),
      ],
      Capturing: capturing => [capturingBar(capturing, isOnRecordingPage)],
      StoppingCapture: () => [
        workingBar('Finishing', 'Waiting for the last words'),
      ],
      SavingCapture: () => [
        workingBar('Saving', 'Uploading the audio to your account'),
      ],
      FailedSave: ({ reason }) => [failedSaveBar(reason)],
      FailedStart: ({ reason }) => [failedStartCard(reason)],
    }),
  )
}

/** The new recording page: record from this browser, transcribed live. */
export const newRecordingPage = (model: Model): Html => {
  const h = html<Message>()
  const isConnected = model.account.connection._tag === 'ConnectedAccount'
  return h.main(
    [h.Class('mx-auto flex w-full max-w-2xl flex-col px-4 pb-44 pt-6 sm:px-6')],
    [
      largeTitle('New Recording'),
      h.div(
        [
          h.Class(
            'card mt-6 flex flex-col items-center gap-5 rounded-[28px] px-6 py-12 text-center',
          ),
        ],
        [
          isConnected
            ? h.button(
                [
                  h.Type('button'),
                  h.AriaLabel('New Recording'),
                  h.Title(`New Recording (${newRecordingKey})`),
                  h.OnClick(captureMessage(Capture.startRecording())),
                  h.Class('rounded-full transition active:scale-95'),
                ],
                [recordDot('size-24', 'size-[4.5rem]')],
              )
            : icon('Microphone', 'size-12 text-secondary'),
          h.div(
            [h.Class('flex max-w-md flex-col gap-2')],
            [
              h.h2(
                [h.Class('text-title font-semibold tracking-tight text-label')],
                [
                  isConnected
                    ? 'Record from this browser'
                    : 'Sign in to record',
                ],
              ),
              h.p(
                [h.Class('text-subhead text-secondary')],
                [
                  isConnected
                    ? 'Scribe transcribes as you speak and saves the recording to your account. Your iPhone shows it live, and plays it once the audio is saved.'
                    : 'Recording on the web needs your Scribe account. Open Settings to connect it.',
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}
