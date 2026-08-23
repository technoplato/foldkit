import { Array, Effect, Match as M, Option } from 'effect'
import { Program } from 'foldkit'
import {
  type IssueLogsState,
  modelForNavigation,
  navigationToPath,
  pathToNavigation,
} from 'issues-core-example'
import { sendScreenToken, useScreen } from 'issues-react-bindings-example'
import { type ReactNode, useEffect } from 'react'
import { useProgramNavigationHistory } from 'shared-react-bindings-example'

import { type IssueLogEvidence } from '@foldkit/instant-tools/logging'
import { type PaintClassNames, paintReact } from '@foldkit/react'

import { IssueTrackerClient } from './client.js'
import { recoverCurrentViewerAfterFailure } from './viewerFailureRecovery.js'

const classNames: PaintClassNames = {
  Button:
    'rounded-full border border-zinc-600 px-4 py-2 text-sm hover:bg-zinc-800',
  Column: 'flex flex-col gap-3',
  Row: 'flex flex-row flex-wrap gap-2',
  Text: 'text-sm leading-6',
  TextInput:
    'rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm w-full max-w-md',
}

/** Paints the shared issuesScreen. The window makes zero leftover decisions. */
export const ScreenApp = () => {
  const model = IssueTrackerClient.useModel()
  const actions = IssueTrackerClient.useActions()
  const screen = useScreen()
  useProgramNavigationHistory({
    navigation: model.navigation,
    openedNavigation: actions.openedNavigation,
    parseNavigation: pathToNavigation,
    printNavigation: navigationToPath,
  })
  const reason =
    model.issues._tag === 'FailedIssues'
      ? model.issues.reason
      : model.issueDetail._tag === 'FailedIssue'
        ? model.issueDetail.reason
        : undefined
  useEffect(() => {
    if (reason !== undefined) {
      Effect.runSync(recoverCurrentViewerAfterFailure)
    }
  }, [reason])
  return (
    <main className="issues-screen min-h-screen bg-zinc-950 text-zinc-50 p-6">
      {paintReact(screen, sendScreenToken, classNames)}
    </main>
  )
}

/** Runs the React Client from the current portable URL. */
export const App = () => (
  <IssueTrackerClient.Provider
    fallback={<p className="loading">Starting Issue Tracker…</p>}
    initialRoute={Program.state(
      modelForNavigation(pathToNavigation(window.location.href)),
    )}
  >
    <ScreenApp />
  </IssueTrackerClient.Provider>
)

/** Recovers one stale deployment automatically and keeps current failures actionable. */
export const IssueFailure = ({ reason }: { reason: string }) => {
  useEffect(() => {
    Effect.runSync(recoverCurrentViewerAfterFailure)
  }, [reason])
  return (
    <div className="issue-failure">
      <h2>The live Issue data could not be read.</h2>
      <p>
        This tab may be running an older viewer. Reload to use the latest
        deployed schema.
      </p>
      <pre role="alert">{reason}</pre>
      <button onClick={() => window.location.reload()} type="button">
        Reload latest viewer
      </button>
    </div>
  )
}

const safeViewerURL = (value: string): Option.Option<string> => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? Option.some(url.href) : Option.none()
  } catch {
    return Option.none()
  }
}

const IssueEvidenceRow = ({ log }: { log: IssueLogEvidence }) => {
  const maybeViewerURL = safeViewerURL(log.viewerURL)
  const timestamp = new Date(log.timestampMs).toISOString()
  const issueReference = 'Issue #' + log.issueID
  return (
    <article
      className="evidence-row"
      data-log-id={log.logNamespace + ':' + log.logID}
    >
      <p className="evidence-meta">
        {Option.isSome(maybeViewerURL) ? (
          <a
            aria-label={
              'Open ' + issueReference + ' evidence viewer in a new tab'
            }
            href={maybeViewerURL.value}
            rel="noreferrer"
            target="_blank"
          >
            {issueReference}
          </a>
        ) : (
          <span>{issueReference}</span>
        )}
        <span>{log.level}</span>
        <code>{log.name}</code>
        <time dateTime={timestamp}>{timestamp}</time>
      </p>
      <p>{log.message}</p>
      {Array.isReadonlyArrayEmpty(log.contributingPaths) ? null : (
        <ul
          aria-label={'Evidence paths for ' + issueReference}
          className="evidence-paths"
        >
          {Array.map(log.contributingPaths, path => (
            <li key={path.relationship + ':' + path.path}>
              <strong>{path.relationship}</strong>
              <span> · </span>
              <code>{path.path}</code>
              {Option.isSome(path.reason) ? (
                <>
                  <span> · </span>
                  <span>{path.reason.value}</span>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

/** Renders the shared live Issue log observation without owning transport. */
export const IssueEvidenceRows = ({
  state,
}: {
  state: IssueLogsState
}): ReactNode =>
  M.value(state).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      NotObservingIssueLogs: () => null,
      LoadingIssueLogs: () => <p aria-live="polite">Loading tagged logs…</p>,
      FailedIssueLogs: ({ reason }) => <p role="alert">{reason}</p>,
      LoadedIssueLogs: ({ logs }) =>
        Array.isReadonlyArrayEmpty(logs) ? (
          <p>No logs have been tagged with this Issue yet.</p>
        ) : (
          <div className="evidence-list">
            {Array.map(logs, log => (
              <IssueEvidenceRow
                key={log.logNamespace + ':' + log.logID}
                log={log}
              />
            ))}
          </div>
        ),
    }),
  )
