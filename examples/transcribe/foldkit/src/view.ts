import { Array, Match as M, Option } from 'effect'
import { Document, type Html, html } from 'foldkit/html'
import {
  ClickedJob,
  ClosedJob,
  type Message,
  type Model,
  PressedCopyLink,
  PressedFollowLive,
  PressedSeekWord,
  ScrolledAway,
  SubmittedUrl,
  type Transcript,
  UpdatedDraftUrl,
  type Word,
  jobShareUrl,
  selectedJob,
  visibleJobs,
  wordAt,
} from 'transcribe-core-example'

import { Button } from '@foldkit/ui'

import { ObserveReaderVideo, ScrollCurrentWord } from './audio-clock.js'

const sourceLabel = (model: Model): string =>
  model.source === 'Instant'
    ? 'Live Instant jobs'
    : 'Seed jobs. Instant is unreachable or empty.'

const statusLabel = (job: Transcript): string => job.status

const formatTime = (seconds: number): string => {
  const rounded = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(rounded / 60)
  const rest = rounded % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

const jobCard = (job: Transcript, isSelected: boolean): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Key(job.id),
      h.OnClick(ClickedJob.make({ id: job.id })),
      h.Class(
        isSelected
          ? 'w-full rounded-2xl border border-sky-400 bg-sky-50 p-5 text-left shadow-sm'
          : 'w-full rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm hover:border-sky-400',
      ),
    ],
    [
      h.span([h.Class('font-mono text-xs text-sky-800')], [statusLabel(job)]),
      h.strong([h.Class('mt-2 block text-lg text-stone-900')], [job.title]),
      h.p([h.Class('mt-2 text-sm leading-6 text-stone-600')], [job.url]),
    ],
  )
}

const frameGallery = (job: Transcript): Html => {
  const h = html<Message>()
  if (job.frames.length === 0) {
    return h.p(
      [h.Class('text-sm text-stone-500')],
      ['Frames appear here after ingest.'],
    )
  }
  return h.div(
    [h.Class('grid grid-cols-2 gap-3')],
    Array.map(job.frames, frame =>
      h.figure(
        [
          h.Key(frame.id),
          h.Class(
            'overflow-hidden rounded-xl border border-stone-200 bg-stone-100',
          ),
        ],
        [
          frame.imageUrl === undefined
            ? h.div(
                [
                  h.Class(
                    'flex aspect-video items-center justify-center text-xs text-stone-500',
                  ),
                ],
                [frame.caption],
              )
            : h.img([
                h.Alt(frame.caption),
                h.Class('aspect-video w-full object-cover'),
                h.Src(frame.imageUrl),
              ]),
          h.figcaption(
            [h.Class('px-2 py-1 font-mono text-xs text-stone-600')],
            [frame.caption],
          ),
        ],
      ),
    ),
  )
}

const wordButton = (
  word: Word,
  maybeCurrentId: Option.Option<string>,
  followLive: boolean,
): Html => {
  const h = html<Message>()
  const isCurrent =
    Option.isSome(maybeCurrentId) && maybeCurrentId.value === word.id
  const attributes = [
    h.Type('button'),
    h.Key(word.id),
    h.AriaLabel(word.text),
    h.Class(isCurrent ? 'word-pill word-pill-current' : 'word-pill'),
    h.OnClick(PressedSeekWord.make({ start: word.start })),
    ...(isCurrent && followLive
      ? [h.AriaCurrent('true'), h.OnMount(ScrollCurrentWord())]
      : isCurrent
        ? [h.AriaCurrent('true')]
        : []),
  ]
  return h.button(attributes, [word.text])
}

const transcriptWords = (model: Model, fallbackText: string): Html => {
  const h = html<Message>()
  if (model.words.length === 0) {
    return h.pre(
      [
        h.Class(
          'max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-sm leading-6 text-stone-800',
        ),
      ],
      [
        fallbackText.length === 0
          ? 'Transcript is not ready yet.'
          : fallbackText,
      ],
    )
  }
  const maybeCurrent = wordAt(model.words, model.currentTime)
  const maybeCurrentId = Option.map(maybeCurrent, word => word.id)
  return h.div(
    [
      h.Class('transcript-scroller'),
      h.OnScroll(_scrollTop => ScrolledAway.make({})),
    ],
    model.words.map(word =>
      wordButton(word, maybeCurrentId, model.follow._tag === 'FollowLive'),
    ),
  )
}

const mediaSrc = (model: Model): string =>
  model.usingFallback && model.fallbackUrl.length > 0
    ? model.fallbackUrl
    : model.mediaUrl

const jobVideo = (model: Model): Html => {
  const h = html<Message>()
  const src = mediaSrc(model)
  if (src.length === 0) {
    return h.p(
      [h.Class('text-sm text-stone-500')],
      ['Local media is not available yet.'],
    )
  }
  return h.video(
    [
      h.Id('transcribe-reader-video'),
      h.Key(src),
      h.Class('w-full rounded-xl bg-black'),
      h.Controls(true),
      h.Playsinline(true),
      h.Preload('auto'),
      h.Src(src),
      h.OnMount(ObserveReaderVideo({ src })),
    ],
    [],
  )
}

const followFab = (model: Model): Html => {
  const h = html<Message>()
  return model.follow._tag === 'FollowAway'
    ? h.button(
        [
          h.Type('button'),
          h.Class('follow-fab'),
          h.AriaLabel('Scroll to current word'),
          h.OnClick(PressedFollowLive.make({})),
        ],
        ['Scroll to current word'],
      )
    : h.span([], [])
}

const selectedPanel = (model: Model): Html => {
  const h = html<Message>()
  const maybeJob = selectedJob(model)
  if (Option.isNone(maybeJob)) {
    return h.div(
      [
        h.Class(
          'rounded-2xl border border-dashed border-stone-300 bg-white p-6',
        ),
      ],
      [
        h.p(
          [h.Class('text-sm text-stone-500')],
          ['Paste a video URL to queue a job, or select one from the list.'],
        ),
      ],
    )
  }
  const job = maybeJob.value
  const shareHref = jobShareUrl(job.videoId)
  const lastWord = model.words[model.words.length - 1]
  const duration = lastWord?.end ?? 0
  return h.article(
    [
      h.Class(
        'grid gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm',
      ),
    ],
    [
      h.p(
        [h.Class('font-mono text-xs text-sky-800')],
        [`${statusLabel(job)} · ${job.videoId}`],
      ),
      h.h2([h.Class('text-2xl font-semibold text-stone-900')], [job.title]),
      h.p([h.Class('text-sm text-stone-600')], [job.url]),
      h.p(
        [h.Class('font-mono text-xs text-stone-500')],
        [
          model.usingFallback
            ? 'Playing original URL. Local media was missing.'
            : `Playing local file ${model.mediaUrl || '…'}`,
        ],
      ),
      jobVideo(model),
      h.div(
        [h.Class('flex flex-wrap items-center gap-2')],
        [
          h.span(
            [h.Class('text-xs tabular-nums text-stone-500')],
            [
              duration > 0
                ? `${formatTime(model.currentTime)} / ${formatTime(duration)}`
                : formatTime(model.currentTime),
            ],
          ),
          Button.view<Message>({
            onClick: PressedCopyLink.make({}),
            toView: attributes =>
              h.button(
                [
                  ...attributes.button,
                  h.Class(
                    'rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:border-stone-500',
                  ),
                ],
                ['Send'],
              ),
          }),
          h.a(
            [
              h.Href(shareHref),
              h.Class('text-sm text-sky-800 hover:underline'),
            ],
            [shareHref],
          ),
          model.copyNotice.length === 0
            ? h.span([], [])
            : h.span([h.Class('text-xs text-sky-800')], [model.copyNotice]),
        ],
      ),
      h.section(
        [h.Class('grid gap-2')],
        [
          h.h3(
            [
              h.Class(
                'text-sm font-semibold uppercase tracking-wide text-stone-500',
              ),
            ],
            ['Analysis'],
          ),
          h.p([h.Class('text-base leading-7 text-stone-700')], [job.analysis]),
        ],
      ),
      h.section(
        [h.Class('grid gap-2')],
        [
          h.h3(
            [
              h.Class(
                'text-sm font-semibold uppercase tracking-wide text-stone-500',
              ),
            ],
            ['Frames'],
          ),
          frameGallery(job),
        ],
      ),
      h.section(
        [h.Class('grid gap-2')],
        [
          h.h3(
            [
              h.Class(
                'text-sm font-semibold uppercase tracking-wide text-stone-500',
              ),
            ],
            ['Transcript'],
          ),
          transcriptWords(model, job.transcriptText),
        ],
      ),
      followFab(model),
      Button.view<Message>({
        onClick: ClosedJob.make({}),
        toView: attributes =>
          h.button(
            [
              ...attributes.button,
              h.Class(
                'mt-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:border-stone-500',
              ),
            ],
            ['Close'],
          ),
      }),
    ],
  )
}

const catalogBody = (model: Model): Html => {
  const h = html<Message>()
  return M.value(model.catalog).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      LoadingCatalog: () => h.p([], ['Observing Knophy transcribe jobs…']),
      FailedCatalog: ({ reason }) =>
        h.div(
          [h.Class('grid gap-3')],
          [
            h.p(
              [h.Role('alert'), h.Class('text-sm text-amber-800')],
              [`Instant is unreachable (${reason}). Showing seed jobs.`],
            ),
            ...Array.map(visibleJobs(model), job =>
              jobCard(
                job,
                Option.isSome(model.selectedId) &&
                  (model.selectedId.value === job.id ||
                    model.selectedId.value === job.videoId ||
                    model.selectedId.value === job.slug),
              ),
            ),
          ],
        ),
      LoadedCatalog: () =>
        h.div(
          [h.Class('grid gap-3')],
          visibleJobs(model).length === 0
            ? [
                h.p(
                  [h.Class('text-sm text-stone-500')],
                  ['No jobs yet. Paste a video URL to queue one.'],
                ),
              ]
            : Array.map(visibleJobs(model), job =>
                jobCard(
                  job,
                  Option.isSome(model.selectedId) &&
                    (model.selectedId.value === job.id ||
                      model.selectedId.value === job.videoId ||
                      model.selectedId.value === job.slug),
                ),
              ),
        ),
    }),
  )
}

/** Renders the Transcribe catalog as Html for captive and page hosts. */
export const body = (model: Model): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('min-h-screen bg-stone-50 text-stone-900')],
    [
      h.main(
        [h.Class('mx-auto grid max-w-6xl gap-8 p-8 lg:grid-cols-[1fr_1.1fr]')],
        [
          h.section(
            [h.Class('grid gap-4')],
            [
              h.p(
                [
                  h.Class(
                    'text-xs font-semibold uppercase tracking-wide text-sky-800',
                  ),
                ],
                ['Knophy transcribe'],
              ),
              h.h1([h.Class('text-3xl font-semibold')], ['Video transcripts']),
              h.p([h.Class('text-sm text-stone-600')], [sourceLabel(model)]),
              h.form(
                [
                  h.Class('grid gap-2'),
                  h.OnSubmit(SubmittedUrl.make({ url: model.draftUrl })),
                ],
                [
                  h.input([
                    h.Class(
                      'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-sky-500',
                    ),
                    h.Placeholder('https://youtu.be/…'),
                    h.Value(model.draftUrl),
                    h.OnInput(draftUrl => UpdatedDraftUrl.make({ draftUrl })),
                  ]),
                  Button.view<Message>({
                    onClick: SubmittedUrl.make({ url: model.draftUrl }),
                    toView: attributes =>
                      h.button(
                        [
                          ...attributes.button,
                          h.Class(
                            'rounded-full bg-sky-800 px-4 py-2 text-sm text-white hover:bg-sky-900',
                          ),
                        ],
                        ['Open job'],
                      ),
                  }),
                ],
              ),
              catalogBody(model),
            ],
          ),
          selectedPanel(model),
        ],
      ),
    ],
  )
}

// VIEW

/** Renders the Transcribe catalog with Foldkit HTML and owns the page title. */
export const view = (model: Model): Document => ({
  title: 'Knophy transcribe',
  body: body(model),
})
