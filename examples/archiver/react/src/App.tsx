import {
  ArchiverProvider,
  useArchiverActions,
  useArchiverModel,
  useArchiverReplay,
} from 'archiver-react-bindings-example'

export const App = () => (
  <ArchiverProvider>
    <ArchiverScreen />
  </ArchiverProvider>
)

const ArchiverScreen = () => {
  const model = useArchiverModel()
  const actions = useArchiverActions()
  const replay = useArchiverReplay()

  return (
    <main className="min-h-screen bg-white text-gray-900 p-6">
      <section className="mx-auto w-full max-w-xl space-y-6">
        <h1 className="text-3xl font-bold">Archiver</h1>
        <p className="text-gray-600">
          Paste an Instagram, TikTok, or YouTube URL to archive it.
        </p>
        <form
          className="flex flex-col gap-3"
          onSubmit={event => {
            event.preventDefault()
            actions.submittedArchiveUrl()
          }}
        >
          <label className="flex flex-col gap-1">
            Source URL
            <input
              className="border border-gray-300 rounded px-3 py-2 bg-white"
              onChange={event =>
                actions.updatedUrlDraft(event.currentTarget.value)
              }
              placeholder="https://"
              value={model.urlDraft}
            />
          </label>
          <button className={buttonClassName} type="submit">
            Archive
          </button>
        </form>
        {model.archives.length === 0 ? (
          <p className="text-gray-500">No archives yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {model.archives.map(archive => (
              <li
                className="border border-gray-200 rounded p-3 flex flex-col gap-1"
                key={archive.id}
              >
                <button
                  className="text-left font-medium"
                  onClick={() => actions.clickedArchive(archive.id)}
                  type="button"
                >
                  {archive.title}
                </button>
                <span className="text-sm text-gray-500">
                  {statusLabel(archive.status._tag)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <section className="space-y-3 border border-gray-200 p-4 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{replay.mode}</span>
            <span className="tabular-nums text-gray-500">
              Frame {replay.frame} of {replay.finalFrame}
            </span>
          </div>
          <input
            aria-label="Replay frame"
            className="w-full accent-black"
            max={replay.finalFrame}
            min={0}
            onChange={event => replay.seek(Number(event.currentTarget.value))}
            type="range"
            value={replay.frame}
          />
          <div className="grid grid-cols-3 gap-2">
            <button
              className={replayButtonClassName}
              disabled={replay.frame === 0}
              onClick={replay.stepBackward}
              type="button"
            >
              Back
            </button>
            <button
              className={replayButtonClassName}
              disabled={replay.mode === 'Inspecting'}
              onClick={() => replay.inspect()}
              type="button"
            >
              Inspect
            </button>
            <button
              className={replayButtonClassName}
              disabled={
                replay.mode === 'Live' || replay.frame === replay.finalFrame
              }
              onClick={replay.stepForward}
              type="button"
            >
              Next
            </button>
          </div>
        </section>
      </section>
    </main>
  )
}

const statusLabel = (
  tag: 'QueuedArchive' | 'ReadyArchive' | 'FailedArchive',
): string => {
  if (tag === 'QueuedArchive') {
    return 'Queued'
  }
  if (tag === 'ReadyArchive') {
    return 'Ready'
  }
  return 'Failed'
}

const buttonClassName =
  'h-12 bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900'
const replayButtonClassName =
  'h-10 bg-gray-100 px-3 text-sm font-medium transition enabled:hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40'
