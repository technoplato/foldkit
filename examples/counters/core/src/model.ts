import * as Counter from 'counter-core-example'
import { Schema as S } from 'effect'

// MODEL

/** One number-specific fact returned by the injected fact client. */
export const CounterFact = S.Struct({
  number: S.Number,
  text: S.String,
})
/** One number-specific fact. */
export type CounterFact = typeof CounterFact.Type

/** A counter fact request is in flight. */
export const LoadingCounterFact = S.TaggedStruct('LoadingCounterFact', {})
/** A counter fact request completed. */
export const LoadedCounterFact = S.TaggedStruct('LoadedCounterFact', {
  fact: CounterFact,
})
/** A counter fact request failed. */
export const FailedCounterFact = S.TaggedStruct('FailedCounterFact', {
  reason: S.String,
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
  status: CounterFactStatus,
})
/** Presents the delete confirmation for the selected counter. */
export const DeleteCounterConfirmation = S.TaggedStruct(
  'DeleteCounterConfirmation',
  {},
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
  counterId: S.String,
  maybeMode: S.Option(CounterDetailMode),
})

/** Every representable navigation destination. */
export const Navigation = S.Union([CounterList, CounterDetail])
/** Every representable navigation destination. */
export type Navigation = typeof Navigation.Type

/** One identified Counter Submodel in the list. */
export const CounterRow = S.Struct({
  id: S.String,
  counter: Counter.Model,
})
/** One identified Counter Submodel in the list. */
export type CounterRow = typeof CounterRow.Type

/** The shared renderer-independent Multiple Counters Model. */
export const Model = S.Struct({
  rows: S.Array(CounterRow),
  nextCounterNumber: S.Number,
  navigation: Navigation,
})
/** The shared renderer-independent Multiple Counters Model. */
export type Model = typeof Model.Type
