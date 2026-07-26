import { Match as M, Schema as S } from 'effect'
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useState,
} from 'react'
import {
  ReplayPresentation,
  type ReplayProgramId,
  Workbench,
} from 'replayability-core-example'
import {
  useReplayabilityActions,
  useReplayabilityModel,
} from 'replayability-react-bindings-example'

const PanelFrame = S.Struct({
  height: S.Number,
  width: S.Number,
  x: S.Number,
  y: S.Number,
})
type PanelFrame = typeof PanelFrame.Type

const IdlePanelInteraction = S.TaggedStruct('IdlePanelInteraction', {})
const DraggingPanel = S.TaggedStruct('DraggingPanel', {
  panelFrame: PanelFrame,
  pointerX: S.Number,
  pointerY: S.Number,
})
const ResizingPanel = S.TaggedStruct('ResizingPanel', {
  panelFrame: PanelFrame,
  pointerX: S.Number,
  pointerY: S.Number,
})
const PanelInteraction = S.Union([
  IdlePanelInteraction,
  DraggingPanel,
  ResizingPanel,
])
type PanelInteraction = typeof PanelInteraction.Type

const PANEL_MARGIN = 12
const DEFAULT_PANEL_WIDTH = 480
const DEFAULT_PANEL_HEIGHT = 680
const MIN_PANEL_WIDTH = 300
const MIN_PANEL_HEIGHT = 280

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum)

const fitPanelFrame = (
  panelFrame: PanelFrame,
  viewportWidth: number,
  viewportHeight: number,
): PanelFrame => {
  const maximumWidth = Math.max(1, viewportWidth - PANEL_MARGIN * 2)
  const maximumHeight = Math.max(1, viewportHeight - PANEL_MARGIN * 2)
  const minimumWidth = Math.min(MIN_PANEL_WIDTH, maximumWidth)
  const minimumHeight = Math.min(MIN_PANEL_HEIGHT, maximumHeight)
  const nextWidth = clamp(panelFrame.width, minimumWidth, maximumWidth)
  const nextHeight = clamp(panelFrame.height, minimumHeight, maximumHeight)
  return PanelFrame.make({
    height: nextHeight,
    width: nextWidth,
    x: clamp(
      panelFrame.x,
      PANEL_MARGIN,
      Math.max(PANEL_MARGIN, viewportWidth - nextWidth - PANEL_MARGIN),
    ),
    y: clamp(
      panelFrame.y,
      PANEL_MARGIN,
      Math.max(PANEL_MARGIN, viewportHeight - nextHeight - PANEL_MARGIN),
    ),
  })
}

const initialPanelFrame = (): PanelFrame => {
  const width = Math.min(
    DEFAULT_PANEL_WIDTH,
    window.innerWidth - PANEL_MARGIN * 2,
  )
  const height = Math.min(
    DEFAULT_PANEL_HEIGHT,
    window.innerHeight - PANEL_MARGIN * 2,
  )
  return fitPanelFrame(
    PanelFrame.make({
      height,
      width,
      x: window.innerWidth - width - PANEL_MARGIN,
      y: PANEL_MARGIN,
    }),
    window.innerWidth,
    window.innerHeight,
  )
}

const frameForPointer = (
  interaction: Exclude<PanelInteraction, typeof IdlePanelInteraction.Type>,
  clientX: number,
  clientY: number,
): PanelFrame => {
  const deltaX = clientX - interaction.pointerX
  const deltaY = clientY - interaction.pointerY
  return M.value(interaction).pipe(
    M.withReturnType<PanelFrame>(),
    M.tagsExhaustive({
      DraggingPanel: ({ panelFrame }) =>
        fitPanelFrame(
          PanelFrame.make({
            ...panelFrame,
            x: panelFrame.x + deltaX,
            y: panelFrame.y + deltaY,
          }),
          window.innerWidth,
          window.innerHeight,
        ),
      ResizingPanel: ({ panelFrame }) =>
        fitPanelFrame(
          PanelFrame.make({
            ...panelFrame,
            height: panelFrame.height + deltaY,
            width: panelFrame.width + deltaX,
          }),
          window.innerWidth,
          window.innerHeight,
        ),
    }),
  )
}

const panelStyle = (panelFrame: PanelFrame): CSSProperties => ({
  height: panelFrame.height,
  left: panelFrame.x,
  top: panelFrame.y,
  width: panelFrame.width,
})

/** Renders the replay workbench through domain-shaped React hooks. */
export const App = () => {
  const model = useReplayabilityModel()
  const actions = useReplayabilityActions()
  const [panelFrame, setPanelFrame] = useState(initialPanelFrame)
  const [panelInteraction, setPanelInteraction] = useState<PanelInteraction>(
    IdlePanelInteraction.make({}),
  )
  const replayUri =
    Workbench.isReady(model) && model.replaySaveStatus._tag === 'SavedReplay'
      ? model.replaySaveStatus.uri
      : undefined

  useEffect(() => {
    if (replayUri !== undefined) {
      globalThis.history.replaceState(null, '', replayUri)
    }
  }, [replayUri])

  useEffect(() => {
    const resizedViewport = () => {
      setPanelFrame(currentPanelFrame =>
        fitPanelFrame(currentPanelFrame, window.innerWidth, window.innerHeight),
      )
    }
    window.addEventListener('resize', resizedViewport)
    return () => window.removeEventListener('resize', resizedViewport)
  }, [])

  useEffect(() => {
    if (panelInteraction._tag === 'IdlePanelInteraction') {
      return
    }

    const movedPointer = (event: PointerEvent) => {
      setPanelFrame(
        frameForPointer(panelInteraction, event.clientX, event.clientY),
      )
    }
    const releasedPointer = () => {
      setPanelInteraction(IdlePanelInteraction.make({}))
    }
    const previousUserSelect = document.documentElement.style.userSelect
    document.documentElement.style.userSelect = 'none'
    window.addEventListener('pointermove', movedPointer)
    window.addEventListener('pointerup', releasedPointer)
    window.addEventListener('pointercancel', releasedPointer)
    return () => {
      document.documentElement.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', movedPointer)
      window.removeEventListener('pointerup', releasedPointer)
      window.removeEventListener('pointercancel', releasedPointer)
    }
  }, [panelInteraction])

  if (!Workbench.isReady(model)) {
    return <ReplayStatus model={model} />
  }

  const startedPanelInteraction = (
    kind: 'Drag' | 'Resize',
    event: ReactPointerEvent,
  ) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    const interaction = M.value(kind).pipe(
      M.withReturnType<PanelInteraction>(),
      M.when('Drag', () =>
        DraggingPanel.make({
          panelFrame,
          pointerX: event.clientX,
          pointerY: event.clientY,
        }),
      ),
      M.when('Resize', () =>
        ResizingPanel.make({
          panelFrame,
          pointerX: event.clientX,
          pointerY: event.clientY,
        }),
      ),
      M.exhaustive,
    )
    setPanelInteraction(interaction)
  }

  const availableActions = ReplayPresentation.actionsForModel(model)
  const transitions = ReplayPresentation.transitionsForModel(model)
  const title = Workbench.titleForModel(model)
  const error = Workbench.errorForModel(model)

  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-50 sm:p-8">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl place-items-center rounded-[2rem] border border-white/10 bg-zinc-900/80 p-6 text-center shadow-2xl sm:p-12">
        <div>
          <p className="mb-3 font-mono text-sm uppercase tracking-[0.2em] text-emerald-300">
            {model.controllerMode} | {Workbench.modeForModel(model)}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-200">
            Replay {title}
          </h1>
          <div
            className={
              model._tag === 'Fact'
                ? 'mx-auto mt-8 max-w-4xl text-3xl font-semibold leading-tight md:text-5xl'
                : 'mt-8 text-6xl font-semibold tabular-nums md:text-8xl'
            }
          >
            {Workbench.displayForModel(model)}
          </div>
          <p className="mx-auto mt-5 max-w-2xl text-zinc-400">
            {Workbench.detailForModel(model)}
          </p>
          <p className="mx-auto mt-8 max-w-xl text-sm text-zinc-500">
            The Program owns every valid Message and replay transition. Move the
            inspector wherever it stays out of your way.
          </p>
        </div>
      </section>

      <aside
        aria-label="Replay controls"
        className="fixed z-50 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/15 bg-zinc-900/95 text-left shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur"
        style={panelStyle(panelFrame)}
      >
        <header
          className="flex touch-none cursor-grab items-center justify-between border-b border-white/10 bg-zinc-800/90 px-4 py-3 active:cursor-grabbing"
          onPointerDown={event => startedPanelInteraction('Drag', event)}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Replay inspector</p>
            <p className="text-xs text-zinc-400">Drag to move</p>
          </div>
          <span aria-hidden="true" className="text-lg text-zinc-500">
            ⠿
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <div className="flex flex-wrap gap-2">
            {programIds.map(programId => (
              <button
                className={programButtonClassName(model, programId)}
                key={programId}
                onClick={() => actions.selectedReplayProgram(programId)}
                type="button"
              >
                {programId}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <a className={linkButtonClassName} href={model.stateUri}>
              open state
            </a>
            <button
              className={linkButtonClassName}
              disabled={model.replaySaveStatus._tag === 'SavingReplay'}
              onClick={actions.clickedSaveReplay}
              type="button"
            >
              {model.replaySaveStatus._tag === 'SavingReplay'
                ? 'saving tape…'
                : 'save tape'}
            </button>
            {model.replaySaveStatus._tag === 'SavedReplay' ? (
              <>
                <a
                  className={linkButtonClassName}
                  href={model.replaySaveStatus.uri}
                >
                  paused link
                </a>
                <a
                  className={linkButtonClassName}
                  href={model.replaySaveStatus.autoplayUri}
                >
                  autoplay link
                </a>
              </>
            ) : null}
          </div>
          {model.replaySaveStatus._tag === 'FailedSavingReplay' ? (
            <p className="mt-2 text-sm text-red-300">
              {model.replaySaveStatus.reason}
            </p>
          ) : null}

          {error === undefined ? null : (
            <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">
              {error}
            </p>
          )}

          <section className="mt-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">Valid Messages</h2>
              <span className="text-xs text-zinc-500">this frame only</span>
            </div>
            <div
              className={
                model._tag === 'Calculator'
                  ? calculatorKeypadClassName
                  : genericPickerGridClassName
              }
            >
              {availableActions.map(action => (
                <button
                  className={buttonClassNameForAction(action.id)}
                  key={action.id}
                  onClick={() => actions.pressedReplayAction(action.id)}
                  type="button"
                >
                  <span>{action.label}</span>
                  {model._tag === 'Counters' ? (
                    <code className="block text-[10px] opacity-55">
                      {action.id}
                    </code>
                  ) : null}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-5 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Timeline</h2>
                <p className="text-xs text-zinc-400">
                  Frame {model.currentFrame.toString()} of{' '}
                  {model.finalFrame.toString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className={controlButtonClassName}
                  disabled={model.currentFrame <= 0}
                  onClick={actions.clickedStepBackward}
                  type="button"
                >
                  back
                </button>
                <button
                  className={controlButtonClassName}
                  onClick={actions.clickedPlayback}
                  type="button"
                >
                  {model.playback === 'Playing' ? 'pause' : 'play'}
                </button>
                <button
                  className={controlButtonClassName}
                  disabled={model.currentFrame >= model.finalFrame}
                  onClick={actions.clickedStepForward}
                  type="button"
                >
                  next
                </button>
              </div>
            </div>
            <input
              className="mt-4 w-full touch-manipulation accent-emerald-400"
              max={model.finalFrame}
              min={0}
              onChange={event =>
                actions.changedReplayFrame(
                  globalThis.Number.parseInt(event.target.value, 10),
                )
              }
              type="range"
              value={model.currentFrame}
            />
          </section>

          <section className="mt-5 border-t border-white/10 pt-4">
            <h2 className="mb-3 font-semibold">Recorded Messages</h2>
            <ol className="grid gap-2">
              {transitions.map(transition => {
                const isFuture = transition.sequence > model.currentFrame
                const isSelected = transition.sequence === model.currentFrame
                return (
                  <li key={transition.sequence}>
                    <button
                      className={transitionButtonClassName(isSelected)}
                      data-future={isFuture ? 'true' : 'false'}
                      onClick={() =>
                        actions.changedReplayFrame(transition.sequence)
                      }
                      type="button"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-zinc-500">
                          {transition.sequence.toString().padStart(2, '0')}
                        </span>
                        <strong className="min-w-0 truncate font-medium">
                          {transition.messageName}
                        </strong>
                        <span className="ml-auto shrink-0 text-xs text-zinc-500">
                          {transition.sourceName}
                        </span>
                      </span>
                      <span className="mt-2 block min-w-0 truncate text-xs text-sky-200/80">
                        payload {transition.messagePayload}
                      </span>
                      <span className="mt-2 grid min-w-0 gap-1 text-[11px] text-zinc-400">
                        <span className="flex min-w-0 gap-2">
                          <span className="w-12 shrink-0 text-zinc-600">
                            before
                          </span>
                          <code
                            className="min-w-0 truncate"
                            title={transition.previousModel}
                          >
                            {transition.previousModel}
                          </code>
                        </span>
                        <span className="flex min-w-0 gap-2">
                          <span className="w-12 shrink-0 text-emerald-500/70">
                            after
                          </span>
                          <code
                            className="min-w-0 truncate"
                            title={transition.nextModel}
                          >
                            {transition.nextModel}
                          </code>
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>

        <button
          aria-label="Resize replay inspector"
          className="absolute bottom-0 right-0 h-8 w-8 touch-none cursor-nwse-resize bg-transparent text-zinc-500"
          onPointerDown={event => startedPanelInteraction('Resize', event)}
          type="button"
        >
          <span aria-hidden="true" className="absolute bottom-1 right-2">
            ◢
          </span>
        </button>
      </aside>
    </main>
  )
}

const ReplayStatus = ({ model }: Readonly<{ model: Workbench.Model }>) => (
  <main className="grid min-h-screen place-items-center bg-zinc-950 p-6 text-zinc-50">
    <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-zinc-900 p-8 text-center shadow-2xl">
      <p className="text-sm uppercase tracking-[0.22em] text-emerald-300">
        React host | shared Program runtime
      </p>
      <h1 className="mt-4 text-3xl font-semibold">
        {Workbench.displayForModel(model)}
      </h1>
      <p className="mt-3 text-zinc-400">{Workbench.detailForModel(model)}</p>
    </section>
  </main>
)

const programIds: ReadonlyArray<ReplayProgramId> = [
  'Counters',
  'Counter',
  'Calculator',
  'Fact',
]

const programButtonClassName = (
  model: Workbench.ReadyModel,
  programId: ReplayProgramId,
): string =>
  model._tag === programId
    ? selectedExampleButtonClassName
    : controlButtonClassName

const buttonClassNameForAction = (actionId: string): string => {
  if (actionId.startsWith('operation-') || actionId === 'equals') {
    return calculatorOperationButtonClassName
  } else if (
    actionId === 'backspace' ||
    actionId === 'clear' ||
    actionId === 'percent'
  ) {
    return calculatorUtilityButtonClassName
  } else if (
    actionId.startsWith('digit-') ||
    actionId === 'decimal' ||
    actionId === 'sign'
  ) {
    return calculatorNumberButtonClassName
  } else {
    return genericPickerButtonClassName
  }
}

const transitionButtonClassName = (isSelected: boolean): string =>
  isSelected ? selectedActionButtonClassName : actionButtonClassName

const controlButtonClassName =
  'touch-manipulation select-none rounded-xl border border-white/10 bg-zinc-800 px-3 py-2 text-sm transition enabled:hover:bg-zinc-700 disabled:opacity-40'
const selectedExampleButtonClassName =
  'touch-manipulation select-none rounded-xl border border-emerald-400 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100'
const linkButtonClassName =
  'touch-manipulation select-none rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20'
const actionButtonClassName =
  'block w-full touch-manipulation select-none overflow-hidden rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-left font-mono text-sm text-zinc-300 transition hover:bg-zinc-800 data-[future=true]:opacity-35'
const selectedActionButtonClassName =
  'block w-full touch-manipulation select-none overflow-hidden rounded-xl border border-emerald-400 bg-emerald-400/10 px-3 py-3 text-left font-mono text-sm text-emerald-100 transition'
const genericPickerGridClassName = 'mt-3 grid grid-cols-2 gap-2'
const genericPickerButtonClassName =
  'touch-manipulation select-none rounded-xl border border-white/10 bg-zinc-800 px-3 py-2 text-left text-sm transition hover:bg-zinc-700'
const calculatorKeypadClassName = 'mt-4 grid grid-cols-4 gap-2'
const calculatorBaseButtonClassName =
  'aspect-square touch-manipulation select-none rounded-full text-xl font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
const calculatorNumberButtonClassName = `${calculatorBaseButtonClassName} bg-zinc-800 text-white hover:bg-zinc-700`
const calculatorOperationButtonClassName = `${calculatorBaseButtonClassName} bg-orange-500 text-white hover:bg-orange-400`
const calculatorUtilityButtonClassName = `${calculatorBaseButtonClassName} bg-zinc-500 text-white hover:bg-zinc-400`
