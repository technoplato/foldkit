import { Array, Match as M, Option, pipe } from 'effect'

import {
  AgentReference,
  ISSUE_VIEWER_ORIGIN,
  type Issue,
  UriReference,
} from '@foldkit/instant-tools/issues'

import { type AgentFinding } from './graphFacts.js'
import { IssueDraft } from './model.js'

const MODEL_PREFIX = /^model=\S+\s+/
const KIND_PREFIX = /^(?:mistake|environment|product):\s*/i
const FIRST_SENTENCE = /^[\s\S]+?[.!?](?=\s|$)/
const TITLE_LIMIT = 100

const titleOf = (quote: string): string => {
  const words = quote.replace(MODEL_PREFIX, '').replace(KIND_PREFIX, '').trim()
  const sentence = FIRST_SENTENCE.exec(words)?.[0] ?? words
  return sentence.length <= TITLE_LIMIT
    ? sentence
    : `${sentence.slice(0, TITLE_LIMIT - 1).trimEnd()}…`
}

const issueTypeOf = (kind: string): Option.Option<string> =>
  M.value(kind).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.when('mistake', () => Option.some('process')),
    M.when('environment', () => Option.some('infrastructure')),
    M.when('product', () => Option.some('defect')),
    M.orElse(() => Option.none()),
  )

const findingPage = (finding: AgentFinding): string =>
  `${ISSUE_VIEWER_ORIGIN}/findings/${finding.findingId}`

const whoWords = (finding: AgentFinding): ReadonlyArray<string> => [
  ...Option.toArray(
    Option.map(finding.maybeAgentId, agentId => `reported by ${agentId}`),
  ),
  ...Option.toArray(
    Option.map(finding.maybeSessionId, sessionId => `in session ${sessionId}`),
  ),
]

const detailsOf = (finding: AgentFinding): string =>
  Array.join(
    [
      finding.quote,
      ...Option.toArray(Option.map(finding.maybeFix, fix => `Fix: ${fix}`)),
      Array.join(
        [
          `From finding ${findingPage(finding)}, ${finding.kind}`,
          ...whoWords(finding),
        ],
        ', ',
      ),
    ],
    '\n\n',
  )

/**
 * A filing form holding one finding: its first sentence as the title, its
 * words, fix and links as the details, the Issue it was raised on as the
 * related Issue, under that Issue's product. The words stay editable, and it
 * files through the same path as any other Issue.
 */
export const draftOfFinding = (
  finding: AgentFinding,
  issuesById: ReadonlyMap<string, Issue>,
  current: IssueDraft,
): IssueDraft => {
  const maybeRaisedOn = Option.flatMap(finding.maybeIssueId, issueId =>
    Option.fromUndefinedOr(issuesById.get(issueId)),
  )
  return IssueDraft.make({
    ...current,
    details: detailsOf(finding),
    issueType: issueTypeOf(finding.kind),
    mentions: [
      {
        capturedAtMs: Option.some(finding.occurredAtMs),
        directQuote: Option.some(finding.quote),
        note: Option.some(
          `An agent reported this running into it (${finding.kind}).`,
        ),
        related: pipe(
          Option.toArray(finding.maybeDeepLink),
          Array.map(value => UriReference.make({ value })),
        ),
        reporter: Option.map(finding.maybeAgentId, id =>
          AgentReference.make({ id }),
        ),
        source: UriReference.make({ value: findingPage(finding) }),
      },
    ],
    productId: Option.getOrElse(
      Option.map(maybeRaisedOn, issue => issue.product.id),
      () => current.productId,
    ),
    relatedIssueIds: Option.toArray(finding.maybeIssueId),
    title: titleOf(finding.quote),
  })
}
