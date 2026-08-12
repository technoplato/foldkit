import { type Destination, destinationForModel } from 'counters-core-example'
import {
  MultipleCountersProvider,
  useMultipleCountersModel,
  useMultipleCountersResolutionError,
} from 'pis-canvas-lab-react-bindings-example'
import { Match as M, Option, Schema as S } from 'effect'
import { type ReactNode } from 'react'

import { ReactAPresentation } from './reactA.js'
import { ReactBPresentation } from './reactB.js'
import { FoldkitCanvas } from './FoldkitCanvas.js'
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

/** Runs the selected React host from one canonical Program destination URI. */
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
    <MultipleCountersScreen presenter={presenter} />
  </MultipleCountersProvider>
)

const LoadingScreen = () => (
  <main className="grid min-h-screen place-items-center bg-stone-950 text-stone-400">
    Starting Multiple Counters…
  </main>
)

const MultipleCountersScreen = ({ presenter }: { presenter: Presenter }) => {
  const model = useMultipleCountersModel()
  const maybeResolutionError = useMultipleCountersResolutionError()
  const destination = destinationForModel(model)
  const isReplayControlInPresentation = replayControlIsInPresentation(
    destination,
    presenter,
  )
  useNavigationHistory(model)

  return (
    <main className="min-h-screen bg-stone-950 px-5 py-10 text-stone-100">
      <section className="mx-auto grid w-full max-w-6xl gap-8 pb-36">
        <header className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-amber-400">
            PIS canvas · Foldkit-driven multi-counters
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            Counters on the map
          </h1>
          <p className="max-w-2xl text-stone-400">
            Atomic UI tree (VStack / HStack / Text / Button) → AsciiSurface
            layout → phones. Foldkit Model drives the tree; hotspots come from
            layout boxes. Non-captive CLI:{' '}
            <code className="text-amber-200/90">pnpm cli:dump</code> in this
            package.
          </p>
        </header>

        {Option.isSome(maybeResolutionError) ? (
          <output
            aria-live="assertive"
            className="text-sm text-red-300"
            role="alert"
          >
            {maybeResolutionError.value._tag}
          </output>
        ) : null}

        <FoldkitCanvas />

        <details className="rounded-xl border border-stone-800 bg-stone-900/50 p-4">
          <summary className="cursor-pointer text-sm text-stone-300">
            Classic counters UI (same Program · {presenter})
          </summary>
          <div className="mt-4 grid max-w-3xl gap-6">
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
        </details>
      </section>
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
