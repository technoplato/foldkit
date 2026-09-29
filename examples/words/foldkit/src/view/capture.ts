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
} from 'words-core-example'

import { type IconName, icon } from './icon.js'
import { largeTitle } from './shell.js'
import { button, spinner } from './ui.js'

const LEVEL_MINIMUM_HEIGHT_PX = 3
const LEVEL_RANGE_PX = 22

const captureMessage = (message: Capture.Message.Message): Message =>
  GotCaptureMessage({ message })

const LEVEL_BAR_SPACING = 5
const LEVEL_METER_HEIGHT = 28

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
  return h.svg(
    [
      h.AriaHidden(true),
      h.ViewBox(
        `0 0 ${levels.length * LEVEL_BAR_SPACING} ${LEVEL_METER_HEIGHT}`,
      ),
      h.Class(`h-7 w-[140px] ${isPaused ? 'text-tertiary' : 'text-accent'}`),
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
  )
}

const transcriberLabel = (
  transcriber: Capture.Model.TranscriberState,
): string =>
  M.value(transcriber).pipe(
    M.withReturnType<string>(),
    M.when('Connecting', () => 'Connecting live transcription'),
    M.when('Live', () => 'Transcribing live'),
    M.when('Reconnecting', () => 'Reconnecting transcription'),
    M.when('Unavailable', () => 'Transcription unavailable; still recording'),
    M.exhaustive,
  )

const circleButton = (
  label: string,
  iconName: IconName,
  message: Message,
  className: string,
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.AriaLabel(label),
      h.Title(label),
      h.OnClick(message),
      h.Class(
        `inline-flex size-12 shrink-0 items-center justify-center rounded-full transition duration-150 active:scale-95 ${className}`,
      ),
    ],
    [icon(iconName, 'size-5')],
  )
}

const statusText = (
  primary: Html,
  secondary: string,
  secondaryClass = 'text-secondary',
): Html => {
  const h = html<Message>()
  return h.span(
    [h.Class('flex min-w-0 flex-col leading-tight')],
    [
      primary,
      h.span([h.Class(`truncate text-[12px] ${secondaryClass}`)], [secondary]),
    ],
  )
}

const capturingBar = (
  capturing: typeof Capture.Model.Capturing.Type,
  isOnRecordingPage: boolean,
): Html => {
  const h = html<Message>()
  const isPaused = capturing.transport === 'Paused'
  const timer = h.span(
    [h.Class('flex items-center gap-2')],
    [
      h.span(
        [
          h.Class(
            `size-2.5 rounded-full ${isPaused ? 'bg-tertiary' : 'bg-accent animate-breathe'}`,
          ),
        ],
        [],
      ),
      h.span(
        [h.Class('tabular text-[17px] font-semibold text-label')],
        [formatClock(capturing.recordedSeconds)],
      ),
    ],
  )
  const secondary = Option.getOrElse(capturing.maybeWriteProblem, () =>
    isPaused ? 'Paused' : transcriberLabel(capturing.transcriber),
  )
  const status = h.span(
    [h.Class('flex min-w-0 items-center gap-3')],
    [
      statusText(
        timer,
        secondary,
        Option.isSome(capturing.maybeWriteProblem) ||
          capturing.transcriber === 'Unavailable'
          ? 'text-accent'
          : 'text-secondary',
      ),
      h.span(
        [h.Class('hidden sm:block')],
        [levelMeter(capturing.levels, isPaused)],
      ),
    ],
  )
  return h.div(
    [
      h.Role('group'),
      h.AriaLabel('Recording controls'),
      h.Class('glass flex items-center gap-3 rounded-full py-2 pl-5 pr-2'),
    ],
    [
      isOnRecordingPage
        ? h.span(
            [
              h.Title(
                Option.getOrElse(capturing.maybeTranscriberNotice, () => ''),
              ),
              h.Class('min-w-0 flex-1'),
            ],
            [status],
          )
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
        ? circleButton(
            'Resume recording',
            'Play',
            captureMessage(Capture.resumeRecording()),
            'bg-fill text-label hover:bg-fill-strong',
          )
        : circleButton(
            'Pause recording',
            'Pause',
            captureMessage(Capture.pauseRecording()),
            'bg-fill text-label hover:bg-fill-strong',
          ),
      circleButton(
        'Stop recording',
        'Stop',
        captureMessage(Capture.stopRecording()),
        'bg-accent text-white shadow-[0_4px_14px_rgb(255_59_48/0.35)] hover:bg-accent-strong',
      ),
    ],
  )
}

const workingBar = (label: string, detail: string): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Role('status'),
      h.Class('glass flex items-center gap-3 rounded-full px-5 py-3.5'),
    ],
    [
      spinner('size-5 text-accent'),
      statusText(
        h.span([h.Class('text-[15px] font-semibold text-label')], [label]),
        detail,
      ),
    ],
  )
}

const failedSaveBar = (reason: string): Html => {
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
          icon('Alert', 'mt-0.5 size-5 text-accent'),
          statusText(
            h.span(
              [h.Class('text-[15px] font-semibold text-label')],
              ['The audio did not save'],
            ),
            `${reason} The transcript is already saved.`,
          ),
        ],
      ),
      h.span(
        [h.Class('flex gap-2')],
        [
          button(
            'Keep transcript only',
            captureMessage(Capture.keepTranscriptOnly()),
            'Gray',
          ),
          button(
            'Try again',
            captureMessage(Capture.retrySaveRecording()),
            'Prominent',
            Option.some('Refresh'),
          ),
        ],
      ),
    ],
  )
}

const failedStartCard = (reason: string): Html => {
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
          icon('Microphone', 'mt-0.5 size-5 text-accent'),
          statusText(
            h.span(
              [h.Class('text-[15px] font-semibold text-label')],
              ['Recording did not start'],
            ),
            reason,
          ),
        ],
      ),
      h.span(
        [h.Class('flex gap-2')],
        [
          button(
            'Dismiss',
            captureMessage(Capture.dismissCaptureFailure()),
            'Gray',
          ),
          button(
            'Try again',
            captureMessage(Capture.startRecording()),
            'Prominent',
            Option.some('Record'),
          ),
        ],
      ),
    ],
  )
}

/** The Record button, red on white like the iPhone's. */
export const recordButton = (
  className = 'size-16',
  label = 'Start recording',
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.AriaLabel(label),
      h.Title(label),
      h.OnClick(captureMessage(Capture.startRecording())),
      h.Class(`record-button shrink-0 rounded-full ${className}`),
    ],
    [],
  )
}

const recordBar = (): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('glass flex items-center gap-3.5 rounded-full py-2 pl-2 pr-6')],
    [
      recordButton('size-14'),
      h.span(
        [h.Class('flex flex-col leading-tight')],
        [
          h.span([h.Class('text-[16px] font-semibold text-label')], ['Record']),
          h.span(
            [h.Class('hidden text-[12px] text-secondary sm:block')],
            ['Transcribes live, saves to your account'],
          ),
        ],
      ),
    ],
  )
}

/**
 * The recorder in the floating bar, or nothing: Record when a recording can
 * start here, the live controls while recording, and progress or failures
 * while stopping and saving.
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
      NotCapturing: () => (isRecordAvailable ? [recordBar()] : []),
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

/** The new recording page: Record from this browser, transcribed live. */
export const newRecordingPage = (model: Model): Html => {
  const h = html<Message>()
  const isConnected = model.account.connection._tag === 'ConnectedAccount'
  return h.main(
    [h.Class('mx-auto flex w-full max-w-2xl flex-col px-4 pb-44 pt-6 sm:px-6')],
    [
      largeTitle('New recording'),
      h.div(
        [
          h.Class(
            'card mt-6 flex flex-col items-center gap-5 rounded-[28px] px-6 py-12 text-center',
          ),
        ],
        [
          isConnected
            ? recordButton('size-24')
            : icon('Microphone', 'size-12 text-tertiary'),
          h.div(
            [h.Class('flex max-w-md flex-col gap-2')],
            [
              h.h2(
                [
                  h.Class(
                    'text-[20px] font-semibold tracking-tight text-label',
                  ),
                ],
                [
                  isConnected
                    ? 'Record from this browser'
                    : 'Sign in to record',
                ],
              ),
              h.p(
                [h.Class('text-[15px] leading-6 text-secondary')],
                [
                  isConnected
                    ? 'Scribe transcribes as you speak and saves the recording to your account. Your iPhone shows it live, and plays it once the audio is saved.'
                    : 'Recording on the web needs your Scribe account. Open Account to connect it.',
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}
