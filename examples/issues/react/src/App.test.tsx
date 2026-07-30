import { LoadedIssueLogs } from 'issues-core-example'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  IssueLogEvidence,
  contributingPath,
} from '@foldkit/instant-tools/logging'

import { IssueEvidenceRows } from './App.js'

const evidence = IssueLogEvidence.make({
  category: 'issues',
  contributingPaths: [
    contributingPath(
      'examples/issues/react/src/App.tsx',
      'React renders the shared evidence state.',
    ),
  ],
  issueID: '041',
  level: 'Info',
  logID: 'log-041',
  logNamespace: 'instantToolsLogs',
  message: 'Issue #041 live evidence is visible.',
  name: 'issue.evidence.rendered',
  timestampMs: 1_753_800_000_000,
  viewerURL: 'https://issues.knophy.com/issues/041',
})

describe('Issue evidence rows', () => {
  it('renders stable live evidence metadata from the shared Model', () => {
    const html = renderToStaticMarkup(
      <IssueEvidenceRows
        state={LoadedIssueLogs.make({
          issueId: '041',
          logs: [evidence],
        })}
      />,
    )

    expect(html).toContain('data-log-id="instantToolsLogs:log-041"')
    expect(html).toContain('Issue #041')
    expect(html).toContain('2025-07-29T14:40:00.000Z')
    expect(html).toContain('Issue #041 live evidence is visible.')
    expect(html).toContain('examples/issues/react/src/App.tsx')
    expect(html).toContain('React renders the shared evidence state.')
    expect(html).toContain('href="https://issues.knophy.com/issues/041"')
    expect(html).toContain('rel="noreferrer"')
  })

  it('renders an explicit empty state after a live snapshot', () => {
    const html = renderToStaticMarkup(
      <IssueEvidenceRows
        state={LoadedIssueLogs.make({ issueId: '041', logs: [] })}
      />,
    )

    expect(html).toContain('No logs have been tagged with this Issue yet.')
  })

  it('does not make an unsafe viewer URL interactive', () => {
    const html = renderToStaticMarkup(
      <IssueEvidenceRows
        state={LoadedIssueLogs.make({
          issueId: '041',
          logs: [
            IssueLogEvidence.make({
              ...evidence,
              viewerURL: 'javascript:alert(1)',
            }),
          ],
        })}
      />,
    )

    expect(html).toContain('Issue #041')
    expect(html).not.toContain('javascript:')
  })
})
