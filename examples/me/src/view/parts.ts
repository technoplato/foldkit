import { type Html, html } from 'foldkit/html'

import type { Message } from '../message'

// VIEW

/** A link that opens outside the page, in a new tab, with no referrer. */
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

/** A section's title with one line on what it shows. */
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
