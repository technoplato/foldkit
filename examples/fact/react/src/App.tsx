import { detailForModel, displayForModel } from 'fact-core-example'

import { FactClientDependency, FactReactClient } from './factReactClient.js'

/** Renders the canonical Fact Program through domain-shaped React hooks. */
export const App = () => {
  const model = FactReactClient.useFactModel()
  const actions = FactReactClient.useFactActions()
  const replay = FactReactClient.useFactReplay()
  const dependency = FactReactClient.useDependency({
    dependencyKey: FactClientDependency,
  })

  const dependencyLabel = (): string => {
    const current = dependency.current
    if (current._tag === 'Idle') {
      return 'Idle'
    } else if (current._tag === 'Starting') {
      return `${current.attempted} · Starting`
    } else if (current._tag === 'Ready') {
      return `${current.current} · Ready`
    } else if (current._tag === 'Switching') {
      return `${current.from} → ${current.to} · Switching`
    } else {
      return `${current.attempted} · Failed`
    }
  }

  const isLoading = model._tag === 'Loading'
  const isSwitching = dependency.current._tag === 'Switching'

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-12 text-zinc-50">
      <section className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-zinc-900 p-7 shadow-2xl sm:p-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-300">
          Canonical Fact Program
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Switch the host Layer, not the Model
        </h1>
        <p className="mt-3 text-zinc-400">
          React sends ClickedLoadFact either way. The FetchFact Command uses the
          implementation selected by the host.
        </p>

        <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-6">
          <p className="text-sm text-zinc-400">FactClient</p>
          <p className="mt-1 font-mono text-sm text-emerald-300">
            {dependencyLabel()}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              className={choiceButtonClassName}
              disabled={isSwitching}
              onClick={() => dependency.switchTo('Mock')}
              type="button"
            >
              Use mock facts
            </button>
            <button
              className={choiceButtonClassName}
              disabled={isSwitching}
              onClick={() => dependency.switchTo('Live')}
              type="button"
            >
              Use real facts
            </button>
          </div>
        </div>

        <div className="mt-6 min-h-48 rounded-2xl bg-white p-6 text-zinc-950">
          <p className="text-2xl font-semibold leading-tight">
            {displayForModel(model)}
          </p>
          <p className="mt-3 text-sm text-zinc-500">{detailForModel(model)}</p>
        </div>

        <button
          className="mt-6 h-12 w-full rounded-xl bg-emerald-400 px-5 font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-50"
          disabled={isLoading || isSwitching}
          onClick={actions.clickedLoadFact}
          type="button"
        >
          {isLoading ? 'Loading fact…' : 'Load fact'}
        </button>

        <section className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-zinc-200">{replay.mode}</span>
            <span className="tabular-nums text-zinc-500">
              Frame {replay.frame} of {replay.finalFrame}
            </span>
          </div>
          <input
            aria-label="Replay frame"
            className="w-full accent-emerald-400"
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
          <p className="text-xs text-zinc-500">
            {replay.occurredRuntimeEvents.length} of{' '}
            {replay.runtimeEvents.length} dependency events occurred by this
            frame.
          </p>
        </section>
      </section>
    </main>
  )
}

const choiceButtonClassName =
  'min-h-11 rounded-xl border border-white/15 bg-zinc-800 px-4 text-sm font-medium transition hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-50'
const replayButtonClassName =
  'h-10 rounded-xl bg-zinc-800 px-3 text-sm font-medium text-zinc-100 transition enabled:hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40'
