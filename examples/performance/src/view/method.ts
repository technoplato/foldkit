import { Array, Option } from 'effect'
import { type Html, html } from 'foldkit/html'

import type { Index } from '../data'
import type { Message } from '../message'
import { formatDate, formatNumber, shortSha } from './format'
import { outsideLink, sectionHeading } from './parts'

// VIEW

/** How every number is made, where it comes from and when, and who can open the page. */
export const methodView = (index: Index): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('max-w-3xl')],
    [
      h.h1(
        [h.Class('mb-4 text-3xl font-semibold')],
        ['How the numbers are made'],
      ),
      h.p([h.Class('mb-8')], [index.method]),
      sectionHeading('Where they come from, and when', ''),
      h.dl(
        [
          h.Class(
            'mb-8 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]',
          ),
        ],
        [
          h.dt([h.Class('ink-muted')], ['Written']),
          h.dd([], [formatDate(index.generatedAt)]),
          h.dt([h.Class('ink-muted')], ['The ledger']),
          h.dd(
            [],
            [
              outsideLink(
                index.ledger.url,
                `${index.ledger.path} at ${shortSha(index.ledger.commit)}`,
              ),
            ],
          ),
          h.dt([h.Class('ink-muted')], ['Newest ledger minute']),
          h.dd(
            [],
            [Option.getOrElse(index.ledger.maybeNewestMinute, () => 'none')],
          ),
          h.dt([h.Class('ink-muted')], ['Minutes read']),
          h.dd(
            [h.Class('tabular')],
            [
              `${formatNumber(index.ledger.minutes, 0)} ledger minutes and ${formatNumber(index.ledger.cannedMinutes, 0)} canned-audio minutes, every device`,
            ],
          ),
          h.dt([h.Class('ink-muted')], ['Refreshed']),
          h.dd(
            [],
            [
              "Every 30 minutes, by the Mac's performance metrics agent, right after it keeps the ledger's new minutes. Nothing runs on a phone.",
            ],
          ),
        ],
      ),
      sectionHeading(
        'The metrics',
        'What each reads; open a chart for the command and the ledger line.',
      ),
      h.ul(
        [h.Class('mb-8 space-y-2 text-sm')],
        Array.map(index.metrics, metric =>
          h.li(
            [h.Key(metric.id)],
            [
              h.span(
                [h.Class('font-semibold')],
                [`${metric.label} (${metric.unit}): `],
              ),
              metric.reads,
            ],
          ),
        ),
      ),
      sectionHeading('Who can open this page', ''),
      h.p(
        [h.Class('mb-8')],
        [
          "Only your Google sign-in. Cloudflare Access asks for it, then this page's own server checks it again and answers every other login, and anyone without one, with Not found, data files included. Nothing here is public.",
        ],
      ),
      ...Array.match(index.ledger.problems, {
        onEmpty: () => [],
        onNonEmpty: problems => [
          sectionHeading(
            'What the exporter could not read',
            'Rows of the ledger it left out, and why.',
          ),
          h.ul(
            [h.Class('list-disc pl-5 text-sm')],
            Array.map(problems, problem => h.li([], [problem])),
          ),
        ],
      }),
    ],
  )
}
