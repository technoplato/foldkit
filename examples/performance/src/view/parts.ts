import { Option } from 'effect'
import { type Html, html } from 'foldkit/html'

import type { Commit, Evidence, EvidenceTag, Release } from '../data'
import type { Message } from '../message'
import {
  evidenceDotClass,
  evidenceIcon,
  evidenceLabel,
  shortSha,
} from './format'

/** A link that leaves this site: GitHub, the issues site. Opens in a new tab and sends no referrer. */
export const outsideLink = (href: string, label: string): Html => {
  const h = html<Message>()
  return h.a(
    [
      h.Href(href),
      h.Class('link'),
      h.Target('_blank'),
      h.Rel('noreferrer noopener'),
    ],
    [label],
  )
}

/** An evidence state as an icon and its words, never color alone. */
export const evidenceChip = (evidence: Evidence): Html =>
  evidenceTagChip(evidence._tag)

export const evidenceTagChip = (tag: EvidenceTag): Html => {
  const h = html<Message>()
  return h.span(
    [h.Class('inline-flex items-center gap-1.5 whitespace-nowrap text-sm')],
    [
      h.span(
        [h.Class(`${evidenceDotClass(tag)} font-bold`), h.AriaHidden(true)],
        [evidenceIcon(tag)],
      ),
      h.span([h.Class('font-medium')], [evidenceLabel(tag)]),
    ],
  )
}

/** A build's commit as a table cell: the short id, marked `cut` when it is the cut commit. */
export const commitCell = (maybeCommit: Option.Option<Commit>): Html => {
  const h = html<Message>()
  return Option.match(maybeCommit, {
    onNone: () => h.span([h.Class('ink-muted')], ['none known']),
    onSome: commit =>
      h.span(
        [h.Class('inline-flex items-baseline gap-1.5 whitespace-nowrap')],
        [
          Option.match(commit.maybeUrl, {
            onNone: () => h.code([h.Class('text-xs')], [shortSha(commit.sha)]),
            onSome: url =>
              h.code(
                [h.Class('text-xs')],
                [outsideLink(url, shortSha(commit.sha))],
              ),
          }),
          ...(commit.kind === 'Source'
            ? []
            : [
                h.span(
                  [h.Class('text-xs ink-muted')],
                  [commit.kind === 'Cut' ? 'cut' : 'not on GitHub'],
                ),
              ]),
        ],
      ),
  })
}

/** A build's commit on GitHub, with why it is the cut's when the build's own is missing. */
export const commitLink = (maybeCommit: Option.Option<Commit>): Html => {
  const h = html<Message>()
  return Option.match(maybeCommit, {
    onNone: () => h.span([h.Class('ink-muted')], ['no commit known']),
    onSome: commit =>
      h.span(
        [h.Class('inline-flex flex-col')],
        [
          Option.match(commit.maybeUrl, {
            onNone: () => h.code([h.Class('text-xs')], [shortSha(commit.sha)]),
            onSome: url =>
              h.code(
                [h.Class('text-xs')],
                [outsideLink(url, shortSha(commit.sha))],
              ),
          }),
          ...Option.match(commit.maybeNote, {
            onNone: () => [],
            onSome: note => [h.span([h.Class('text-xs ink-muted')], [note])],
          }),
        ],
      ),
  })
}

export const releaseLink = (maybeRelease: Option.Option<Release>): Html => {
  const h = html<Message>()
  return Option.match(maybeRelease, {
    onNone: () => h.span([h.Class('ink-muted')], ['none yet']),
    onSome: release => outsideLink(release.url, release.tag),
  })
}

/** A heading with a line of explanation under it. */
export const sectionHeading = (title: string, explanation: string): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('mb-3')],
    [
      h.h2([h.Class('text-lg font-semibold')], [title]),
      h.p([h.Class('text-sm ink-secondary max-w-3xl')], [explanation]),
    ],
  )
}
