import { Option } from 'effect'
import { Document, type Html, html } from 'foldkit/html'
import {
  ClearedCredentials,
  ConnectedWallet,
  DisconnectedWallet,
  type Message,
  type Model,
  RAILS,
  RecordedCredentialPresence,
  RequestedSession,
  RequestedVerify,
  ResetCheckout,
  SelectedRail,
  displayForModel,
  isRailReady,
  quotedCents,
  readPresence,
  requireRail,
} from 'payments-core-example'

const outcomeLine = (model: Model): string =>
  Option.match(model.lastOutcome, {
    onNone: () => 'effects appear here',
    onSome: outcome =>
      outcome._tag === 'ok' ? outcome.line : `refuse ${outcome.why}`,
  })

const railButton = (model: Model, id: (typeof RAILS)[number]['id']): Html => {
  const el = html<Message>()
  const rail = requireRail(id)
  const selected = model.selectedRail === id
  const ready = isRailReady(id, model.presence, model.wallet)
  return el.button(
    [
      el.OnClick(SelectedRail({ rail: id })),
      el.Class(
        selected
          ? 'w-full rounded-xl border border-amber-400 bg-zinc-900 px-4 py-3 text-left'
          : 'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-left',
      ),
    ],
    [
      el.div(
        [el.Class('flex items-center justify-between gap-3')],
        [
          el.span([el.Class('font-medium text-zinc-100')], [rail.title]),
          el.span(
            [
              el.Class(
                ready ? 'text-emerald-400 text-xs' : 'text-zinc-500 text-xs',
              ),
            ],
            [ready ? 'ready' : 'wait'],
          ),
        ],
      ),
      el.p([el.Class('mt-1 text-xs text-zinc-500')], [rail.blurb]),
    ],
  )
}

const setupLink = (label: string, href: string): Html => {
  const el = html<Message>()
  return el.a(
    [
      el.Href(href),
      el.Target('_blank'),
      el.Rel('noreferrer'),
      el.Class('block font-mono text-xs text-amber-300 underline'),
    ],
    [label],
  )
}

const fieldButton = (
  model: Model,
  field: (typeof RAILS)[number]['fields'][number],
): Html => {
  const el = html<Message>()
  const isPresent = readPresence(model.presence, field)
  return el.button(
    [
      el.OnClick(RecordedCredentialPresence({ field, isPresent: !isPresent })),
      el.Class(
        'rounded-lg border border-zinc-700 px-3 py-2 font-mono text-xs text-zinc-200',
      ),
    ],
    [`${field} ${isPresent ? 'on' : 'off'}`],
  )
}

/** Foldkit HTML adapter. It paints the Program. It does not own checkout. */
export const view = (model: Model): Document => {
  const el = html<Message>()
  const selected = requireRail(model.selectedRail)
  return {
    title: `Payments | ${selected.title}`,
    body: el.main(
      [
        el.Class(
          'min-h-screen bg-black text-zinc-100 px-4 py-8 flex flex-col items-center',
        ),
      ],
      [
        el.section(
          [el.Class('w-full max-w-md space-y-6')],
          [
            el.header(
              [el.Class('space-y-2')],
              [
                el.h1([el.Class('font-serif text-3xl')], ['Payments']),
                el.p(
                  [el.Class('text-sm text-zinc-400')],
                  [
                    'Core Program. This page is one adapter. Secrets never enter the Model.',
                  ],
                ),
              ],
            ),
            el.pre(
              [
                el.Class(
                  'whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-[11px] text-zinc-300',
                ),
              ],
              [displayForModel(model)],
            ),
            el.div(
              [el.Class('flex flex-col gap-2')],
              RAILS.map(rail => railButton(model, rail.id)),
            ),
            el.div(
              [el.Class('space-y-2')],
              [
                el.p(
                  [el.Class('text-xs text-zinc-500')],
                  [`Setup for ${selected.title}`],
                ),
                ...selected.setup.map(link => setupLink(link.label, link.href)),
              ],
            ),
            el.div(
              [el.Class('flex flex-wrap gap-2')],
              selected.fields.map(field => fieldButton(model, field)),
            ),
            el.p(
              [el.Class('text-sm text-zinc-400')],
              [
                `Quote ${String(quotedCents(model))} cents | ${outcomeLine(model)}`,
              ],
            ),
            el.div(
              [el.Class('grid grid-cols-2 gap-2')],
              [
                el.button(
                  [
                    el.OnClick(
                      model.wallet._tag === 'Connected'
                        ? DisconnectedWallet()
                        : ConnectedWallet(),
                    ),
                    el.Class('h-12 rounded-xl bg-zinc-800 text-sm font-medium'),
                  ],
                  [
                    model.wallet._tag === 'Connected'
                      ? 'Disconnect wallet'
                      : 'Connect wallet',
                  ],
                ),
                el.button(
                  [
                    el.OnClick(ClearedCredentials()),
                    el.Class('h-12 rounded-xl bg-zinc-800 text-sm font-medium'),
                  ],
                  ['Clear presence'],
                ),
                el.button(
                  [
                    el.OnClick(RequestedSession()),
                    el.Class(
                      'h-12 rounded-xl bg-amber-500 text-black text-sm font-medium',
                    ),
                  ],
                  ['Start session'],
                ),
                el.button(
                  [
                    el.OnClick(RequestedVerify({})),
                    el.Class('h-12 rounded-xl bg-zinc-800 text-sm font-medium'),
                  ],
                  ['Verify'],
                ),
              ],
            ),
            el.button(
              [
                el.OnClick(ResetCheckout()),
                el.Class(
                  'h-11 w-full rounded-xl border border-zinc-700 text-sm',
                ),
              ],
              ['Reset checkout'],
            ),
          ],
        ),
      ],
    ),
  }
}
