import { Array, Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  ClickedCopyRecordingLink,
  ClickedShowMoreRecordings,
  type Message,
  type Model,
  RecordingRoute,
  type RecordingSummary,
  formatClock,
  scribeRouteToPath,
} from 'words-core-example'

const startedAtLabel = (startedAtMs: number): string =>
  new Date(startedAtMs).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

const activityBadge = (recording: RecordingSummary): ReadonlyArray<Html> => {
  const h = html<Message>()
  return M.value(recording.activity).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.when('Recording', () => [
      h.span(
        [
          h.Class(
            'inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white',
          ),
        ],
        ['● Live'],
      ),
    ]),
    M.when('Playing', () => [
      h.span(
        [
          h.Class(
            'rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800',
          ),
        ],
        ['Playing'],
      ),
    ]),
    M.when('Idle', () => []),
    M.exhaustive,
  )
}

const recordingCard = (recording: RecordingSummary): Html => {
  const h = html<Message>()
  return h.li(
    [
      h.Key(recording.id),
      h.Class(
        'flex gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm hover:border-stone-400',
      ),
    ],
    [
      h.a(
        [
          h.Href(
            scribeRouteToPath(RecordingRoute({ recordingID: recording.id })),
          ),
          h.Class('flex min-w-0 flex-1 flex-col gap-1'),
        ],
        [
          h.span(
            [h.Class('flex items-center gap-2')],
            [
              h.strong(
                [h.Class('truncate text-base text-stone-900')],
                [recording.title],
              ),
              ...activityBadge(recording),
            ],
          ),
          h.span(
            [h.Class('text-sm text-stone-500')],
            [
              `${startedAtLabel(recording.startedAtMs)} · ${formatClock(recording.durationSeconds)}${Option.match(
                recording.maybeDeviceIcon,
                { onNone: () => '', onSome: icon => ` · ${icon}` },
              )}`,
            ],
          ),
          ...Array.map(recording.previewLines, line =>
            h.span([h.Class('line-clamp-1 text-sm text-stone-700')], [line]),
          ),
        ],
      ),
      h.button(
        [
          h.Type('button'),
          h.AriaLabel(`Copy link to ${recording.title}`),
          h.Title('Copy link to recording'),
          h.OnClick(ClickedCopyRecordingLink({ recordingID: recording.id })),
          h.Class(
            'min-h-11 min-w-11 self-start rounded-full border border-stone-300 px-3 text-sm text-stone-700 hover:bg-stone-100',
          ),
        ],
        ['Copy link'],
      ),
    ],
  )
}

/** The recording list, newest first, live. */
export const recordingList = (model: Model): Html => {
  const h = html<Message>()
  return h.main(
    [h.Class('mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6')],
    M.value(model.recordings).pipe(
      M.withReturnType<ReadonlyArray<Html>>(),
      M.tagsExhaustive({
        LoadingRecordings: () => [
          h.p([h.Class('text-stone-500')], ['Loading recordings…']),
        ],
        FailedRecordings: ({ reason }) => [
          h.p(
            [h.Class('text-red-700')],
            [`The recordings could not load. ${reason}`],
          ),
        ],
        LoadedRecordings: ({
          recordings,
          skippedCount,
          maybeSkippedReason,
        }) => [
          h.h1(
            [h.Class('text-2xl font-semibold text-stone-900')],
            ['Recordings'],
          ),
          ...(skippedCount > 0
            ? [
                h.p(
                  [h.Class('text-sm text-amber-700')],
                  [
                    `${skippedCount} recording rows could not be read and are not shown. ${Option.getOrElse(maybeSkippedReason, () => '')}`,
                  ],
                ),
              ]
            : []),
          ...(model.identity._tag === 'SignedOut'
            ? [
                h.p(
                  [
                    h.Class(
                      'rounded-xl bg-amber-50 p-3 text-sm text-amber-900',
                    ),
                  ],
                  [
                    'To see your recordings here, sign in to Scribe on your iPhone first (Account, then Google, as the same email you use here). Then reload this page.',
                  ],
                ),
              ]
            : []),
          Array.match(recordings, {
            onEmpty: () =>
              h.p(
                [h.Class('text-stone-500')],
                [
                  'No recordings are shared with this account yet. Recordings appear here once the iPhone links its account or shares them.',
                ],
              ),
            onNonEmpty: nonEmpty =>
              h.ul(
                [h.Class('flex flex-col gap-3')],
                Array.map(nonEmpty, recordingCard),
              ),
          }),
          ...(Array.length(recordings) >= model.recordingListLimit
            ? [
                h.button(
                  [
                    h.Type('button'),
                    h.OnClick(ClickedShowMoreRecordings()),
                    h.Class(
                      'min-h-11 self-center rounded-full border border-stone-300 px-5 text-sm text-stone-700 hover:bg-stone-100',
                    ),
                  ],
                  ['Show more'],
                ),
              ]
            : []),
        ],
      }),
    ),
  )
}
