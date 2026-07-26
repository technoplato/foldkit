import { Match as M, Schema as S } from 'effect'

/** One Fact returned by the injected side-effecting client. */
export const Fact = S.Struct({
  requestId: S.String,
  text: S.String,
})
/** One Fact returned by the injected side-effecting client. */
export type Fact = typeof Fact.Type

/** The Fact Program has not requested a Fact yet. */
export const Idle = S.TaggedStruct('Idle', {})
/** The Fact Program is waiting for its request Command to complete. */
export const Loading = S.TaggedStruct('Loading', {})
/** The Fact Program received one Fact from its request Command. */
export const Loaded = S.TaggedStruct('Loaded', { fact: Fact })
/** The Fact Program received a typed request failure. */
export const Failed = S.TaggedStruct('Failed', { reason: S.String })

/** The complete renderer-independent Fact Model. */
export const Model = S.Union([Idle, Loading, Loaded, Failed])
/** The complete renderer-independent Fact Model. */
export type Model = typeof Model.Type

/** Returns the primary host-neutral text for the Fact Model. */
export const displayForModel = (model: Model): string =>
  M.value(model).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Idle: () => 'Ready for a fact',
      Loading: () => 'Requesting a fact…',
      Loaded: ({ fact }) => fact.text,
      Failed: () => 'Unable to load a fact',
    }),
  )

/** Returns request provenance or failure detail for the Fact Model. */
export const detailForModel = (model: Model): string =>
  M.value(model).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Idle: () => 'No network request has run yet',
      Loading: () => 'FetchFact is running through the host Layer',
      Loaded: ({ fact }) => `request ${fact.requestId}`,
      Failed: ({ reason }) => reason,
    }),
  )
