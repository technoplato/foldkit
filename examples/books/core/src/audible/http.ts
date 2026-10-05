import {
  Array,
  Effect,
  Match as M,
  Option,
  Redacted,
  Ref,
  Schema as S,
  Stream,
  String,
} from 'effect'

import { type AudibleProblem, NotSignedIn, Unavailable } from './problem.js'
import {
  AudibleImportError,
  type AudibleImportShape,
  AudibleLibraryJson,
  type FinishSignIn,
  FinishSignInJson,
  ImportEventJson,
  ImportRequestJson,
  type ImportUpdate,
  ProblemBodyJson,
  StartedSignInJson,
  audibleFinishPath,
  audibleImportPath,
  audibleLibraryPath,
  audibleStartPath,
  importEventName,
} from './service.js'

// HTTP

/**
 * Where a host reaches the Books server: its origin, `''` in a browser on
 * the same origin, and the headers to send with every request, such as a
 * terminal's Cloudflare Access login.
 *
 * @example
 * ```typescript
 * const config: AudibleHttpConfig = { origin: 'https://books.pisspoursoftware.xyz', headers: accessRequestHeaders(token) }
 * ```
 */
export type AudibleHttpConfig = Readonly<{
  origin: string
  headers?: Readonly<Record<string, string>>
  fetch?: typeof globalThis.fetch
}>

const unavailable = (reason: string): AudibleImportError =>
  new AudibleImportError({ problem: Unavailable({ reason }) })

const unreachable = unavailable('Books could not reach its server')

const unreadable = unavailable(
  'the Books server answered something Books cannot read',
)

const unauthorizedStatus = 401

const notFoundStatus = 404

const problemOfStatus = (status: number): AudibleProblem =>
  M.value(status).pipe(
    M.withReturnType<AudibleProblem>(),
    M.when(unauthorizedStatus, () => NotSignedIn()),
    M.when(notFoundStatus, () =>
      Unavailable({ reason: 'this Books server has no Audible import' }),
    ),
    M.orElse(() =>
      Unavailable({ reason: `the Books server answered ${status.toString()}` }),
    ),
  )

const problemOf = (response: Response) =>
  Effect.map(
    Effect.promise(() => response.text().catch(() => '')),
    text =>
      new AudibleImportError({
        problem: Option.match(S.decodeUnknownOption(ProblemBodyJson)(text), {
          onNone: () => problemOfStatus(response.status),
          onSome: body => body.problem,
        }),
      }),
  )

const decodedBody = <A>(
  response: Response,
  schema: S.Codec<A, string>,
): Effect.Effect<A, AudibleImportError> =>
  Effect.flatMap(
    Effect.tryPromise({ try: () => response.text(), catch: () => unreachable }),
    text =>
      Effect.mapError(S.decodeUnknownEffect(schema)(text), () => unreadable),
  )

type ServerEvent = Readonly<{ name: string; data: string }>

type ServerEventDraft = Readonly<{
  maybeName: Option.Option<string>
  data: ReadonlyArray<string>
}>

const emptyDraft: ServerEventDraft = { maybeName: Option.none(), data: [] }

const finishedEventOf = (
  draft: ServerEventDraft,
): ReadonlyArray<ServerEvent> =>
  Array.isReadonlyArrayEmpty(draft.data)
    ? []
    : [
        {
          name: Option.getOrElse(draft.maybeName, () => 'message'),
          data: Array.join(draft.data, '\n'),
        },
      ]

const fieldValueOf = (line: string, field: string): Option.Option<string> =>
  String.startsWith(`${field}:`)(line)
    ? Option.some(String.trimStart(line.slice(field.length + 1)))
    : Option.none()

const nextDraft = (
  draft: ServerEventDraft,
  line: string,
): readonly [ServerEventDraft, ReadonlyArray<ServerEvent>] => {
  if (String.isEmpty(line)) {
    return [emptyDraft, finishedEventOf(draft)]
  } else if (String.startsWith(':')(line)) {
    return [draft, []]
  } else {
    return Option.match(fieldValueOf(line, 'event'), {
      onSome: name => [{ ...draft, maybeName: Option.some(name) }, []],
      onNone: () =>
        Option.match(fieldValueOf(line, 'data'), {
          onSome: data => [
            { ...draft, data: Array.append(draft.data, data) },
            [],
          ],
          onNone: () => [draft, []],
        }),
    })
  }
}

/**
 * The Server-Sent Events in a response body, each with its name and data:
 * `event: import` then `data: {…}` then a blank line is one event. An
 * event the body ends in the middle of is dropped, as the standard says.
 */
const serverEventsOf = (
  body: ReadableStream<Uint8Array>,
): Stream.Stream<ServerEvent, AudibleImportError> =>
  Stream.fromReadableStream({
    evaluate: () => body,
    onError: () => unreachable,
  }).pipe(
    Stream.decodeText,
    Stream.splitLines,
    Stream.mapAccum(() => emptyDraft, nextDraft),
  )

const stoppedEarly = unavailable('the import stopped before it was done')

const decodeImportEvent = S.decodeUnknownOption(ImportEventJson)

const updateOfEvent = (
  event: ServerEvent,
): Effect.Effect<ImportUpdate, AudibleImportError> =>
  Option.match(decodeImportEvent(event.data), {
    onNone: () => Effect.fail(unreadable),
    onSome: importEvent =>
      M.value(importEvent).pipe(
        M.withReturnType<Effect.Effect<ImportUpdate, AudibleImportError>>(),
        M.tagsExhaustive({
          ImportAdvanced: advanced => Effect.succeed(advanced),
          ImportFinished: finished => Effect.succeed(finished),
          ImportStopped: ({ problem }) =>
            Effect.fail(new AudibleImportError({ problem })),
        }),
      ),
  })

const isFinishedUpdate = (update: ImportUpdate): boolean =>
  update._tag === 'ImportFinished'

/**
 * The import's progress from its response body, through to the summary.
 * The server stopping it fails with its problem; a body that ends before
 * the summary, such as a dropped connection, fails with `the import
 * stopped before it was done`.
 */
const importUpdatesOf = (
  body: ReadableStream<Uint8Array>,
): Stream.Stream<ImportUpdate, AudibleImportError> =>
  Stream.unwrap(
    Effect.map(Ref.make(false), isFinished =>
      serverEventsOf(body).pipe(
        Stream.filter(event => event.name === importEventName),
        Stream.mapEffect(updateOfEvent),
        Stream.takeUntil(isFinishedUpdate),
        Stream.tap(update =>
          isFinishedUpdate(update) ? Ref.set(isFinished, true) : Effect.void,
        ),
        Stream.concat(
          Stream.unwrap(
            Effect.map(Ref.get(isFinished), hasFinished =>
              hasFinished ? Stream.empty : Stream.fail(stoppedEarly),
            ),
          ),
        ),
      ),
    ),
  )

/**
 * The Audible import over HTTP, the same for a browser and a terminal:
 * each step is one request to the Books server under `/__books/audible/`,
 * and an import reads its progress as it streams back. The pasted address
 * leaves this host only inside the request that finishes the sign-in.
 *
 * @example
 * ```typescript
 * Layer.succeed(AudibleImport, httpAudibleImport({ origin: '' }))
 * ```
 */
export const httpAudibleImport = (
  config: AudibleHttpConfig,
): AudibleImportShape => {
  const fetchWith = config.fetch ?? globalThis.fetch
  const headers = config.headers ?? {}
  const request = (
    method: 'GET' | 'POST',
    path: string,
    maybeBody: Option.Option<string>,
  ) =>
    Effect.tryPromise({
      try: signal =>
        fetchWith(`${config.origin}${path}`, {
          method,
          credentials: 'same-origin',
          signal,
          headers: {
            ...headers,
            accept: 'application/json, text/event-stream',
            ...(Option.isSome(maybeBody)
              ? { 'content-type': 'application/json' }
              : {}),
          },
          ...(Option.isSome(maybeBody) ? { body: maybeBody.value } : {}),
        }),
      catch: () => unreachable,
    })

  const answered = <A>(
    method: 'GET' | 'POST',
    path: string,
    maybeBody: Option.Option<string>,
    schema: S.Codec<A, string>,
  ): Effect.Effect<A, AudibleImportError> =>
    Effect.flatMap(request(method, path, maybeBody), response =>
      response.ok
        ? decodedBody(response, schema)
        : Effect.flatMap(problemOf(response), Effect.fail),
    )

  const encodeFinish = S.encodeSync(FinishSignInJson)

  const encodeImport = S.encodeSync(ImportRequestJson)

  const drained = (response: Response): Effect.Effect<void> =>
    Effect.asVoid(Effect.promise(() => response.text().catch(() => '')))

  return {
    startSignIn: answered(
      'POST',
      audibleStartPath,
      Option.none(),
      StartedSignInJson,
    ),
    finishSignIn: address => {
      const body: FinishSignIn = { redirectUrl: Redacted.value(address) }
      return Effect.flatMap(
        request('POST', audibleFinishPath, Option.some(encodeFinish(body))),
        response =>
          response.ok
            ? drained(response)
            : Effect.flatMap(problemOf(response), Effect.fail),
      )
    },
    readLibrary: answered(
      'GET',
      audibleLibraryPath,
      Option.none(),
      AudibleLibraryJson,
    ),
    importTitles: asins =>
      Stream.unwrap(
        Effect.flatMap(
          request(
            'POST',
            audibleImportPath,
            Option.some(encodeImport({ asins })),
          ),
          response => {
            if (!response.ok) {
              return Effect.flatMap(problemOf(response), Effect.fail)
            } else if (response.body === null) {
              return Effect.fail(unreachable)
            } else {
              return Effect.succeed(importUpdatesOf(response.body))
            }
          },
        ),
      ),
  }
}
