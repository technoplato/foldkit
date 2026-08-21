import { type Destination, destinationForModel } from 'counters-core-example'
import { Match as M, Option, Schema as S } from 'effect'
import {
  MultipleCountersProvider,
  useMultipleCountersModel,
  useMultipleCountersResolutionError,
} from 'pis-canvas-lab-react-bindings-example'
import { type ReactNode } from 'react'

import { FoldkitCanvas } from './FoldkitCanvas.js'
import { ReactAPresentation } from './reactA.js'
import { ReactBPresentation } from './reactB.js'
import {
  CounterDetailView,
  CounterListView,
  ReplayControls,
  useNavigationHistory,
} from './view.js'

/** The two React presentation adapters included in this comparison. */
export const Presenter = S.Literals(['ReactA', 'ReactB'])
/** The two React presentation adapters included in this comparison. */
export type Presenter = typeof Presenter.Type

/** Full-viewport PIS map host — Foldkit composed catalog. */
export const App = ({
  initialDestinationUri,
  presenter,
}: Readonly<{
  initialDestinationUri: string
  presenter: Presenter
}>) => (
  <MultipleCountersProvider
    fallback={<LoadingScreen />}
    initialDestinationUri={initialDestinationUri}
  >
    <LabScreen presenter={presenter} />
  </MultipleCountersProvider>
)

const LoadingScreen = () => (
  <main className="grid min-h-dvh place-items-center bg-stone-950 text-stone-400">
    Starting PIS lab…
  </main>
)

const LabScreen = ({ presenter }: { presenter: Presenter }) => {
  const model = useMultipleCountersModel()
  const maybeResolutionError = useMultipleCountersResolutionError()
  const destination = destinationForModel(model)
  const isReplayControlInPresentation = replayControlIsInPresentation(
    destination,
    presenter,
  )
  useNavigationHistory(model)

  return (
    <main className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-stone-950 text-stone-100">
      {Option.isSome(maybeResolutionError) ? (
        <output
          aria-live="assertive"
          className="shrink-0 border-b border-red-900 bg-red-950/80 px-3 py-1 text-sm text-red-300"
          role="alert"
        >
          {maybeResolutionError.value._tag}
        </output>
      ) : null}

      {/* Canvas fills the viewport (PIS AppShell shape) */}
      <FoldkitCanvas />

      {/* Classic UI tucked away — same Program */}
      <details className="shrink-0 border-t border-stone-800 bg-stone-950/95">
        <summary className="cursor-pointer px-3 py-2 text-xs text-stone-400 hover:text-stone-200">
          Classic multi-counters UI · {presenter}
        </summary>
        <div className="max-h-[40vh] overflow-auto border-t border-stone-900 px-4 py-4">
          <div className="mx-auto grid max-w-3xl gap-4">
            <nav aria-label="React presenter" className="flex gap-2 text-sm">
              <PresenterLink
                presenter="ReactA"
                selected={presenter === 'ReactA'}
              >
                React-A
              </PresenterLink>
              <PresenterLink
                presenter="ReactB"
                selected={presenter === 'ReactB'}
              >
                React-B
              </PresenterLink>
            </nav>
            <DestinationView destination={destination} presenter={presenter} />
          </div>
        </div>
      </details>
      {isReplayControlInPresentation ? null : <ReplayControls />}
    </main>
  )
}

const PresenterLink = ({
  children,
  presenter,
  selected,
}: Readonly<{
  children: ReactNode
  presenter: Presenter
  selected: boolean
}>) => {
  const query = presenter === 'ReactA' ? 'a' : 'b'
  return (
    <a
      aria-current={selected ? 'page' : undefined}
      className={
        selected
          ? 'rounded-full bg-amber-400 px-3 py-1.5 font-medium text-stone-950'
          : 'rounded-full border border-stone-700 px-3 py-1.5 text-stone-300 hover:border-stone-500'
      }
      href={`${window.location.pathname}?presenter=${query}`}
    >
      {children}
    </a>
  )
}

const DestinationView = ({
  destination,
  presenter,
}: Readonly<{ destination: Destination; presenter: Presenter }>) =>
  M.value(destination).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      CounterListDestination: ({ counters }) => (
        <CounterListView counters={counters} />
      ),
      CounterDetailDestination: ({ counter, maybeMode }) => (
        <>
          <CounterDetailView counter={counter} />
          {Option.isSome(maybeMode) ? (
            <Presentation
              counterId={counter.id}
              mode={maybeMode.value}
              presenter={presenter}
            />
          ) : null}
        </>
      ),
    }),
  )

const Presentation = ({
  counterId,
  mode,
  presenter,
}: Readonly<{
  counterId: string
  mode: import('counters-core-example').CounterDetailMode
  presenter: Presenter
}>) =>
  M.value(presenter).pipe(
    M.withReturnType<ReactNode>(),
    M.when('ReactA', () => (
      <ReactAPresentation counterId={counterId} mode={mode} />
    )),
    M.when('ReactB', () => (
      <ReactBPresentation counterId={counterId} mode={mode} />
    )),
    M.exhaustive,
  )

const replayControlIsInPresentation = (
  destination: Destination,
  presenter: Presenter,
): boolean => {
  if (presenter === 'ReactA') {
    return false
  }
  return M.value(destination).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      CounterListDestination: () => false,
      CounterDetailDestination: ({ maybeMode }) => {
        if (Option.isNone(maybeMode)) {
          return false
        }
        return M.value(maybeMode.value).pipe(
          M.withReturnType<boolean>(),
          M.tagsExhaustive({
            CounterFactAlert: () => false,
            DeleteCounterConfirmation: () => true,
          }),
        )
      },
    }),
  )
}
