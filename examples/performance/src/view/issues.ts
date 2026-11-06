import { Array, Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'

import type { Evidence, Hypothesis, Index, Issue } from '../data'
import type { Message } from '../message'
import { counted, verdictLabel, withoutMarkdown } from './format'
import { evidenceChip, outsideLink, sectionHeading } from './parts'

// CONSTANT

const GROUPS: ReadonlyArray<
  Readonly<{ tag: Evidence['_tag']; title: string; explanation: string }>
> = [
  {
    tag: 'Proven',
    title: 'Proven on a device',
    explanation:
      "The ledger's evidence table names the device, the builds and the measurement that moved.",
  },
  {
    tag: 'Disproved',
    title: 'Disproved',
    explanation: 'A measurement on a device said the claim was wrong.',
  },
  {
    tag: 'Landed',
    title: 'Landed, not proven',
    explanation:
      'A build carries the fix, and no device measurement in the ledger proves it yet: not measured, or measured together with other changes.',
  },
  {
    tag: 'InProgress',
    title: 'In progress',
    explanation: 'No build carries a fix for it yet.',
  },
]

// VIEW

const hypothesisCount = (count: number): string =>
  count === 1 ? '1 hypothesis' : `${count} hypotheses`

const evidenceDetail = (evidence: Evidence): Html => {
  const h = html<Message>()
  return M.value(evidence).pipe(
    M.tagsExhaustive({
      Proven: proof =>
        h.div(
          [h.Class('mt-1 text-sm')],
          [
            h.p(
              [],
              [
                `${proof.devices.join(', ')}, builds ${proof.builds.join(', ')}: ${proof.measurement}`,
              ],
            ),
            h.p(
              [h.Class('text-xs ink-muted')],
              [
                h.code([], [proof.command]),
                ' · ',
                outsideLink(proof.url, "the ledger's row"),
              ],
            ),
          ],
        ),
      Disproved: proof =>
        h.div(
          [h.Class('mt-1 text-sm')],
          [
            h.p(
              [],
              [
                `${proof.devices.join(', ')}, builds ${proof.builds.join(', ')}: ${proof.measurement}`,
              ],
            ),
            h.p(
              [h.Class('text-xs ink-muted')],
              [
                h.code([], [proof.command]),
                ' · ',
                outsideLink(proof.url, "the ledger's row"),
              ],
            ),
          ],
        ),
      Landed: ({ reason }) =>
        h.p([h.Class('mt-1 text-sm ink-secondary')], [reason]),
      InProgress: ({ reason }) =>
        h.p([h.Class('mt-1 text-sm ink-secondary')], [reason]),
    }),
  )
}

const hypothesisLine = (hypothesis: Hypothesis): Html => {
  const h = html<Message>()
  return h.li(
    [h.Class('text-sm')],
    [
      h.span(
        [h.Class('font-medium')],
        [`${verdictLabel(hypothesis.verdict)}: `],
      ),
      `${hypothesis.hypothesis}. Predicted ${hypothesis.predicted}; measured ${hypothesis.measured}. `,
      outsideLink(hypothesis.ledgerUrl, 'the ledger'),
    ],
  )
}

const issueRow = (index: Index, issue: Issue): Html => {
  const h = html<Message>()
  const hypotheses = Array.getSomes(
    Array.map(issue.hypotheses, position =>
      Array.get(index.hypotheses, position),
    ),
  )
  return h.li(
    [h.Key(issue.number), h.Class('border-b border-[var(--hairline)] py-3')],
    [
      h.div(
        [h.Class('flex flex-wrap items-baseline gap-x-3 gap-y-1')],
        [
          h.span(
            [h.Class('font-semibold tabular')],
            [outsideLink(issue.url, `#${issue.number}`)],
          ),
          evidenceChip(issue.evidence),
          ...Option.match(issue.maybeStatus, {
            onNone: () => [],
            onSome: status => [
              h.span([h.Class('text-xs ink-muted')], [`tracker: ${status}`]),
            ],
          }),
        ],
      ),
      h.p(
        [h.Class('mt-1')],
        [Option.getOrElse(issue.maybeTitle, () => 'title not read')],
      ),
      evidenceDetail(issue.evidence),
      ...(Array.isReadonlyArrayNonEmpty(issue.fixes) ||
      Array.isReadonlyArrayNonEmpty(hypotheses)
        ? [
            h.details(
              [h.Class('mt-2 text-sm')],
              [
                h.summary(
                  [h.Class('cursor-pointer ink-secondary')],
                  [
                    `What the ledger says (${counted(issue.fixes.length, 'fix row')}, ${hypothesisCount(hypotheses.length)})`,
                  ],
                ),
                ...Array.map(issue.fixes, fix =>
                  h.p(
                    [h.Key(String(fix.line)), h.Class('mt-1 ink-secondary')],
                    [
                      `${withoutMarkdown(fix.ledgerSoFar)} `,
                      outsideLink(fix.url, 'its row'),
                    ],
                  ),
                ),
                h.ul(
                  [h.Class('mt-2 space-y-1 pl-4')],
                  Array.map(hypotheses, hypothesisLine),
                ),
              ],
            ),
          ]
        : []),
    ],
  )
}

/** Every issue the performance work names, grouped by what proves it, then every hypothesis and its verdict. */
export const issuesView = (index: Index): Html => {
  const h = html<Message>()
  return h.div(
    [],
    [
      h.h1([h.Class('text-3xl font-semibold')], ['Issues and their evidence']),
      h.p(
        [h.Class('mb-8 mt-1 max-w-3xl ink-secondary')],
        [
          'Every issue the performance work names, from the ledger and its brief. An issue counts as proven only when the ledger names a device, the builds and the measurement; anything else is a claim, shown as one.',
        ],
      ),
      ...Array.map(GROUPS, group => {
        const issues = Array.filter(
          index.issues,
          issue => issue.evidence._tag === group.tag,
        )
        return h.section(
          [h.Key(group.tag), h.Class('mb-10')],
          [
            sectionHeading(
              `${group.title} (${issues.length})`,
              group.explanation,
            ),
            Array.match(issues, {
              onEmpty: () => h.p([h.Class('text-sm ink-muted')], ['None.']),
              onNonEmpty: each =>
                h.ul(
                  [],
                  Array.map(each, issue => issueRow(index, issue)),
                ),
            }),
          ],
        )
      }),
      h.section(
        [],
        [
          sectionHeading(
            'Hypotheses and verdicts',
            'Each was stated before measuring. A disproved one stays here as disproved.',
          ),
          h.ul(
            [h.Class('space-y-2')],
            Array.map(index.hypotheses, hypothesisLine),
          ),
        ],
      ),
    ],
  )
}
