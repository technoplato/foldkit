import { Array, Match as M, Option, Schema as S } from 'effect'
import { Program } from 'foldkit'
import {
  type Destination,
  FileIssueDestination,
  type IssueDetailState,
  type IssuesState,
  destinationForModel,
  modelForNavigation,
  navigationToPath,
  pathToNavigation,
} from 'issues-core-example'
import { type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { useProgramNavigationHistory } from 'shared-react-bindings-example'

import { IssuePriority } from '@foldkit/instant-tools/issues'

import { IssueTrackerClient } from './client.js'

const priorities: ReadonlyArray<typeof IssuePriority.Type> = [
  'P0',
  'P1',
  'P2',
  'P3',
  'P4',
]

/** Runs the React Client from the current portable URL. */
export const App = () => (
  <IssueTrackerClient.Provider
    fallback={<p className="loading">Starting Issue Tracker…</p>}
    initialRoute={Program.state(
      modelForNavigation(pathToNavigation(window.location.href)),
    )}
  >
    <IssueTrackerScreen />
  </IssueTrackerClient.Provider>
)

const IssueTrackerScreen = () => {
  const model = IssueTrackerClient.useModel()
  const actions = IssueTrackerClient.useActions()
  useProgramNavigationHistory({
    navigation: model.navigation,
    openedNavigation: actions.openedNavigation,
    parseNavigation: pathToNavigation,
    printNavigation: navigationToPath,
  })
  return (
    <main>
      <header>
        <p className="eyebrow">Foldkit Program | React Client</p>
        <h1>Issues</h1>
        <p className="lede">
          Live Applications, Libraries, Issues, and transcript-backed triage.
        </p>
      </header>
      <DestinationView destination={destinationForModel(model)} />
    </main>
  )
}

const DestinationView = ({ destination }: { destination: Destination }) =>
  M.value(destination).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      IssueListDestination: ({ state }) => <IssueList state={state} />,
      IssueDetailDestination: ({ state }) => <IssueDetail state={state} />,
      FileIssueDestination: props => <FileIssue {...props} />,
      TriageInboxDestination: ({ state }) => <TriageInbox state={state} />,
    }),
  )

const NavButtons = () => {
  const actions = IssueTrackerClient.useActions()
  return (
    <nav aria-label="Issue actions">
      <button onClick={actions.clickedFileIssue} type="button">
        File issue
      </button>
      <button
        className="secondary"
        onClick={actions.clickedOpenTriage}
        type="button"
      >
        Triage
      </button>
    </nav>
  )
}

const IssueList = ({ state }: { state: IssuesState }) => {
  const actions = IssueTrackerClient.useActions()
  if (state._tag === 'LoadingIssues') return <p>Observing Issues…</p>
  if (state._tag === 'FailedIssues') return <p role="alert">{state.reason}</p>
  return (
    <section aria-labelledby="issues-heading">
      <div className="heading-row">
        <h2 id="issues-heading">Current issues</h2>
        <NavButtons />
      </div>
      <div className="issue-grid">
        {Array.map(state.issues, issue => (
          <button
            className="issue-card"
            key={issue.id}
            onClick={() => actions.selectedIssue(issue.id)}
            type="button"
          >
            <span className={`priority ${issue.priority.toLowerCase()}`}>
              {issue.priority}
            </span>
            <strong>{issue.title}</strong>
            <span>
              {issue.product._tag} · {issue.product.name}
            </span>
            <span>{issue.status}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

const BackButton = () => {
  const actions = IssueTrackerClient.useActions()
  return (
    <button
      className="back"
      onClick={actions.dismissedDestination}
      type="button"
    >
      ← All issues
    </button>
  )
}

const IssueDetail = ({ state }: { state: IssueDetailState }) => {
  if (state._tag === 'LoadingIssue') {
    return (
      <section>
        <BackButton />
        <p>Observing issue…</p>
      </section>
    )
  }
  if (state._tag === 'FailedIssue') {
    return (
      <section>
        <BackButton />
        <p role="alert">{state.reason}</p>
      </section>
    )
  }
  if (state._tag !== 'LoadedIssue' || Option.isNone(state.issue)) {
    return (
      <section>
        <BackButton />
        <h2>Issue not found</h2>
      </section>
    )
  }
  const issue = state.issue.value
  return (
    <article className="detail">
      <BackButton />
      <p className="eyebrow">
        {issue.id} · {issue.priority}
      </p>
      <h2>{issue.title}</h2>
      <p>{issue.details}</p>
      <dl>
        <dt>Domain</dt>
        <dd>
          {issue.product._tag} · {issue.product.name}
        </dd>
        <dt>Status</dt>
        <dd>{issue.status}</dd>
      </dl>
    </article>
  )
}

const FileIssue = ({
  draft,
  draftState,
  products,
}: typeof FileIssueDestination.Type) => {
  const actions = IssueTrackerClient.useActions()
  const productEntries =
    products._tag === 'LoadedProducts' ? products.products : []
  const submitted = (event: FormEvent) => {
    event.preventDefault()
    actions.submittedIssue()
  }
  return (
    <section>
      <BackButton />
      <h2>File an issue</h2>
      <form onSubmit={submitted}>
        <label>
          Title
          <input
            required
            value={draft.title}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              actions.updatedTitle(event.currentTarget.value)
            }
          />
        </label>
        <label>
          Application or Library
          <select
            value={draft.productId}
            onChange={event =>
              actions.selectedProduct(event.currentTarget.value)
            }
          >
            {Array.map(productEntries, entry => (
              <option key={entry.product.id} value={entry.product.id}>
                {entry.product._tag} · {entry.product.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            value={draft.priority}
            onChange={event =>
              actions.selectedPriority(
                S.decodeUnknownSync(IssuePriority)(event.currentTarget.value),
              )
            }
          >
            {Array.map(priorities, priority => (
              <option key={priority}>{priority}</option>
            ))}
          </select>
        </label>
        <label>
          Details
          <textarea
            value={draft.details}
            onChange={event =>
              actions.updatedDetails(event.currentTarget.value)
            }
          />
        </label>
        {draftState._tag === 'FailedIssueDraft' ? (
          <p role="alert">{draftState.reason}</p>
        ) : null}
        <button disabled={draftState._tag === 'SavingIssueDraft'} type="submit">
          {draftState._tag === 'SavingIssueDraft' ? 'Saving…' : 'File issue'}
        </button>
      </form>
    </section>
  )
}

const TriageInbox = ({
  state,
}: {
  state: Extract<Destination, { _tag: 'TriageInboxDestination' }>['state']
}) => {
  const actions = IssueTrackerClient.useActions()
  return (
    <section>
      <BackButton />
      <p className="eyebrow">Review required</p>
      <h2>Triage inbox</h2>
      <p>
        Listener suggestions remain drafts until explicitly promoted to an
        Issue.
      </p>
      {state._tag === 'LoadedTriageCandidates' ? (
        <div className="issue-grid">
          {Array.map(state.candidates, candidate => (
            <article
              className="issue-card"
              id={candidate.segment.id}
              key={candidate.id}
            >
              <span className="eyebrow">
                {candidate.status} · {candidate.suggestedPriority}
              </span>
              <strong>{candidate.suggestedTitle}</strong>
              <span>{candidate.segment.transcript}</span>
              <span>
                {candidate.product._tag} · {candidate.product.name} ·{' '}
                {Math.round(candidate.segment.startMilliseconds / 1000)}s–
                {Math.round(candidate.segment.endMilliseconds / 1000)}s
              </span>
              {Option.isSome(candidate.segment.publicUrl) ? (
                <a href={candidate.segment.publicUrl.value}>Share segment</a>
              ) : null}
              {candidate.status === 'Draft' ? (
                <nav aria-label={`Review ${candidate.id}`}>
                  <button
                    onClick={() =>
                      actions.promotedTriageCandidate(candidate.id)
                    }
                    type="button"
                  >
                    Promote to Issue
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      actions.dismissedTriageCandidate(candidate.id)
                    }
                    type="button"
                  >
                    Dismiss
                  </button>
                </nav>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p>{state._tag}</p>
      )}
    </section>
  )
}
