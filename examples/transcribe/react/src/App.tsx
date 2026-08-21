import { Array, Match as M, Option } from 'effect'
import { selectedJob, visibleJobs } from 'transcribe-core-example'
import { initialTranscribeRoute } from 'transcribe-react-bindings-example'

import { TranscribeClient } from './client.js'

export const App = () => (
  <TranscribeClient.Provider initialRoute={initialTranscribeRoute}>
    <TranscribeScreen />
  </TranscribeClient.Provider>
)

const TranscribeScreen = () => {
  const model = TranscribeClient.useModel()
  const actions = TranscribeClient.useActions()
  const jobs = visibleJobs(model)
  const source =
    model.source === 'Instant'
      ? 'Live Instant jobs'
      : 'Seed jobs. Instant is unreachable or empty.'
  const maybeJob = selectedJob(model)

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <section className="mx-auto grid max-w-6xl gap-8 p-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
            Knophy transcribe
          </p>
          <h1 className="text-3xl font-semibold">Video transcripts</h1>
          <p className="text-sm text-stone-600">{source}</p>
          <input
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
            onChange={event =>
              actions.updatedDraftUrl(event.currentTarget.value)
            }
            placeholder="https://youtu.be/…"
            value={model.draftUrl}
          />
          <button
            className="rounded-full bg-sky-800 px-4 py-2 text-sm text-white"
            onClick={() => actions.submittedUrl(model.draftUrl)}
            type="button"
          >
            Open job
          </button>
          {M.value(model.catalog).pipe(
            M.tagsExhaustive({
              LoadingCatalog: () => <p>Observing Knophy transcribe jobs…</p>,
              FailedCatalog: ({ reason }) => (
                <p role="alert">
                  Instant is unreachable ({reason}). Showing seed jobs.
                </p>
              ),
              LoadedCatalog: () => null,
            }),
          )}
          <div className="grid gap-3">
            {Array.map(jobs, job => (
              <button
                className="rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm hover:border-sky-400"
                key={job.id}
                onClick={() => actions.clickedJob(job.id)}
                type="button"
              >
                <span className="font-mono text-xs text-sky-800">
                  {job.status}
                </span>
                <strong className="mt-2 block text-lg">{job.title}</strong>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {job.url}
                </p>
              </button>
            ))}
          </div>
        </div>
        <aside>
          {Option.match(maybeJob, {
            onNone: () => (
              <p className="text-sm text-stone-500">
                Paste a video URL or select a job.
              </p>
            ),
            onSome: job => (
              <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <p className="font-mono text-xs text-sky-800">
                  {job.status} · {job.videoId}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">{job.title}</h2>
                <p className="mt-4 text-base leading-7 text-stone-700">
                  {job.analysis}
                </p>
                <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap text-sm">
                  {job.transcriptText.length === 0
                    ? 'Transcript is not ready yet.'
                    : job.transcriptText}
                </pre>
                <button
                  className="mt-6 rounded-full border border-stone-300 px-4 py-2 text-sm"
                  onClick={actions.closedJob}
                  type="button"
                >
                  Close
                </button>
              </article>
            ),
          })}
        </aside>
      </section>
    </main>
  )
}
