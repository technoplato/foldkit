import {
  type CounterDetailMode,
  type CounterFactStatus,
  type Destination,
  type Interaction,
  type Message,
  type Model,
  destinationForModel,
  interactionsForModel,
} from 'counters-core-example'
import { Array, Match as M, Option } from 'effect'
import { Document, Html, html } from 'foldkit/html'

export {
  ClickedAddCounter,
  ClickedDeleteCounter,
  ClickedShowCounterFact,
  ConfirmedDeleteCounter,
  CounterList,
  DismissedCounterDetail,
  GotCounterMessage,
  Message,
  Model,
  MultipleCountersProgram,
  SelectedCounter,
  init,
  modelForNavigation,
  update,
} from 'counters-core-example'

// VIEW

const factStatusView = (status: CounterFactStatus): Html => {
  const h = html<Message>()
  return M.value(status).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      LoadingCounterFact: () =>
        h.p([h.Class('text-sky-200')], ['Loading counter fact…']),
      LoadedCounterFact: ({ fact }) =>
        h.div(
          [h.Class('space-y-1')],
          [
            h.h2(
              [h.Class('text-lg font-semibold text-sky-100')],
              [`Counter fact for ${fact.number.toString()}`],
            ),
            h.p([h.Class('text-sky-200/75')], [fact.text]),
          ],
        ),
      FailedCounterFact: ({ reason }) =>
        h.div(
          [h.Class('space-y-1')],
          [
            h.h2(
              [h.Class('text-lg font-semibold text-sky-100')],
              ['Counter fact unavailable'],
            ),
            h.p([h.Class('text-sky-200/75')], [reason]),
          ],
        ),
    }),
  )
}

const detailModeView = (counterId: string, mode: CounterDetailMode): Html => {
  const h = html<Message>()
  return M.value(mode).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      CounterFactAlert: ({ status }) =>
        h.aside(
          [
            h.AriaLabel('Counter fact'),
            h.Class(
              'mt-7 rounded-2xl border border-sky-700/60 bg-sky-950/50 p-5',
            ),
          ],
          [factStatusView(status)],
        ),
      DeleteCounterConfirmation: () =>
        h.aside(
          [
            h.AriaLabel('Delete counter confirmation'),
            h.Class(
              'mt-7 rounded-2xl border border-red-700/60 bg-red-950/40 p-5',
            ),
          ],
          [
            h.h2([h.Class('text-lg font-semibold')], [`Delete ${counterId}?`]),
            h.p(
              [h.Class('mt-1 text-sm text-red-200/70')],
              ['This cannot be undone.'],
            ),
          ],
        ),
    }),
  )
}

const destinationView = (destination: Destination): Html => {
  const h = html<Message>()
  return M.value(destination).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      CounterListDestination: ({ counters }) =>
        h.section(
          [h.AriaLabel('Counters'), h.Class('grid gap-3')],
          Array.map(counters, counter =>
            h.keyed('article')(
              counter.id,
              [
                h.Class(
                  'flex items-center justify-between rounded-2xl border border-stone-800 bg-stone-900 p-5',
                ),
              ],
              [
                h.div(
                  [],
                  [
                    h.p(
                      [h.Class('font-mono text-sm text-stone-400')],
                      [counter.id],
                    ),
                    h.p(
                      [h.Class('mt-1 text-sm text-stone-500')],
                      ['Independently addressed Submodel'],
                    ),
                  ],
                ),
                h.strong(
                  [h.Class('text-4xl tabular-nums')],
                  [counter.counter.count.toString()],
                ),
              ],
            ),
          ),
        ),
      CounterDetailDestination: ({ counter, maybeMode }) =>
        h.section(
          [h.Class('rounded-3xl border border-stone-800 bg-stone-900 p-7')],
          [
            h.p([h.Class('font-mono text-sm text-amber-400')], [counter.id]),
            h.p(
              [h.Class('mt-4 text-7xl font-semibold tabular-nums')],
              [counter.counter.count.toString()],
            ),
            ...(Option.isSome(maybeMode)
              ? [detailModeView(counter.id, maybeMode.value)]
              : []),
          ],
        ),
    }),
  )
}

const interactionClassName = (interaction: Interaction): string => {
  if (interaction.role === 'Destructive') {
    return 'rounded-full border border-red-700 bg-red-950/50 px-4 py-2 text-sm text-red-100'
  }
  if (interaction.role === 'Primary') {
    return 'rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-stone-950'
  } else {
    return 'rounded-full border border-stone-700 bg-stone-900 px-4 py-2 text-sm text-stone-200'
  }
}

const interactionsView = (interactions: ReadonlyArray<Interaction>): Html => {
  const h = html<Message>()
  return h.section(
    [h.AriaLabel('Available actions'), h.Class('space-y-3')],
    [
      h.h2(
        [h.Class('text-sm font-medium text-stone-300')],
        ['Available actions'],
      ),
      h.div(
        [h.Class('flex flex-wrap gap-2')],
        Array.map(interactions, interaction =>
          h.button(
            [
              h.Class(interactionClassName(interaction)),
              h.OnClick(interaction.message),
            ],
            [interaction.label],
          ),
        ),
      ),
    ],
  )
}

/** Renders the shared Multiple Counters Program with Foldkit HTML. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  return {
    title: 'Foldkit | Multiple Counters',
    body: h.main(
      [h.Class('min-h-screen bg-stone-950 px-5 py-12 text-stone-100')],
      [
        h.div(
          [h.Class('mx-auto grid w-full max-w-3xl gap-8')],
          [
            h.header(
              [h.Class('space-y-2')],
              [
                h.p(
                  [
                    h.Class(
                      'font-mono text-xs uppercase tracking-[0.24em] text-amber-400',
                    ),
                  ],
                  ['Foldkit Program'],
                ),
                h.h1(
                  [h.Class('text-4xl font-semibold tracking-tight')],
                  ['Multiple counters'],
                ),
              ],
            ),
            destinationView(destinationForModel(model)),
            interactionsView(interactionsForModel(model)),
          ],
        ),
      ],
    ),
  }
}
