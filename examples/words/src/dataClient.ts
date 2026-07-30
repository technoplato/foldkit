import { Array, Context, Effect, Layer, Option, Schema as S } from 'effect'

import {
  HttpWordsDataFailure,
  InvalidWordsDataFailure,
  MismatchedWordsDataFailure,
  NetworkWordsDataFailure,
  type Word,
  WordsData,
  type WordsDataFailure,
} from './model.js'
import { type RecordingSegmentRoute, dataPathForRoute } from './route.js'

/** The browser fetch capability accepted by the live data adapter. */
export type FetchWordsDataRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

/** The side-effecting route-local data capability required by the Program. */
export type WordsDataClientService = Readonly<{
  fetch: (
    route: RecordingSegmentRoute,
  ) => Effect.Effect<WordsData, WordsDataFailure>
}>

/** An injected source for route-local version 1 Words data. */
export class WordsDataClient extends Context.Service<
  WordsDataClient,
  WordsDataClientService
>()('Words/WordsDataClient') {}

const unknownReason = (cause: unknown): string =>
  cause instanceof Error ? cause.message : globalThis.String(cause)

const timelineFailure = (words: ReadonlyArray<Word>): Option.Option<string> => {
  const result = Array.reduce(
    words,
    {
      maybePreviousStart: Option.none<number>(),
      maybeReason: Option.none<string>(),
    },
    (state, word) => {
      if (Option.isSome(state.maybeReason)) {
        return state
      } else if (word.end <= word.start) {
        return {
          ...state,
          maybeReason: Option.some(`Word ${word.id} must end after it starts.`),
        }
      } else if (
        Option.isSome(state.maybePreviousStart) &&
        word.start < state.maybePreviousStart.value
      ) {
        return {
          ...state,
          maybeReason: Option.some('Words are not ordered by start time.'),
        }
      } else {
        return {
          maybePreviousStart: Option.some(word.start),
          maybeReason: Option.none(),
        }
      }
    },
  )
  if (Option.isSome(result.maybeReason)) {
    return result.maybeReason
  }

  const wordIDs = Array.map(words, word => word.id)
  if (new Set(wordIDs).size !== wordIDs.length) {
    return Option.some('Word ids must be unique within a payload.')
  }
  return Option.none()
}

const semanticFailure = (data: WordsData): Option.Option<string> => {
  const maybeTimelineFailure = timelineFailure(data.words)
  if (Option.isSome(maybeTimelineFailure)) {
    return maybeTimelineFailure
  }
  if (!data.audio.url.startsWith('/') || data.audio.url.startsWith('//')) {
    return Option.some('The audio URL must be an origin-relative path.')
  }
  const duration = data.audio.duration
  if (
    duration !== undefined &&
    Array.some(data.words, word => word.end > duration)
  ) {
    return Option.some('A word ends after the declared audio duration.')
  }
  return Option.none()
}

const validateWordsData = (
  route: RecordingSegmentRoute,
  data: WordsData,
): Effect.Effect<WordsData, WordsDataFailure> => {
  if (
    data.recordingID !== route.recordingID ||
    data.segmentRangeID !== route.segmentRangeID
  ) {
    return Effect.fail(
      MismatchedWordsDataFailure.make({
        expectedRecordingID: route.recordingID,
        expectedSegmentRangeID: route.segmentRangeID,
        actualRecordingID: data.recordingID,
        actualSegmentRangeID: data.segmentRangeID,
      }),
    )
  }

  const maybeSemanticFailure = semanticFailure(data)
  if (Option.isSome(maybeSemanticFailure)) {
    return Effect.fail(
      InvalidWordsDataFailure.make({ reason: maybeSemanticFailure.value }),
    )
  }
  return Effect.succeed(data)
}

const decodeWordsData = S.decodeUnknownEffect(WordsData)
const decodeWordsDataOption = S.decodeUnknownOption(WordsData)

/** Decodes and semantically validates an unknown progressive-enhancement payload. */
export const decodeWordsPayload = (
  payload: unknown,
): Option.Option<WordsData> => {
  const maybeData = decodeWordsDataOption(payload)
  if (Option.isNone(maybeData)) {
    return Option.none()
  }
  return Option.isNone(semanticFailure(maybeData.value))
    ? maybeData
    : Option.none()
}

/** Creates a Words data adapter around a browser-compatible fetch function. */
export const makeWordsDataClient = (
  fetchRequest: FetchWordsDataRequest,
): WordsDataClientService => ({
  fetch: route =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetchRequest(dataPathForRoute(route), {
            headers: { accept: 'application/json' },
          }),
        catch: cause =>
          NetworkWordsDataFailure.make({ reason: unknownReason(cause) }),
      })
      if (!response.ok) {
        return yield* Effect.fail(
          HttpWordsDataFailure.make({
            status: response.status,
            statusText: response.statusText,
          }),
        )
      }

      const payload = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: cause =>
          InvalidWordsDataFailure.make({ reason: unknownReason(cause) }),
      })
      const data = yield* Effect.mapError(decodeWordsData(payload), error =>
        InvalidWordsDataFailure.make({ reason: error.message }),
      )
      return yield* validateWordsData(route, data)
    }),
})

/** The live browser Layer for same-origin Words data requests. */
export const WordsDataClientLive = Layer.succeed(
  WordsDataClient,
  makeWordsDataClient(globalThis.fetch.bind(globalThis)),
)
