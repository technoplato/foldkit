import { Array, Match as M, Option } from 'effect'
import { Program } from 'foldkit'
import {
  type Destination,
  type Navigation,
  destinationForModel,
  interactionsForModel,
  modelForNavigation,
} from 'issues-core-example'
import { StaticIssueTrackerClient } from 'issues-react-bindings-example'
import { type ReactNode } from 'react'

import { type CliRenderer, type SelectOption } from '@opentui/core'
import { useKeyboard } from '@opentui/react'

/** Runs the shared Issue Tracker Program through OpenTUI's React reconciler. */
export const App = ({
  initialNavigation,
  renderer,
}: Readonly<{
  initialNavigation: Navigation
  renderer: CliRenderer
}>) => (
  <StaticIssueTrackerClient.Provider
    fallback={<text fg="#a8a29e">Starting Issue Tracker…</text>}
    initialRoute={Program.state(modelForNavigation(initialNavigation))}
  >
    <IssueTrackerTerminal renderer={renderer} />
  </StaticIssueTrackerClient.Provider>
)

const IssueTrackerTerminal = ({ renderer }: { renderer: CliRenderer }) => {
  const model = StaticIssueTrackerClient.useModel()
  const actions = StaticIssueTrackerClient.useActions()
  const replay = StaticIssueTrackerClient.useReplay()
  const interactions = interactionsForModel(model)
  const options: Array<SelectOption> = Array.map(interactions, interaction => ({
    description: `${interaction.token} | ${interaction.message._tag}`,
    name: interaction.label,
  }))

  useKeyboard(key => {
    if (key.name === 'q') renderer.destroy()
    else if (key.name === 'left') replay.stepBackward()
    else if (key.name === 'right') replay.stepForward()
    else if (key.name === 'i') replay.inspect()
  })

  const selectedInteraction = (index: number) => {
    const candidate = Array.get(interactions, index)
    if (Option.isSome(candidate)) actions.performed(candidate.value)
  }

  return (
    <box
      backgroundColor="#0c0a09"
      flexDirection="column"
      gap={1}
      height="100%"
      padding={1}
      width="100%"
    >
      <box border borderColor="#fbbf24" flexDirection="column" padding={1}>
        <text content="Foldkit Issue Tracker | OpenTUI React" fg="#fbbf24" />
        <text
          content={`Replay ${replay.mode} | frame ${replay.frame.toString()} of ${replay.finalFrame.toString()}`}
          fg="#a8a29e"
        />
        <text content="Left/right replay · i inspect · q quit" fg="#78716c" />
      </box>
      <DestinationView destination={destinationForModel(model)} />
      <box border borderColor="#57534e" flexGrow={1} padding={1}>
        <select
          focused
          height="100%"
          onSelect={selectedInteraction}
          options={options}
          selectedBackgroundColor="#44403c"
          selectedTextColor="#fbbf24"
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
      IssueListDestination: ({ state }) => (
        <box border borderColor="#57534e" flexDirection="column" padding={1}>
          <text content="Issues" fg="#fbbf24" />
          {state._tag === 'LoadedIssues' ? (
            Array.map(state.issues, issue => (
              <text
                content={`${issue.id}  ${issue.priority}  ${issue.title}  [${issue.product.name}]`}
                key={issue.id}
              />
            ))
          ) : (
            <text content={state._tag} fg="#a8a29e" />
          )}
        </box>
      ),
      IssueDetailDestination: ({ issueId, state }) => (
        <box border borderColor="#57534e" flexDirection="column" padding={1}>
          <text content={issueId} fg="#fbbf24" />
          {state._tag === 'LoadedIssue' && Option.isSome(state.issue) ? (
            <>
              <text content={state.issue.value.title} />
              <text content={state.issue.value.details} fg="#a8a29e" />
            </>
          ) : (
            <text content={state._tag} fg="#a8a29e" />
          )}
        </box>
      ),
      FileIssueDestination: ({ draft, draftState }) => (
        <box border borderColor="#57534e" flexDirection="column" padding={1}>
          <text content="File issue" fg="#fbbf24" />
          <text content={`Title: ${draft.title}`} />
          <text content={`Product: ${draft.productId}`} />
          <text content={`Priority: ${draft.priority}`} />
          <text content={draftState._tag} fg="#a8a29e" />
        </box>
      ),
      TriageInboxDestination: () => (
        <box border borderColor="#57534e" flexDirection="column" padding={1}>
          <text content="Triage inbox" fg="#fbbf24" />
          <text content="Draft transcript candidates await promotion." />
        </box>
      ),
    }),
  )
