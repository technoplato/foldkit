import * as Counter from 'counter-core-example'
import { Array, Schema as S } from 'effect'

// MODEL

const identityToken = '[A-Za-z0-9_-]+'
const identityMaxLength = 112

const prefixedIdentity = (prefix: string) =>
  S.String.check(
    S.isLengthBetween(prefix.length + 2, identityMaxLength),
    S.isPattern(
      new RegExp(`^${prefix}-${identityToken}(?::${identityToken})*$`, 'u'),
    ),
  )

const uniqueKeysIssue = (
  keys: ReadonlyArray<string>,
  path: ReadonlyArray<PropertyKey>,
  issue: string,
) => (new Set(keys).size === Array.length(keys) ? undefined : { path, issue })

/** A stable, bounded identity for one Counter Submodel. */
export const CounterId = prefixedIdentity('counter')
/** A stable, bounded identity for one Counter Submodel. */
export type CounterId = typeof CounterId.Type

/** A transient identity for one presentation of a Counter detail. */
export const CounterDetailPresentationId = prefixedIdentity('detail')
/** A transient identity for one presentation of a Counter detail. */
export type CounterDetailPresentationId =
  typeof CounterDetailPresentationId.Type

/** A stable identity for one counter-fact request generation. */
export const CounterFactRequestId = prefixedIdentity('fact')
/** A stable identity for one counter-fact request generation. */
export type CounterFactRequestId = typeof CounterFactRequestId.Type

/** A stable identity for one delete-confirmation generation. */
export const DeleteCounterConfirmationId = prefixedIdentity('delete')
/** A stable identity for one delete-confirmation generation. */
export type DeleteCounterConfirmationId =
  typeof DeleteCounterConfirmationId.Type

/** One deterministic number-specific fact presented by the Program. */
export const CounterFact = S.Struct({
  number: S.Number,
  text: S.String,
})
/** One number-specific fact. */
export type CounterFact = typeof CounterFact.Type

/** Why one counter-fact fetch failed. */
export const FactFailureCause = S.Literals(['Network', 'Unreadable'])
/** Why one counter-fact fetch failed. */
export type FactFailureCause = typeof FactFailureCause.Type

/** A counter fact request is in flight. */
export const LoadingCounterFact = S.TaggedStruct('LoadingCounterFact', {})
/** A counter fact request completed. */
export const LoadedCounterFact = S.TaggedStruct('LoadedCounterFact', {
  fact: CounterFact,
})
/** A counter fact request failed. */
export const FailedCounterFact = S.TaggedStruct('FailedCounterFact', {
  cause: FactFailureCause,
})

/** Every state of a counter fact request. */
export const CounterFactStatus = S.Union([
  LoadingCounterFact,
  LoadedCounterFact,
  FailedCounterFact,
])
/** Every state of a counter fact request. */
export type CounterFactStatus = typeof CounterFactStatus.Type

/** Presents the fact alert for the selected counter. */
export const CounterFactAlert = S.TaggedStruct('CounterFactAlert', {
  requestId: CounterFactRequestId,
  status: CounterFactStatus,
})
/** Presents the delete confirmation for the selected counter. */
export const DeleteCounterConfirmation = S.TaggedStruct(
  'DeleteCounterConfirmation',
  {
    confirmationId: DeleteCounterConfirmationId,
  },
)

/** The mutually exclusive mode presented over a counter detail. */
export const CounterDetailMode = S.Union([
  CounterFactAlert,
  DeleteCounterConfirmation,
])
/** The mutually exclusive mode presented over a counter detail. */
export type CounterDetailMode = typeof CounterDetailMode.Type

/** The counter list is visible. */
export const CounterList = S.TaggedStruct('CounterList', {})
/** One counter detail is visible, with at most one presentation mode. */
export const CounterDetail = S.TaggedStruct('CounterDetail', {
  counterId: CounterId,
  maybeMode: S.Option(CounterDetailMode),
  presentationId: CounterDetailPresentationId,
})

/** Every representable navigation destination. */
export const Navigation = S.Union([CounterList, CounterDetail])
/** Every representable navigation destination. */
export type Navigation = typeof Navigation.Type

/** One identified Counter Submodel in the list. */
export const CounterRow = S.Struct({
  id: CounterId,
  child: Counter.Model,
})
/** One identified Counter Submodel in the list. */
export type CounterRow = typeof CounterRow.Type

/** The maximum number of Counters representable in one Program session. */
export const maximumCounterCount = 100
/** The maximum number of Counter identities allocatable in one session. */
export const maximumCounterIdentityCount = 1_000

/** A bounded collection of uniquely identified Counter Submodels. */
const CounterRows = S.Array(CounterRow)
  .check(S.isLengthBetween(0, maximumCounterCount))
  .check(
    S.makeFilter(rows =>
      uniqueKeysIssue(
        Array.map(rows, row => row.id),
        ['rows'],
        'Counter ids must be unique',
      ),
    ),
  )

/** Counter identities retired permanently after deletion. */
export const RetiredCounterIds = S.Array(CounterId)
  .check(S.isLengthBetween(0, maximumCounterIdentityCount))
  .check(
    S.makeFilter(counterIds =>
      uniqueKeysIssue(
        counterIds,
        ['retiredCounterIds'],
        'Retired Counter ids must be unique',
      ),
    ),
  )

const CounterIdentityFields = {
  retiredCounterIds: RetiredCounterIds,
  rows: CounterRows,
}

const CounterIdentityState = S.Struct(CounterIdentityFields)
type CounterIdentityState = typeof CounterIdentityState.Type

const counterIdentityStateFilter = S.makeFilter(
  (state: CounterIdentityState) => {
    if (
      Array.length(state.rows) + Array.length(state.retiredCounterIds) >
      maximumCounterIdentityCount
    ) {
      return {
        path: ['retiredCounterIds'],
        issue: 'The Counter identity lifetime limit was exceeded',
      }
    }
    const retiredCounterIds = new Set(state.retiredCounterIds)
    return Array.some(state.rows, row => retiredCounterIds.has(row.id))
      ? {
          path: ['rows'],
          issue: 'An active Counter id cannot also be retired',
        }
      : undefined
  },
)

/** The synchronized domain projection shared independently of navigation. */
export const Domain = CounterIdentityState.check(counterIdentityStateFilter)
/** The synchronized domain projection shared independently of navigation. */
export type Domain = typeof Domain.Type

const ModelState = S.Struct({
  ...CounterIdentityFields,
  navigation: Navigation,
  nextId: S.Number,
})
type ModelState = typeof ModelState.Type

const activeDetailNavigationFilter = S.makeFilter((model: ModelState) => {
  if (model.navigation._tag !== 'CounterDetail') {
    return undefined
  }
  const counterId = model.navigation.counterId
  return Array.some(model.rows, row => row.id === counterId)
    ? undefined
    : {
        path: ['navigation', 'counterId'],
        issue: 'Counter detail navigation must name an active Counter',
      }
})

/** The shared renderer-independent Multiple Counters Model. */
export const Model = ModelState.check(
  counterIdentityStateFilter,
  activeDetailNavigationFilter,
)
/** The shared renderer-independent Multiple Counters Model. */
export type Model = typeof Model.Type

/** Projects synchronized domain state without Processor-local navigation. */
export const projectDomain = (model: Model): Domain =>
  Domain.make({
    retiredCounterIds: model.retiredCounterIds,
    rows: model.rows,
  })
