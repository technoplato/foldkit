import { Array, Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  ClickedJob,
  type Message,
  type Model,
  SubmittedUrl,
  UpdatedDraftUrl,
  visibleJobs,
} from 'transcribe-core-example'

/** Captive Html view. The host owns the document title and URL. */
export const view = (model: Model): Html => {
  const h = html<Message>()
  const jobs = visibleJobs(model)
  const source =
    model.source === 'Instant'
      ? 'Live Instant jobs'
      : 'Seed jobs. Instant is unreachable or empty.'
  return h.div(
    [h.Class('rounded-xl border border-sky-200 bg-sky-50 p-6')],
    [
      h.p(
        [h.Class('text-xs font-semibold uppercase tracking-wide text-sky-800')],
        ['Knophy transcribe widget'],
      ),
      h.p([h.Class('mt-1 text-sm text-sky-900')], [source]),
      h.input([
        h.Class(
          'mt-4 w-full rounded-lg border border-sky-300 bg-white px-3 py-2',
        ),
        h.Placeholder('https://youtu.be/…'),
        h.Value(model.draftUrl),
        h.OnInput(draftUrl => UpdatedDraftUrl.make({ draftUrl })),
      ]),
      h.button(
        [
          h.Class('mt-2 rounded-full bg-sky-800 px-4 py-2 text-sm text-white'),
          h.OnClick(SubmittedUrl.make({ url: model.draftUrl })),
        ],
        ['Open job'],
      ),
      M.value(model.catalog).pipe(
        M.withReturnType<Html>(),
        M.tagsExhaustive({
          LoadingCatalog: () => h.p([h.Class('mt-4')], ['Observing…']),
          FailedCatalog: ({ reason }) =>
            h.p([h.Role('alert'), h.Class('mt-4 text-sm')], [reason]),
          LoadedCatalog: () =>
            h.ul(
              [h.Class('mt-4 grid gap-2')],
              Array.map(jobs, job =>
                h.li(
                  [h.Key(job.id)],
                  [
                    h.button(
                      [
                        h.OnClick(ClickedJob.make({ id: job.id })),
                        h.Class('w-full rounded-lg bg-white p-3 text-left'),
                      ],
                      [`${job.title} · ${job.status}`],
                    ),
                  ],
                ),
              ),
            ),
        }),
      ),
    ],
  )
}
