import { Effect, Option, Queue, Schema as S, Stream } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'
import { Command, Http } from 'foldkit'
import { load, pushUrl, replaceUrl } from 'foldkit/navigation'

import {
  AnswerLog,
  AnswersIndex,
  Deck,
  ExploreScope,
  SlideFilter,
  SlideId,
  decodeDeck,
  formatLoadError,
  previewOf,
} from './domain'
import {
  CompletedLoadExternal,
  CompletedNavigateInternal,
  FailedFetchAnswer,
  FailedFetchAnswers,
  FailedFetchDeck,
  FailedFetchFile,
  FailedSaveAnswer,
  FailedSaveDeck,
  HeardWatch,
  MissedFetchAnswer,
  SucceededFetchAnswer,
  SucceededFetchAnswers,
  SucceededFetchDeck,
  SucceededFetchFile,
  SucceededSaveAnswer,
  SucceededSaveDeck,
} from './message'
import { slideHref } from './route'

export { previewOf }

const decodeAnswerLog = (value: unknown) =>
  S.decodeUnknownEffect(AnswerLog)(value).pipe(
    Effect.mapError(() => 'Could not read the answer log'),
  )

export const NavigateInternal = Command.define(
  'NavigateInternal',
  { url: S.String },
  CompletedNavigateInternal,
)(({ url }) => pushUrl(url).pipe(Effect.as(CompletedNavigateInternal())))

export const ReplaceInternal = Command.define(
  'ReplaceInternal',
  { url: S.String },
  CompletedNavigateInternal,
)(({ url }) => replaceUrl(url).pipe(Effect.as(CompletedNavigateInternal())))

export const LoadExternal = Command.define(
  'LoadExternal',
  { href: S.String },
  CompletedLoadExternal,
)(({ href }) => load(href).pipe(Effect.as(CompletedLoadExternal())))

const fetchDeckEffect = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const response = yield* client.execute(HttpClientRequest.get('/deck.json'))
  if (response.status === 404) {
    return FailedFetchDeck({ error: 'missing' })
  }
  if (response.status !== 200) {
    return FailedFetchDeck({
      error: `GET /deck.json returned HTTP ${response.status}.`,
    })
  }
  const value = yield* response.json
  const deck = yield* decodeDeck(value)
  return SucceededFetchDeck({ deck })
}).pipe(
  Effect.catch((error: unknown) =>
    Effect.succeed(FailedFetchDeck({ error: formatLoadError(error) })),
  ),
)

export const FetchDeck = Command.define(
  'FetchDeck',
  SucceededFetchDeck,
  FailedFetchDeck,
)(Effect.provide(fetchDeckEffect, Http.layer))

const saveDeckEffect = (deck: Deck) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.execute(
      HttpClientRequest.put('/deck.json').pipe(
        HttpClientRequest.setHeader('content-type', 'application/json'),
        HttpClientRequest.bodyText(JSON.stringify(deck, null, 2)),
      ),
    )
    if (response.status !== 200) {
      return FailedSaveDeck({ error: `HTTP ${response.status}` })
    }
    return SucceededSaveDeck({ deck })
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(FailedSaveDeck({ error: 'Could not write deck.json' })),
    ),
  )

export const SaveDeck = Command.define(
  'SaveDeck',
  { deck: Deck },
  SucceededSaveDeck,
  FailedSaveDeck,
)(({ deck }) => Effect.provide(saveDeckEffect(deck), Http.layer))

const saveAnswerBody = (
  text: string,
  maybeExploreScope: Option.Option<ExploreScope>,
  asNote: boolean,
): string => {
  if (Option.isSome(maybeExploreScope)) {
    if (asNote) {
      return JSON.stringify({
        verbatim: text,
        scope: maybeExploreScope.value,
        asNote: true,
      })
    }
    return JSON.stringify({
      verbatim: text,
      scope: maybeExploreScope.value,
    })
  }
  if (asNote) {
    return JSON.stringify({ verbatim: text, asNote: true })
  }
  return JSON.stringify({ verbatim: text })
}

const saveAnswerEffect = (
  slideId: SlideId,
  text: string,
  maybeExploreScope: Option.Option<ExploreScope>,
  asNote: boolean,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.execute(
      HttpClientRequest.post(`/answers/${slideId}`).pipe(
        HttpClientRequest.setHeader('content-type', 'application/json'),
        HttpClientRequest.bodyText(
          saveAnswerBody(text, maybeExploreScope, asNote),
        ),
      ),
    )
    if (response.status !== 200) {
      return FailedSaveAnswer({ error: `HTTP ${response.status}` })
    }
    const value = yield* response.json
    const log = yield* decodeAnswerLog(value)
    return SucceededSaveAnswer({ log })
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(FailedSaveAnswer({ error: 'Could not write the answer' })),
    ),
  )

export const SaveAnswer = Command.define(
  'SaveAnswer',
  {
    slideId: SlideId,
    text: S.String,
    maybeExploreScope: S.Option(ExploreScope),
    asNote: S.Boolean,
  },
  SucceededSaveAnswer,
  FailedSaveAnswer,
)(({ slideId, text, maybeExploreScope, asNote }) =>
  Effect.provide(
    saveAnswerEffect(slideId, text, maybeExploreScope, asNote),
    Http.layer,
  ),
)

const fetchFileEffect = (file: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.execute(
      HttpClientRequest.get(`/${file}`),
    )
    if (response.status !== 200) {
      return FailedFetchFile({
        file,
        error: `GET /${file} returned HTTP ${response.status}.`,
      })
    }
    const text = yield* response.text
    return SucceededFetchFile({ file, text })
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(
        FailedFetchFile({ file, error: `Could not read /${file}` }),
      ),
    ),
  )

export const FetchFile = Command.define(
  'FetchFile',
  { file: S.String },
  SucceededFetchFile,
  FailedFetchFile,
)(({ file }) => Effect.provide(fetchFileEffect(file), Http.layer))

const fetchAnswerEffect = (slideId: SlideId) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.execute(
      HttpClientRequest.get(`/answers/${slideId}`),
    )
    if (response.status === 404) {
      return MissedFetchAnswer({ slideId })
    }
    if (response.status !== 200) {
      return FailedFetchAnswer({ error: `HTTP ${response.status}` })
    }
    const value = yield* response.json
    const log = yield* decodeAnswerLog(value)
    return SucceededFetchAnswer({ log })
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(FailedFetchAnswer({ error: 'Could not read the answer' })),
    ),
  )

export const FetchAnswer = Command.define(
  'FetchAnswer',
  { slideId: SlideId },
  SucceededFetchAnswer,
  MissedFetchAnswer,
  FailedFetchAnswer,
)(({ slideId }) => Effect.provide(fetchAnswerEffect(slideId), Http.layer))

const fetchAnswersEffect = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const response = yield* client.execute(HttpClientRequest.get('/answers'))
  if (response.status !== 200) {
    return FailedFetchAnswers({
      error: `GET /answers returned HTTP ${response.status}.`,
    })
  }
  const value = yield* response.json
  const index = yield* S.decodeUnknownEffect(AnswersIndex)(value).pipe(
    Effect.mapError(() => 'Could not read the answer index'),
  )
  return SucceededFetchAnswers({ logs: index.logs })
}).pipe(
  Effect.catch(() =>
    Effect.succeed(FailedFetchAnswers({ error: 'Could not read answers' })),
  ),
)

export const FetchAnswers = Command.define(
  'FetchAnswers',
  SucceededFetchAnswers,
  FailedFetchAnswers,
)(Effect.provide(fetchAnswersEffect, Http.layer))

export const maybeFetchAnswer = (slideId: SlideId) => [FetchAnswer({ slideId })]

export const maybeReplaceFirstSlide = (
  maybeSlide: Option.Option<{ id: SlideId }>,
  filter: SlideFilter,
) => {
  if (Option.isNone(maybeSlide)) {
    return []
  }
  return [
    ReplaceInternal({
      url: slideHref(maybeSlide.value.id, filter),
    }),
  ]
}

/** EventSource for `/watch`. Emits when deck.json or an answer log changes. */
export const watchStream = Stream.callback<ReturnType<typeof HeardWatch>>(
  queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const source = new EventSource('/watch')
        const onMessage = (event: MessageEvent<string>) => {
          if (event.data === 'deck' || event.data === 'answers') {
            Queue.offerUnsafe(queue, HeardWatch({ kind: event.data }))
          }
        }
        source.addEventListener('message', onMessage)
        return { source, onMessage }
      }),
      ({ source, onMessage }) =>
        Effect.sync(() => {
          source.removeEventListener('message', onMessage)
          source.close()
        }),
    ).pipe(Effect.flatMap(() => Effect.never)),
)
