import {
  type CounterDetailMode,
  type CounterFactStatus,
  type CounterRow,
  type Interaction,
  type Model,
  MultipleCountersInteractionGraph,
  destinationForModel,
  interactionMessageCategory,
  navigationToPath,
} from 'counters-core-example'
import { Array, Match as M, Option, Result } from 'effect'
import { InteractionGraph } from 'foldkit'
import { type Document, type Html, html } from 'foldkit/html'

import { PerformedMultipleCountersInteraction } from './clientInput.js'

type BrowserAction = InteractionGraph.InteractionAction<Interaction>
type BrowserActions = Readonly<{
  actions: ReadonlyArray<BrowserAction>
  isNavigationEnabled: boolean
}>

/** Processor-local capabilities that affect presentation without changing Program state. */
export type MultipleCountersV3BrowserViewCapabilities = Readonly<{
  isNavigationEnabled: boolean
}>

const actionForToken = (
  actions: BrowserActions,
  token: string,
): Option.Option<BrowserAction> =>
  Array.findFirst(
    actions.actions,
    action =>
      action.descriptor.token === token &&
      action.availability._tag === 'Available',
  )

const actionButton = (
  actions: BrowserActions,
  token: string,
  label: string,
  className: string,
): Html => {
  const h =
    html<import('./clientInput.js').MultipleCountersV3BrowserClientInput>()
  const maybeAction = actionForToken(actions, token)
  if (Option.isNone(maybeAction)) {
    return h.span([], [])
  }
  const isEnabled =
    interactionMessageCategory(maybeAction.value.descriptor) === 'Domain' ||
    actions.isNavigationEnabled
  if (!isEnabled) {
    return h.button(
      [
        h.Class(className),
        h.Disabled(true),
        h.AriaLabel(`${label} unavailable`),
      ],
      [label],
    )
  }
  return h.button(
    [
      h.Class(className),
      h.OnClick(
        PerformedMultipleCountersInteraction.make({
          reference: maybeAction.value.reference,
        }),
      ),
    ],
    [label],
  )
}

const counterRow = (counter: CounterRow, actions: BrowserActions): Html => {
  const h =
    html<import('./clientInput.js').MultipleCountersV3BrowserClientInput>()
  return h.keyed('article')(
    counter.id,
    [h.Class('v3-counter-row')],
    [
      actionButton(
        actions,
        `open:${counter.id}`,
        counter.id,
        'v3-counter-identity',
      ),
      h.output(
        [h.Class('v3-counter-value')],
        [counter.counter.count.toString()],
      ),
      h.div(
        [h.Class('v3-row-actions')],
        [
          actionButton(
            actions,
            `decrement:${counter.id}`,
            '−',
            'v3-counter-button',
          ),
          actionButton(
            actions,
            `increment:${counter.id}`,
            '+',
            'v3-counter-button',
          ),
          actionButton(
            actions,
            `open:${counter.id}`,
            'Details',
            'v3-secondary-button',
          ),
          actionButton(
            actions,
            `delete:${counter.id}`,
            'Delete',
            'v3-destructive-button',
          ),
        ],
      ),
    ],
  )
}

const factStatus = (status: CounterFactStatus): Html => {
  const h =
    html<import('./clientInput.js').MultipleCountersV3BrowserClientInput>()
  return M.value(status).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      LoadingCounterFact: () => h.p([], ['Loading counter fact…']),
      LoadedCounterFact: ({ fact }) =>
        h.div(
          [],
          [
            h.h2([], [`Counter fact for ${fact.number.toString()}`]),
            h.p([], [fact.text]),
          ],
        ),
      FailedCounterFact: ({ reason }) =>
        h.div([], [h.h2([], ['Counter fact unavailable']), h.p([], [reason])]),
    }),
  )
}

const detailMode = (
  counterId: string,
  mode: CounterDetailMode,
  actions: BrowserActions,
): Html => {
  const h =
    html<import('./clientInput.js').MultipleCountersV3BrowserClientInput>()
  return M.value(mode).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      CounterFactAlert: ({ status }) =>
        h.aside(
          [h.AriaLabel('Counter fact'), h.Class('v3-modal v3-fact-modal')],
          [
            factStatus(status),
            actionButton(actions, 'dismiss', 'Dismiss', 'v3-primary-button'),
          ],
        ),
      DeleteCounterConfirmation: () =>
        h.aside(
          [
            h.AriaLabel('Delete counter confirmation'),
            h.Class('v3-modal v3-delete-modal'),
          ],
          [
            h.h2([], [`Delete ${counterId}?`]),
            h.p([], ['This cannot be undone.']),
            h.div(
              [h.Class('v3-modal-actions')],
              [
                actionButton(
                  actions,
                  'cancel',
                  'Cancel',
                  'v3-secondary-button',
                ),
                actionButton(
                  actions,
                  'confirm-delete',
                  'Delete counter',
                  'v3-destructive-button',
                ),
              ],
            ),
          ],
        ),
    }),
  )
}

const detail = (
  counter: CounterRow,
  maybeMode: Option.Option<CounterDetailMode>,
  actions: BrowserActions,
): Html => {
  const h =
    html<import('./clientInput.js').MultipleCountersV3BrowserClientInput>()
  return h.keyed('section')(
    counter.id,
    [h.Class('v3-counter-detail')],
    [
      actionButton(actions, 'back', '← Counters', 'v3-back-button'),
      h.p([h.Class('v3-detail-identity')], [counter.id]),
      h.output(
        [h.Class('v3-detail-value')],
        [counter.counter.count.toString()],
      ),
      ...(Option.isNone(maybeMode)
        ? [
            h.div(
              [h.Class('v3-detail-actions')],
              [
                actionButton(
                  actions,
                  `decrement:${counter.id}`,
                  '−',
                  'v3-counter-button',
                ),
                actionButton(
                  actions,
                  `increment:${counter.id}`,
                  '+',
                  'v3-counter-button',
                ),
                actionButton(actions, 'reset', 'Reset', 'v3-secondary-button'),
                actionButton(
                  actions,
                  'fact',
                  'Show counter fact',
                  'v3-primary-button',
                ),
                actionButton(
                  actions,
                  'delete',
                  'Delete counter',
                  'v3-destructive-button',
                ),
              ],
            ),
          ]
        : [detailMode(counter.id, maybeMode.value, actions)]),
    ],
  )
}

/** Renders the optimistic Multiple Counters Model through native Foldkit HTML. */
export const multipleCountersV3BrowserView = (
  model: Model,
  capabilities: MultipleCountersV3BrowserViewCapabilities = {
    isNavigationEnabled: true,
  },
): Document => {
  const h =
    html<import('./clientInput.js').MultipleCountersV3BrowserClientInput>()
  const projection = MultipleCountersInteractionGraph.project(model)
  if (Result.isFailure(projection)) {
    return {
      title: 'Foldkit | Multiple Counters unavailable',
      body: h.main(
        [h.Class('v3-program-shell')],
        [
          h.h1([], ['Interaction projection failed']),
          h.p([h.Class('error')], [projection.failure._tag]),
        ],
      ),
    }
  }
  const projectedActions = Array.filter(
    InteractionGraph.interactiveNodes(projection.success.root),
    (node): node is BrowserAction => node._tag === 'InteractionAction',
  )
  const actions: BrowserActions = {
    actions: projectedActions,
    isNavigationEnabled: capabilities.isNavigationEnabled,
  }
  const destination = destinationForModel(model)
  const content = M.value(destination).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      CounterListDestination: ({ counters }) =>
        h.section(
          [h.Class('v3-counter-list')],
          [
            h.div(
              [h.Class('v3-list-heading')],
              [
                h.h2([], ['Counters']),
                actionButton(
                  actions,
                  'add',
                  'Add counter',
                  'v3-primary-button',
                ),
              ],
            ),
            ...Array.map(counters, counter => counterRow(counter, actions)),
          ],
        ),
      CounterDetailDestination: ({ counter, maybeMode }) =>
        detail(counter, maybeMode, actions),
    }),
  )
  return {
    title: 'Foldkit | Instant Multiple Counters',
    canonical: `${window.location.origin}${navigationToPath(model.navigation)}`,
    body: h.main(
      [h.Class('v3-program-shell')],
      [
        h.header(
          [h.Class('v3-program-header')],
          [
            h.div(
              [],
              [
                h.p([h.Class('eyebrow')], ['Foldkit Program | InstantDB']),
                h.h1([], ['Multiple counters']),
                h.p(
                  [h.Class('muted')],
                  ['Optimistic here. Authenticated and accepted everywhere.'],
                ),
              ],
            ),
            h.code(
              [h.Class('v3-destination-uri')],
              [navigationToPath(model.navigation)],
            ),
          ],
        ),
        content,
      ],
    ),
  }
}
