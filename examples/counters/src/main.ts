import {
  type CounterDetailMode,
  type CounterFactStatus,
  type Destination,
  Message,
  type Model,
  MultipleCountersInteractionGraph,
  destinationForModel,
} from 'counters-core-example'
import {
  Array,
  Effect,
  Match as M,
  Option,
  Queue,
  Result,
  Stream,
} from 'effect'
import { InteractionGraph, Mount } from 'foldkit'
import { Document, Html, html } from 'foldkit/html'

import {
  type HtmlClientResolutionError,
  type HtmlInteractionAction,
  nextHtmlOccurrenceId,
  resolveHtmlInteraction,
  resolveHtmlNavigationCarrier,
} from './client'

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

const interactionClassName = (role: HtmlInteractionAction['role']): string => {
  if (role === 'Destructive') {
    return 'rounded-full border border-red-700 bg-red-950/50 px-4 py-2 text-sm text-red-100'
  }
  if (role === 'Primary') {
    return 'rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-stone-950'
  } else {
    return 'rounded-full border border-stone-700 bg-stone-900 px-4 py-2 text-sm text-stone-200'
  }
}

/** The DOM identity of the Foldkit HTML Client's local failure surface. */
export const htmlClientResolutionErrorElementId =
  'multiple-counters-client-resolution-error'

/** Reflects one Client-local failure without adding it to Program history. */
export const reflectHtmlClientResolutionError = (
  maybeError: Option.Option<HtmlClientResolutionError>,
): void => {
  const element = document.getElementById(htmlClientResolutionErrorElementId)
  if (!(element instanceof HTMLOutputElement)) {
    return
  }
  element.hidden = Option.isNone(maybeError)
  element.textContent = Option.isSome(maybeError) ? maybeError.value._tag : ''
}

/** Client-local dependencies used by one Foldkit HTML view instance. */
export type HtmlViewConfig = Readonly<{
  nextOccurrenceId?: () => InteractionGraph.InteractionOccurrenceId
  reconcileNavigationCarrier?: () => void
}>

/** Creates one Foldkit HTML view with event-boundary interaction resolution. */
export const makeView = (config: HtmlViewConfig = {}) => {
  const currentModel = { value: Option.none<Model>() }
  const currentResolutionError = {
    value: Option.none<HtmlClientResolutionError>(),
  }
  const readModel = (): Model => {
    if (Option.isSome(currentModel.value)) {
      return currentModel.value.value
    }
    throw new Error('The Foldkit HTML Client has not rendered a Model')
  }
  const reportResolutionError = (error: HtmlClientResolutionError): void => {
    currentResolutionError.value = Option.some(error)
    reflectHtmlClientResolutionError(Option.some(error))
  }
  const clearResolutionError = (): void => {
    currentResolutionError.value = Option.none()
    reflectHtmlClientResolutionError(Option.none())
  }
  const nextOccurrenceId = config.nextOccurrenceId ?? nextHtmlOccurrenceId
  const interactionReferenceAttribute =
    'data-multiple-counters-interaction-reference'
  const renderedActions = {
    value: new Map<string, HtmlInteractionAction>(),
  }
  const ObserveMultipleCountersClientEvents = Mount.defineStream(
    'ObserveMultipleCountersClientEvents',
    Message,
  )(element =>
    Stream.callback<Message>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const enqueueCarrier = (
            carrier: string,
            isReconciling: boolean,
          ): void => {
            const resolved = resolveHtmlNavigationCarrier(
              readModel(),
              carrier,
              nextOccurrenceId(),
            )
            if (Result.isFailure(resolved)) {
              reportResolutionError(resolved.failure)
            } else {
              clearResolutionError()
              if (isReconciling) {
                config.reconcileNavigationCarrier?.()
              }
              Queue.offerUnsafe(queue, resolved.success)
            }
          }
          const openedHistoryEntry = () =>
            enqueueCarrier(window.location.pathname, true)
          const activateClientEvent = (event: Event) => {
            const target = event.target
            if (!(target instanceof Element)) {
              return
            }
            const actionElement = target.closest(
              `[${interactionReferenceAttribute}]`,
            )
            const referenceKey = actionElement?.getAttribute(
              interactionReferenceAttribute,
            )
            if (referenceKey !== null && referenceKey !== undefined) {
              const action = renderedActions.value.get(referenceKey)
              if (action === undefined) {
                return
              }
              const resolved = resolveHtmlInteraction(
                readModel(),
                action,
                nextOccurrenceId(),
              )
              if (Result.isFailure(resolved)) {
                reportResolutionError(resolved.failure)
              } else {
                clearResolutionError()
                Queue.offerUnsafe(queue, resolved.success)
              }
              return
            }
            if (!(event instanceof MouseEvent)) {
              return
            }
            const isNonPrimaryButton = event.button !== 0
            const isModifierKeyPressed =
              event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
            if (
              isNonPrimaryButton ||
              isModifierKeyPressed ||
              event.defaultPrevented
            ) {
              return
            }
            const link = target.closest('a')
            if (
              link === null ||
              link.href.length === 0 ||
              (link.target.length > 0 && link.target !== '_self') ||
              link.hasAttribute('download')
            ) {
              return
            }
            const nextUrl = new URL(link.href)
            if (nextUrl.origin !== window.location.origin) {
              return
            }
            event.preventDefault()
            enqueueCarrier(nextUrl.pathname, false)
          }
          element.addEventListener('click', activateClientEvent)
          window.addEventListener('popstate', openedHistoryEntry)
          enqueueCarrier(window.location.pathname, true)
          return { activateClientEvent, openedHistoryEntry }
        }),
        ({ activateClientEvent, openedHistoryEntry }) =>
          Effect.sync(() => {
            element.removeEventListener('click', activateClientEvent)
            window.removeEventListener('popstate', openedHistoryEntry)
          }),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  )
  const interactionsView = (model: Model): Html => {
    const h = html<Message>()
    const projected = MultipleCountersInteractionGraph.project(model)
    if (Result.isFailure(projected)) {
      renderedActions.value = new Map()
      return h.section(
        [h.AriaLabel('Available actions'), h.Class('space-y-3')],
        [
          h.h2(
            [h.Class('text-sm font-medium text-red-300')],
            ['Interaction projection unavailable'],
          ),
          h.p([h.Class('text-sm text-red-200/70')], [projected.failure._tag]),
        ],
      )
    }
    const actions = Array.filter(
      InteractionGraph.interactiveNodes(projected.success.root),
      (node): node is HtmlInteractionAction =>
        node._tag === 'InteractionAction',
    )
    renderedActions.value = new Map(
      Array.map(actions, action => [
        InteractionGraph.interactionReferenceKey(action.reference),
        action,
      ]),
    )
    return h.section(
      [h.AriaLabel('Available actions'), h.Class('space-y-3')],
      [
        h.h2(
          [h.Class('text-sm font-medium text-stone-300')],
          ['Available actions'],
        ),
        h.div(
          [h.Class('flex flex-wrap gap-2')],
          Array.map(actions, action =>
            h.keyed('button')(
              InteractionGraph.interactionReferenceKey(action.reference),
              [
                h.Class(interactionClassName(action.role)),
                h.DataAttribute(
                  'multiple-counters-interaction-reference',
                  InteractionGraph.interactionReferenceKey(action.reference),
                ),
              ],
              [action.label],
            ),
          ),
        ),
      ],
    )
  }
  const render = (model: Model): Document => {
    currentModel.value = Option.some(model)
    const h = html<Message>()
    const maybeResolutionError = currentResolutionError.value
    return {
      title: 'Foldkit | Multiple Counters',
      body: h.main(
        [
          h.Class('min-h-screen bg-stone-950 px-5 py-12 text-stone-100'),
          h.OnMount(ObserveMultipleCountersClientEvents()),
        ],
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
              h.output(
                [
                  h.Id(htmlClientResolutionErrorElementId),
                  h.Role('alert'),
                  h.AriaLive('assertive'),
                  h.Hidden(Option.isNone(maybeResolutionError)),
                  h.Class('text-sm text-red-300'),
                ],
                [
                  Option.isSome(maybeResolutionError)
                    ? maybeResolutionError.value._tag
                    : '',
                ],
              ),
              destinationView(destinationForModel(model)),
              interactionsView(model),
            ],
          ),
        ],
      ),
    }
  }
  return Object.assign(render, { ObserveMultipleCountersClientEvents })
}

/** Renders the shared Multiple Counters Program with Foldkit HTML. */
export const view = makeView()
