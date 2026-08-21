import { Array, Option } from 'effect'
import { Document, type Html, html } from 'foldkit/html'
import {
  AskDanger,
  BroadcastDanger,
  ChainSendDanger,
  ClickedTool,
  GROK_SHARE,
  KeyExfilDanger,
  LiveWalletDanger,
  type Message,
  MintPlay,
  type Model,
  MovePlay,
  PlayCredits,
  orbitTools,
  playOf,
} from 'orbit-core-example'

const outcomeLine = (model: Model): string =>
  Option.match(model.lastOutcome, {
    onNone: () => 'effects appear here — danger always refuses',
    onSome: outcome =>
      outcome._tag === 'ok'
        ? outcome.line
        : `refuse ${outcome.danger._tag}: ${outcome.why}`,
  })

const simCard = (role: 'tortoise' | 'achilles', model: Model): Html => {
  const el = html<Message>()
  const wallet = model.sims[role]
  return el.article(
    [el.Class('rounded-xl border border-emerald-800 bg-black/40 p-4')],
    [
      el.p(
        [
          el.Class(
            'font-mono text-xs uppercase tracking-wide text-emerald-400',
          ),
        ],
        [role],
      ),
      el.p(
        [el.Class('mt-2 font-mono text-3xl text-emerald-100')],
        [`${String(playOf(wallet))} play`],
      ),
      el.p(
        [el.Class('mt-1 font-mono text-xs text-emerald-600')],
        [`tag: ${wallet._tag}`],
      ),
    ],
  )
}

const stepRow = (model: Model, index: number): Html => {
  const el = html<Message>()
  const step = model.steps[index]
  if (step === undefined) {
    return el.empty
  }
  return el.li(
    [
      el.Key(step.id),
      el.Class('flex gap-3 font-mono text-sm text-emerald-200'),
    ],
    [
      el.span(
        [el.Class(step.ok ? 'text-emerald-400' : 'text-red-400')],
        [step.ok ? 'ok' : 'fail'],
      ),
      el.span([el.Class('text-emerald-600')], [step.id]),
      el.span([], [step.title]),
    ],
  )
}

const toolCard = (model: Model, toolId: string): Html => {
  const el = html<Message>()
  const tool = Array.findFirst(orbitTools, item => item.id === toolId)
  if (Option.isNone(tool)) {
    return el.empty
  }
  const item = tool.value
  const selected =
    Option.isSome(model.selectedToolId) &&
    model.selectedToolId.value === item.id
  return el.article(
    [
      el.Key(item.id),
      el.Id(item.id),
      el.Class(
        selected
          ? 'rounded-xl border border-amber-400 bg-black/50 p-5'
          : 'rounded-xl border border-emerald-900 bg-black/30 p-5',
      ),
    ],
    [
      el.button(
        [
          el.OnClick(ClickedTool.make({ id: item.id })),
          el.Class('w-full text-left'),
        ],
        [
          el.p(
            [el.Class('font-mono text-xs text-emerald-500')],
            [`${item.number} · ${item.status}`],
          ),
          el.h2(
            [el.Class('mt-2 text-xl font-semibold text-emerald-100')],
            [item.name],
          ),
          el.p([el.Class('mt-2 text-sm text-emerald-300')], [item.tagline]),
        ],
      ),
      el.ol(
        [el.Class('mt-4 list-decimal space-y-1 pl-5 text-sm text-emerald-400')],
        Array.map(item.instructions, (line, i) =>
          el.li([el.Key(`${item.id}-i${String(i)}`)], [line]),
        ),
      ),
      el.pre(
        [
          el.Class(
            'mt-4 overflow-x-auto rounded-lg border border-emerald-950 bg-black p-4 font-mono text-xs text-emerald-500',
          ),
        ],
        [item.source],
      ),
    ],
  )
}

const header = (): Html => {
  const el = html<Message>()
  const link = (href: string, label: string): Html =>
    el.a(
      [
        el.Href(href),
        el.Class(
          'text-emerald-400 underline decoration-emerald-800 hover:text-amber-300',
        ),
      ],
      [label],
    )
  return el.header(
    [
      el.Class(
        'border-b border-emerald-900 bg-black px-6 py-3 font-mono text-sm',
      ),
    ],
    [
      el.p([el.Class('text-emerald-500')], ['ai_agent@orbit:~$']),
      el.nav(
        [el.Class('mt-2 flex flex-wrap gap-4 text-xs')],
        [
          link('/api/agent', '/api/agent'),
          link('/agent.md', '/agent.md'),
          link('/api/state', '/api/state'),
          el.a(
            [
              el.Href(GROK_SHARE),
              el.Target('_blank'),
              el.Rel('noopener noreferrer'),
              el.Class('text-emerald-400 underline decoration-emerald-800'),
            ],
            ['Grok share'],
          ),
        ],
      ),
    ],
  )
}

/** Renders the Orbit agent index as Html. */
export const body = (model: Model): Html => {
  const el = html<Message>()
  return el.div(
    [el.Class('min-h-screen bg-zinc-950 text-emerald-100')],
    [
      header(),
      el.main(
        [el.Class('mx-auto grid max-w-5xl gap-8 p-6')],
        [
          el.p(
            [
              el.Class(
                'font-mono text-xs uppercase tracking-[0.3em] text-amber-400',
              ),
            ],
            ['AGENT INDEX · EXECUTED AT PREBUILD'],
          ),
          el.h1(
            [el.Class('text-3xl font-semibold')],
            ['These are your instructions'],
          ),
          el.section(
            [
              el.Class(
                'rounded-xl border border-emerald-800 bg-emerald-950/40 p-5',
              ),
            ],
            [
              el.h2(
                [
                  el.Class(
                    'text-sm font-semibold uppercase tracking-wide text-amber-300',
                  ),
                ],
                ['Why this is clever'],
              ),
              el.p(
                [el.Class('mt-3 text-sm leading-6 text-emerald-200')],
                [
                  'The index is not a README that drifts. It is the program an agent runs. Prebuild mounts the same FoldKit core with no view and no server. LiveWallet is not a variant. Play credits cannot be added to satoshis because satoshis are not a type here.',
                ],
              ),
            ],
          ),
          el.section(
            [el.Class('grid gap-2')],
            [
              el.h2(
                [
                  el.Class(
                    'text-sm font-semibold uppercase tracking-wide text-amber-300',
                  ),
                ],
                ['Same run, in the page'],
              ),
              el.ol(
                [el.Class('grid gap-1')],
                Array.map(model.steps, (_step, index) => stepRow(model, index)),
              ),
            ],
          ),
          el.section(
            [el.Class('grid gap-4')],
            [
              el.h2(
                [
                  el.Class(
                    'text-sm font-semibold uppercase tracking-wide text-amber-300',
                  ),
                ],
                ['Sim wallets'],
              ),
              el.p(
                [el.Class('text-sm text-emerald-400')],
                [
                  'Play credits only. Red buttons refuse. There is no live type to click.',
                ],
              ),
              el.div(
                [el.Class('grid gap-3 sm:grid-cols-2')],
                [simCard('tortoise', model), simCard('achilles', model)],
              ),
              el.div(
                [el.Class('flex flex-wrap gap-2')],
                [
                  el.button(
                    [
                      el.OnClick(
                        MintPlay.make({
                          role: 'tortoise',
                          amount: PlayCredits.make(1428),
                        }),
                      ),
                      el.Class(
                        'rounded-full border border-emerald-600 bg-emerald-950 px-4 py-2 text-sm text-emerald-100',
                      ),
                    ],
                    ['Mint 1428 to tortoise'],
                  ),
                  el.button(
                    [
                      el.OnClick(
                        MovePlay.make({
                          from: 'tortoise',
                          to: 'achilles',
                          amount: PlayCredits.make(428),
                        }),
                      ),
                      el.Class(
                        'rounded-full border border-emerald-600 bg-emerald-950 px-4 py-2 text-sm text-emerald-100',
                      ),
                    ],
                    ['Move 428 → achilles'],
                  ),
                  el.button(
                    [
                      el.OnClick(
                        AskDanger.make({ danger: LiveWalletDanger.make({}) }),
                      ),
                      el.Class(
                        'rounded-full border border-red-700 bg-red-950 px-4 py-2 text-sm text-red-200',
                      ),
                    ],
                    ['Open live wallet'],
                  ),
                  el.button(
                    [
                      el.OnClick(
                        AskDanger.make({ danger: ChainSendDanger.make({}) }),
                      ),
                      el.Class(
                        'rounded-full border border-red-700 bg-red-950 px-4 py-2 text-sm text-red-200',
                      ),
                    ],
                    ['Send on chain'],
                  ),
                  el.button(
                    [
                      el.OnClick(
                        AskDanger.make({ danger: BroadcastDanger.make({}) }),
                      ),
                      el.Class(
                        'rounded-full border border-red-700 bg-red-950 px-4 py-2 text-sm text-red-200',
                      ),
                    ],
                    ['Broadcast claim'],
                  ),
                  el.button(
                    [
                      el.OnClick(
                        AskDanger.make({ danger: KeyExfilDanger.make({}) }),
                      ),
                      el.Class(
                        'rounded-full border border-red-700 bg-red-950 px-4 py-2 text-sm text-red-200',
                      ),
                    ],
                    ['Load key material'],
                  ),
                ],
              ),
              el.p(
                [
                  el.Role('status'),
                  el.Class('font-mono text-sm text-amber-300'),
                ],
                [outcomeLine(model)],
              ),
            ],
          ),
          el.section(
            [el.Class('grid gap-6')],
            [
              el.h2(
                [
                  el.Class(
                    'text-sm font-semibold uppercase tracking-wide text-amber-300',
                  ),
                ],
                ['Tools'],
              ),
              ...Array.map(orbitTools, tool => toolCard(model, tool.id)),
            ],
          ),
        ],
      ),
    ],
  )
}

/** Renders the Orbit agent index and owns the page title. */
export const view = (model: Model): Document => ({
  title: 'Orbit agent index',
  body: body(model),
})
