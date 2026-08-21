import { Array, Option } from 'effect'
import { Document, html } from 'foldkit/html'
import {
  ClickedJob,
  type Message,
  type Model,
  jobsFromCatalog,
  selectedJob,
} from 'transcribe-core-example'

import { Button } from '@foldkit/ui'

const currentJob = (model: Model) => {
  const selected = selectedJob(model)
  if (Option.isSome(selected)) {
    return selected
  }
  return Array.head(jobsFromCatalog(model.catalog))
}

// VIEW

/** Renders Transcribe jobs as a sequential notebook. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  const jobs = jobsFromCatalog(model.catalog)
  const maybeJob = currentJob(model)
  const source =
    model.source === 'Instant'
      ? 'Live Instant jobs'
      : 'Seed jobs. Instant is unreachable or empty.'

  const page = Option.match(maybeJob, {
    onNone: () => h.p([], ['Observing Knophy transcribe jobs…']),
    onSome: job => {
      const index = jobs.findIndex(candidate => candidate.id === job.id)
      const previous = index > 0 ? jobs[index - 1] : undefined
      const next =
        index >= 0 && index < jobs.length - 1 ? jobs[index + 1] : undefined
      const noteLabel =
        'Job ' + String(index + 1) + ' of ' + String(jobs.length)
      return h.article(
        [h.Class('mx-auto max-w-2xl space-y-6')],
        [
          h.p(
            [h.Class('font-mono text-xs text-sky-800')],
            [noteLabel + ' · ' + job.status],
          ),
          h.h1([h.Class('font-serif text-4xl text-stone-900')], [job.title]),
          h.p(
            [h.Class('font-serif text-lg leading-8 text-stone-700')],
            [job.analysis],
          ),
          h.pre(
            [
              h.Class(
                'max-h-80 overflow-auto whitespace-pre-wrap font-sans text-sm leading-6',
              ),
            ],
            [
              job.transcriptText.length === 0
                ? 'Transcript is not ready yet.'
                : job.transcriptText,
            ],
          ),
          h.div(
            [h.Class('flex gap-3')],
            [
              previous === undefined
                ? h.span([], [])
                : Button.view<Message>({
                    onClick: ClickedJob.make({ id: previous.id }),
                    toView: attributes =>
                      h.button(
                        [
                          ...attributes.button,
                          h.Class('rounded-full border px-4 py-2 text-sm'),
                        ],
                        ['Previous'],
                      ),
                  }),
              next === undefined
                ? h.span([], [])
                : Button.view<Message>({
                    onClick: ClickedJob.make({ id: next.id }),
                    toView: attributes =>
                      h.button(
                        [
                          ...attributes.button,
                          h.Class(
                            'rounded-full bg-stone-900 px-4 py-2 text-sm text-white',
                          ),
                        ],
                        ['Next'],
                      ),
                  }),
            ],
          ),
        ],
      )
    },
  })

  return {
    title: 'Knophy transcribe | Book',
    body: h.div(
      [h.Class('min-h-screen bg-sky-50 p-10')],
      [
        h.p(
          [
            h.Class(
              'mb-8 text-center text-xs uppercase tracking-wide text-sky-800',
            ),
          ],
          ['Knophy transcribe'],
        ),
        h.p([h.Class('mb-10 text-center text-sm text-stone-600')], [source]),
        page,
      ],
    ),
  }
}
