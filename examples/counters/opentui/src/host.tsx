import {
  type CounterDetailMode,
  type CounterFactStatus,
  type Destination,
  type Navigation,
  destinationForModel,
  interactionsForModel,
} from 'counters-core-example'
import {
  MultipleCountersProvider,
  useMultipleCountersActions,
  useMultipleCountersModel,
  useMultipleCountersReplay,
} from 'counters-react-bindings-example'
import { Array, Match as M, Option } from 'effect'
import { type ReactNode } from 'react'

import { type CliRenderer, type SelectOption } from '@opentui/core'
import { useKeyboard } from '@opentui/react'

const HEADER_HEIGHT = 6
const BOX_VERTICAL_CHROME = 3
const DETAIL_HEIGHT = 6

/** Runs Multiple Counters through the OpenTUI React reconciler. */
export const App = ({
  initialNavigation,
  renderer,
}: Readonly<{
  initialNavigation: Navigation
  renderer: CliRenderer
}>) => (
  <MultipleCountersProvider
    fallback={<text fg="#a8a29e">Starting Multiple Counters…</text>}
    flags={initialNavigation}
  >
    <MultipleCountersTerminal renderer={renderer} />
  </MultipleCountersProvider>
)

const MultipleCountersTerminal = ({
  renderer,
}: Readonly<{ renderer: CliRenderer }>) => {
  const model = useMultipleCountersModel()
  const actions = useMultipleCountersActions()
  const replay = useMultipleCountersReplay()
  const destination = destinationForModel(model)
  const interactions = interactionsForModel(model)
  const options: Array<SelectOption> = Array.map(interactions, interaction => ({
    name: interaction.label,
    description: `${interaction.token} | ${interaction.message._tag}`,
  }))
  const replayInstruction = (): string => {
    if (Option.isSome(replay.maybeError)) {
      return replay.maybeError.value
    }
    if (!replay.isBranchable) {
      return 'This frame is inspection-only until its Command result arrives.'
    }
    return 'Left/right replay. i inspects. Enter sends the selected Message. q quits.'
  }

  useKeyboard(key => {
    if (key.name === 'q') {
      renderer.destroy()
    } else if (key.name === 'left') {
      replay.stepBackward()
    } else if (key.name === 'right') {
      replay.stepForward()
    } else if (key.name === 'i') {
      replay.inspect()
    }
  })

  const selectedInteraction = (index: number) => {
    const maybeInteraction = Array.get(interactions, index)
    if (Option.isSome(maybeInteraction)) {
      actions.performed(maybeInteraction.value)
    }
  }

  return (
    <box
      backgroundColor="#0c0a09"
      flexDirection="column"
      gap={1}
      padding={1}
      width="100%"
      height="100%"
    >
      <box
        border
        borderColor="#fbbf24"
        flexDirection="column"
        height={HEADER_HEIGHT}
        padding={1}
        title="Foldkit Multiple Counters | OpenTUI React"
      >
        <text
          content="One Model. One Message path. One tape."
          fg="#fbbf24"
          height={1}
        />
        <text
          content={`Replay ${replay.mode} | frame ${replay.frame.toString()} of ${replay.finalFrame.toString()} | ${replay.isBranchable ? 'settled' : 'unsettled'}`}
          fg="#a8a29e"
          height={1}
        />
        <text content={replayInstruction()} fg="#78716c" height={1} />
      </box>

      <DestinationView destination={destination} />

      <box
        border
        borderColor="#57534e"
        flexDirection="column"
        flexGrow={1}
        minHeight={8}
        padding={1}
        title="Valid Messages in this state"
      >
        <select
          focused
          height="100%"
          onSelect={selectedInteraction}
          options={options}
          selectedBackgroundColor="#44403c"
          selectedTextColor="#fbbf24"
          showScrollIndicator
          wrapSelection
        />
      </box>
    </box>
  )
}

const DestinationView = ({ destination }: { destination: Destination }) =>
  M.value(destination).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      CounterListDestination: ({ counters }) => (
        <box
          border
          borderColor="#57534e"
          flexDirection="column"
          height={counters.length + BOX_VERTICAL_CHROME}
          padding={1}
          title="CounterList"
        >
          {Array.map(counters, counter => (
            <text
              content={`${counter.id}  ${counter.counter.count.toString()}`}
              height={1}
              key={counter.id}
            />
          ))}
        </box>
      ),
      CounterDetailDestination: ({ counter, maybeMode }) => (
        <box
          border
          borderColor="#57534e"
          flexDirection="column"
          height={DETAIL_HEIGHT}
          padding={1}
          title={`CounterDetail | ${counter.id}`}
        >
          <text
            content={counter.counter.count.toString()}
            fg="#fbbf24"
            height={1}
          />
          {Option.isSome(maybeMode) ? (
            <DetailModeView counterId={counter.id} mode={maybeMode.value} />
          ) : (
            <text content="No presentation mode" fg="#78716c" height={1} />
          )}
        </box>
      ),
    }),
  )

const DetailModeView = ({
  counterId,
  mode,
}: Readonly<{ counterId: string; mode: CounterDetailMode }>) =>
  M.value(mode).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      CounterFactAlert: ({ status }) => (
        <box flexDirection="column">
          <text content="CounterFactAlert" fg="#7dd3fc" height={1} />
          <FactStatusView status={status} />
        </box>
      ),
      DeleteCounterConfirmation: () => (
        <box flexDirection="column">
          <text content="DeleteCounterConfirmation" fg="#fca5a5" height={1} />
          <text
            content={`Delete ${counterId}? Select Cancel or Delete counter below.`}
            height={1}
          />
        </box>
      ),
    }),
  )

const FactStatusView = ({ status }: { status: CounterFactStatus }) =>
  M.value(status).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      LoadingCounterFact: () => (
        <text content="Loading counter fact…" height={1} />
      ),
      LoadedCounterFact: ({ fact }) => <text content={fact.text} height={1} />,
      FailedCounterFact: ({ reason }) => <text content={reason} height={1} />,
    }),
  )
