import { type Destination, destinationForModel } from 'counters-core-example'
import {
  type MultipleCountersHost,
  MultipleCountersProvider,
  useMultipleCountersInstantTape,
  useMultipleCountersModel,
  useMultipleCountersResolutionError,
} from 'counters-react-bindings-example'
import { Match as M, Option, Schema as S } from 'effect'
import { type ReactNode, useEffect, useState } from 'react'

import { startReactCountersHost } from './instantHost.js'
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

/** Runs the selected React host from one canonical Program destination URI. */
export const App = ({
  initialDestinationUri,
  presenter,
}: Readonly<{
  initialDestinationUri: string
  presenter: Presenter
}>) => {
  const instantAppId = import.meta.env.VITE_INSTANT_APP_ID
  if (typeof instantAppId === 'string' && instantAppId !== '') {
    return (
      <InstantCountersApp
        appId={instantAppId}
        initialDestinationUri={initialDestinationUri}
        presenter={presenter}
      />
    )
  }
  return (
    <MultipleCountersProvider
      fallback={<LoadingScreen />}
      initialDestinationUri={initialDestinationUri}
    >
      <MultipleCountersScreen presenter={presenter} />
    </MultipleCountersProvider>
  )
}

const InstantCountersApp = ({
  appId,
  initialDestinationUri,
  presenter,
}: Readonly<{
  appId: string
  initialDestinationUri: string
  presenter: Presenter
}>) => {
  const [host, setHost] = useState<MultipleCountersHost | null>(null)
  useEffect(() => startReactCountersHost(appId, setHost), [appId])
  if (host === null) {
    return <LoadingScreen />
  }
  return (
    <MultipleCountersProvider
      fallback={<LoadingScreen />}
      host={host}
      initialDestinationUri={initialDestinationUri}
    >
      <MultipleCountersScreen presenter={presenter} />
    </MultipleCountersProvider>
  )
}

const LoadingScreen = () => (
  <main className="grid min-h-screen place-items-center bg-stone-950 text-stone-400">
    Starting Multiple Counters…
  </main>
)

const MultipleCountersScreen = ({ presenter }: { presenter: Presenter }) => {
  const model = useMultipleCountersModel()
  const maybeResolutionError = useMultipleCountersResolutionError()
  const destination = destinationForModel(model)
  const isInstantTape = useMultipleCountersInstantTape()
  const isReplayControlInPresentation =
    isInstantTape || replayControlIsInPresentation(destination, presenter)
  useNavigationHistory(model)

  return (
    <main className="min-h-screen bg-stone-950 px-5 py-12 text-stone-100">
      <section className="mx-auto grid w-full max-w-3xl gap-8 pb-36">
        <header className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-amber-400">
            Foldkit Program | {presenter}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            Multiple counters
          </h1>
          <p className="max-w-2xl text-stone-400">
            The buttons, navigation, presentation, side effects, and replay
            branch all run through one Model and one ReplayController.
          </p>
          <nav aria-label="React presenter" className="flex gap-2 text-sm">
            <PresenterLink presenter="ReactA" selected={presenter === 'ReactA'}>
              React-A | unified modal
            </PresenterLink>
            <PresenterLink presenter="ReactB" selected={presenter === 'ReactB'}>
              React-B | semantic surfaces
            </PresenterLink>
          </nav>
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

        <DestinationView destination={destination} presenter={presenter} />
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
