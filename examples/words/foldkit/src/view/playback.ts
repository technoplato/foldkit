import { Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  ClickedCopyMomentLink,
  ClickedCopyRecordingLink,
  ClickedCopyTranscript,
  ClickedPause,
  ClickedPlay,
  ClickedRetryAudio,
  ClickedReturnToPlayhead,
  ClickedSkip,
  EndedScrub,
  type Message,
  type Model,
  MovedScrub,
  type ReadyPlayback,
  RecordingListRoute,
  type TranscriptFormat,
  displayedPositionOf,
  durationOf,
  formatClock,
  isLiveRecording,
  scribeRouteToPath,
} from 'words-core-example'

import { transcript } from './transcript.js'

const listPath = scribeRouteToPath(RecordingListRoute())

const SKIP_SECONDS = 15

const pillClass =
  'min-h-11 rounded-full border border-stone-300 px-4 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40'

const copyTranscriptButton = (
  format: TranscriptFormat,
  label: string,
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.OnClick(ClickedCopyTranscript({ format })),
      h.Class(pillClass),
    ],
    [label],
  )
}

const recordingHeader = (ready: ReadyPlayback): Html => {
  const h = html<Message>()
  const summary = ready.detail.summary
  return h.div(
    [h.Class('mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-4')],
    [
      h.a(
        [
          h.Href(listPath),
          h.Class('text-sm text-stone-500 hover:text-stone-900'),
        ],
        ['← Recordings'],
      ),
      h.div(
        [h.Class('flex flex-wrap items-center gap-2')],
        [
          h.h1(
            [h.Class('text-2xl font-semibold text-stone-900')],
            [summary.title],
          ),
          ...(isLiveRecording(ready)
            ? [
                h.span(
                  [
                    h.Class(
                      'rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white',
                    ),
                  ],
                  ['● Live'],
                ),
              ]
            : []),
        ],
      ),
      h.p(
        [h.Class('text-sm text-stone-500')],
        [
          `${new Date(summary.startedAtMs).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · ${formatClock(summary.durationSeconds)}`,
        ],
      ),
      ...(ready.skippedCount > 0
        ? [
            h.p(
              [h.Class('text-sm text-amber-700')],
              [
                `${ready.skippedCount} rows of this recording could not be read and are not shown. ${Option.getOrElse(ready.maybeSkippedReason, () => '')}`,
              ],
            ),
          ]
        : []),
      h.div(
        [h.Class('flex flex-wrap gap-2')],
        [
          h.button(
            [
              h.Type('button'),
              h.OnClick(
                ClickedCopyRecordingLink({ recordingID: ready.recordingID }),
              ),
              h.Class(pillClass),
            ],
            ['Copy link'],
          ),
          copyTranscriptButton('PlainText', 'Copy transcript'),
          copyTranscriptButton('Markdown', 'Copy Markdown'),
          copyTranscriptButton('Srt', 'Copy SRT'),
        ],
      ),
    ],
  )
}

const returnButton = (ready: ReadyPlayback): ReadonlyArray<Html> => {
  const h = html<Message>()
  return ready.follow === 'Detached'
    ? [
        h.button(
          [
            h.Type('button'),
            h.OnClick(ClickedReturnToPlayhead()),
            h.Class(
              'min-h-11 rounded-full bg-stone-900 px-4 text-sm font-medium text-white shadow hover:bg-stone-700',
            ),
          ],
          [isLiveRecording(ready) ? 'Jump to latest' : 'Return to playhead'],
        ),
      ]
    : []
}

const statusLine = (text: string): Html => {
  const h = html<Message>()
  return h.p([h.Class('text-sm text-stone-600')], [text])
}

const transportControls = (ready: ReadyPlayback): ReadonlyArray<Html> => {
  const h = html<Message>()
  const position = displayedPositionOf(ready)
  const duration = durationOf(ready)
  const isPlaying = ready.transport === 'Playing'
  return [
    h.div(
      [h.Class('flex items-center gap-2')],
      [
        h.button(
          [
            h.Type('button'),
            h.AriaLabel(`Back ${SKIP_SECONDS} seconds`),
            h.OnClick(ClickedSkip({ deltaSeconds: -SKIP_SECONDS })),
            h.Class(pillClass),
          ],
          [`−${SKIP_SECONDS}`],
        ),
        h.button(
          [
            h.Type('button'),
            h.OnClick(isPlaying ? ClickedPause() : ClickedPlay()),
            h.Class(
              'min-h-12 min-w-24 rounded-full bg-stone-900 px-5 text-sm font-semibold text-white hover:bg-stone-700',
            ),
          ],
          [isPlaying ? 'Pause' : 'Play'],
        ),
        h.button(
          [
            h.Type('button'),
            h.AriaLabel(`Forward ${SKIP_SECONDS} seconds`),
            h.OnClick(ClickedSkip({ deltaSeconds: SKIP_SECONDS })),
            h.Class(pillClass),
          ],
          [`+${SKIP_SECONDS}`],
        ),
        h.span(
          [h.Class('ml-2 font-mono text-sm text-stone-600')],
          [`${formatClock(position)} / ${formatClock(duration)}`],
        ),
      ],
    ),
    h.input([
      h.Type('range'),
      h.AriaLabel('Playback position'),
      h.Min('0'),
      h.Max(String(duration)),
      h.Step('0.1'),
      h.Value(String(position)),
      h.OnInput(value => MovedScrub({ seconds: Number(value) })),
      h.OnChange(value => EndedScrub({ seconds: Number(value) })),
      h.Class('h-8 w-full cursor-pointer accent-stone-900'),
    ]),
    h.div(
      [h.Class('flex flex-wrap items-center gap-2')],
      [
        h.button(
          [
            h.Type('button'),
            h.OnClick(ClickedCopyMomentLink()),
            h.Class(pillClass),
          ],
          ['Copy link to this moment'],
        ),
        ...returnButton(ready),
      ],
    ),
  ]
}

const audioControls = (ready: ReadyPlayback): ReadonlyArray<Html> => {
  const h = html<Message>()
  if (isLiveRecording(ready)) {
    return [
      h.div(
        [h.Class('flex flex-wrap items-center gap-3')],
        [
          h.span(
            [h.Class('font-mono text-sm text-red-700')],
            [`● Live · ${formatClock(ready.detail.summary.durationSeconds)}`],
          ),
          statusLine(
            'Following along as the phone transcribes. Audio arrives when the recording ends.',
          ),
          ...returnButton(ready),
        ],
      ),
    ]
  } else {
    return M.value(ready.detail.audio).pipe(
      M.withReturnType<ReadonlyArray<Html>>(),
      M.tagsExhaustive({
        NoAudio: () => [
          statusLine('This recording has no audio.'),
          ...returnButton(ready),
        ],
        UploadingAudio: () => [
          statusLine('The audio is still uploading from the phone.'),
          ...returnButton(ready),
        ],
        StoredAudio: () =>
          M.value(ready.audioPlayer).pipe(
            M.withReturnType<ReadonlyArray<Html>>(),
            M.tagsExhaustive({
              NoAudioPlayer: () => [
                statusLine('Loading audio…'),
                ...returnButton(ready),
              ],
              AudioPlayerFailed: ({ reason }) => [
                h.div(
                  [h.Class('flex flex-wrap items-center gap-3')],
                  [
                    h.p([h.Class('text-sm text-red-700')], [reason]),
                    h.button(
                      [
                        h.Type('button'),
                        h.OnClick(ClickedRetryAudio()),
                        h.Class(pillClass),
                      ],
                      ['Retry'],
                    ),
                  ],
                ),
              ],
              AudioPlayerReady: () => transportControls(ready),
            }),
          ),
      }),
    )
  }
}

const controlsBar = (ready: ReadyPlayback): Html => {
  const h = html<Message>()
  return h.footer(
    [
      h.Class(
        'fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 backdrop-blur',
      ),
    ],
    [
      h.div(
        [h.Class('mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 py-3')],
        audioControls(ready),
      ),
    ],
  )
}

const notice = (title: string, body: string): Html => {
  const h = html<Message>()
  return h.main(
    [h.Class('mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-10')],
    [
      h.h1([h.Class('text-xl font-semibold text-stone-900')], [title]),
      h.p([h.Class('text-stone-600')], [body]),
      h.a(
        [h.Href(listPath), h.Class('text-sm text-sky-700 hover:underline')],
        ['← Recordings'],
      ),
    ],
  )
}

const accountName = (model: Model): string =>
  M.value(model.identity).pipe(
    M.withReturnType<string>(),
    M.tag('SignedIn', ({ maybeEmail }) =>
      Option.getOrElse(maybeEmail, () => 'this account'),
    ),
    M.orElse(() => 'this account'),
  )

/** The playback page: opening, missing, failed, or the recording itself. */
export const playbackPage = (model: Model): Html => {
  const h = html<Message>()
  return M.value(model.playback).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      NoPlayback: () =>
        notice('Nothing is open', 'Pick a recording from the list.'),
      OpeningPlayback: () =>
        notice('Opening recording…', 'Loading the transcript from Instant.'),
      MissingRecording: () =>
        notice(
          'This recording is not available',
          `It does not exist or is not shared with ${accountName(model)}. Ask the owner to share it with this account.`,
        ),
      FailedPlayback: ({ reason }) =>
        notice('The recording could not load', reason),
      ReadyPlayback: ready =>
        h.div(
          [h.Class('flex flex-col')],
          [recordingHeader(ready), transcript(ready), controlsBar(ready)],
        ),
    }),
  )
}
