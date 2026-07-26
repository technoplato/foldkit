import {
  Array,
  Data,
  Effect,
  Option,
  Schema,
  SchemaIssue,
  SchemaParser,
  SchemaTransformation,
  String,
  pipe,
} from 'effect'

import type { Ports } from '../port/port.js'
import * as Route from '../route/parser.js'
import * as QueryParams from '../route/queryParams.js'
import {
  type ReplayTape,
  type ReplayTapeDecodeError,
  type ReplayTapeExportError,
  decodeReplayTape,
  encodeReplayTape,
  makeReplayTapeSchema,
} from '../runtime/replayTape.js'
import type { Program } from './program.js'

/** A portable route that restores one Model snapshot. */
export type StateRoute<Model> = Readonly<{
  _tag: 'State'
  model: Model
}>

/** A portable route that inspects or resumes one replay tape. */
export type ReplayRoute<Model, Message> = Readonly<{
  _tag: 'Replay'
  tape: ReplayTape<Model, Message>
  frame: number
  isPlaying: boolean
}>

/** A SHA-256-derived UUIDv8 replay tape identifier. */
export const ContentAddressedReplayTapeId = Schema.String.check(
  Schema.isPattern(
    /^uuiduri:[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  ),
)
/** A SHA-256-derived UUIDv8 replay tape identifier. */
export type ContentAddressedReplayTapeId =
  typeof ContentAddressedReplayTapeId.Type

const LegacyReplayTapeId = Schema.String.check(Schema.isUUID(4))

/** A content-addressed replay identifier or a readable legacy UUIDv4 identifier. */
export const ReplayTapeId = Schema.Union([
  ContentAddressedReplayTapeId,
  LegacyReplayTapeId,
])
/** A content-addressed replay identifier or a readable legacy UUIDv4 identifier. */
export type ReplayTapeId = typeof ReplayTapeId.Type

/** Returns whether a replay tape identifier carries a verifiable content address. */
export const isContentAddressedReplayTapeId = (
  tapeId: ReplayTapeId,
): tapeId is ContentAddressedReplayTapeId => tapeId.startsWith('uuiduri:')

/** A portable route that resolves one saved replay tape by UUID. */
export type SavedReplayRoute = Readonly<{
  _tag: 'SavedReplay'
  tapeId: ReplayTapeId
  frame: number
  isPlaying: boolean
}>

/** A Program route whose complete tape payload is already available. */
export type ResolvedProgramRoute<Model, Message> =
  | StateRoute<Model>
  | ReplayRoute<Model, Message>

/** The engine-owned portable route union available to every Program. */
export type ProgramRoute<Model, Message> =
  | ResolvedProgramRoute<Model, Message>
  | SavedReplayRoute

/** A portable Program route could not be parsed or printed. */
export class ProgramRouteError extends Data.TaggedError('ProgramRouteError')<{
  readonly message: string
  readonly cause: unknown
}> {}

/** The shared parser-printer for a Program's relative state and replay URIs. */
export type ProgramRouter<Model, Message> = Readonly<{
  Route: Schema.Codec<ProgramRoute<Model, Message>, unknown, never, never>
  parse: (
    relativeRoute: string,
  ) => Effect.Effect<ProgramRoute<Model, Message>, ProgramRouteError>
  print: (
    route: ProgramRoute<Model, Message>,
  ) => Effect.Effect<string, ProgramRouteError>
  canonicalize: (
    relativeRoute: string,
  ) => Effect.Effect<string, ProgramRouteError>
}>

/** One Program route branch embedded in a larger typed destination union. */
export type ProgramRouteCase<Destination> = Readonly<{
  programId: string
  parse: (
    relativeRoute: string,
  ) => Effect.Effect<Destination, ProgramRouteError>
  print: (
    destination: Destination,
  ) => Option.Option<Effect.Effect<string, ProgramRouteError>>
}>

/** A shared parser-printer for every registered Program destination. */
export type ProgramDestinationRouter<Destination> = Readonly<{
  parse: (
    relativeRoute: string,
  ) => Effect.Effect<Destination, ProgramRouteError>
  print: (destination: Destination) => Effect.Effect<string, ProgramRouteError>
  canonicalize: (
    relativeRoute: string,
  ) => Effect.Effect<string, ProgramRouteError>
}>

const JsonFromString = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Json,
    SchemaTransformation.transformOrFail({
      decode: input =>
        pipe(
          Effect.try({
            try: () => JSON.parse(input),
            catch: cause =>
              new SchemaIssue.InvalidValue(Option.some(input), {
                description: globalThis.String(cause),
              }),
          }),
          Effect.flatMap(SchemaParser.decodeUnknownEffect(Schema.Json)),
        ),
      encode: json =>
        Effect.try({
          try: () => JSON.stringify(json),
          catch: cause =>
            new SchemaIssue.InvalidValue(Option.some(json), {
              description: globalThis.String(cause),
            }),
        }),
    }),
  ),
)

const splitRelativeRoute = (
  relativeRoute: string,
): Readonly<{
  segments: ReadonlyArray<string>
  search: string
}> => {
  const queryIndex = relativeRoute.indexOf('?')
  const pathname =
    queryIndex === -1 ? relativeRoute : relativeRoute.slice(0, queryIndex)
  const search = queryIndex === -1 ? '' : relativeRoute.slice(queryIndex + 1)
  return {
    segments: pipe(
      pathname,
      String.split('/'),
      Array.filter(String.isNonEmpty),
    ),
    search,
  }
}

const printState = (state: {
  segments: ReadonlyArray<string>
  queryParams: QueryParams.QueryParams
}): string => {
  const pathname = `/${Array.join(state.segments, '/')}`
  const search = QueryParams.toString(state.queryParams)
  return String.isEmpty(search) ? pathname : `${pathname}?${search}`
}

const toRouteError = (message: string) => (cause: unknown) =>
  new ProgramRouteError({ message, cause })

const replayParseResult = <Model, Message>(
  tape: ReplayTape<Model, Message>,
  frame: number,
  isPlaying: boolean,
  remaining: ReadonlyArray<string>,
): Route.ParseResult<
  Readonly<{
    tape: ReplayTape<Model, Message>
    frame: number
    isPlaying: boolean
  }>
> => [{ tape, frame, isPlaying }, remaining]

const savedReplayParseResult = (
  tapeId: ReplayTapeId,
  frame: number,
  isPlaying: boolean,
  remaining: ReadonlyArray<string>,
): Route.ParseResult<
  Readonly<{ tapeId: ReplayTapeId; frame: number; isPlaying: boolean }>
> => [{ tapeId, frame, isPlaying }, remaining]

const replayPlaybackFromQuery = (
  search: string | undefined,
): Effect.Effect<boolean, Route.ParseError> =>
  pipe(
    QueryParams.parse(search ?? ''),
    Effect.mapError(
      error =>
        new Route.ParseError({
          message: 'Replay query parameters could not be decoded',
          actual: error.component,
        }),
    ),
    Effect.flatMap(queryParams => {
      const maybePlay = QueryParams.getLast(queryParams, 'play')
      if (Option.isNone(maybePlay) || maybePlay.value === '0') {
        return Effect.succeed(false)
      } else if (maybePlay.value === '1') {
        return Effect.succeed(true)
      } else {
        return Effect.fail(
          new Route.ParseError({
            message: 'Replay playback must be encoded as 0 or 1',
            expected: '0 or 1',
            actual: maybePlay.value,
          }),
        )
      }
    }),
  )

const setReplayQuery = (
  queryParams: QueryParams.QueryParams,
  frame: number,
  isPlaying: boolean,
): QueryParams.QueryParams => {
  const nextQueryParams = QueryParams.set(
    queryParams,
    'frame',
    frame.toString(),
  )
  return isPlaying
    ? QueryParams.set(nextQueryParams, 'play', '1')
    : nextQueryParams
}

const replayFrameFromQuery = (
  search: string | undefined,
): Effect.Effect<number, Route.ParseError> =>
  pipe(
    QueryParams.parse(search ?? ''),
    Effect.mapError(
      error =>
        new Route.ParseError({
          message: 'Replay query parameters could not be decoded',
          actual: error.component,
        }),
    ),
    Effect.flatMap(queryParams => {
      const maybeFrameText = QueryParams.getLast(queryParams, 'frame')
      if (Option.isNone(maybeFrameText)) {
        return Effect.fail(
          new Route.ParseError({
            message: 'Expected replay frame query parameter',
            expected: 'frame',
            actual: 'missing',
          }),
        )
      }
      const frame = globalThis.Number(maybeFrameText.value)
      if (!Number.isInteger(frame) || frame < 0) {
        return Effect.fail(
          new Route.ParseError({
            message: 'Replay frame must be a non-negative integer',
            expected: 'non-negative integer',
            actual: maybeFrameText.value,
          }),
        )
      }
      return Effect.succeed(frame)
    }),
  )

const makeSavedReplayPayloadParser = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
): Route.Biparser<
  Readonly<{ tapeId: ReplayTapeId; frame: number; isPlaying: boolean }>
> => {
  const pathParser = pipe(
    Route.literal(program.id),
    Route.slash(Route.literal('replay')),
    Route.slash(Route.schemaSegment('tapeId', ReplayTapeId)),
  )
  return {
    parse: (segments, search) =>
      pipe(
        pathParser.parse(segments, search),
        Effect.flatMap(([{ tapeId }, remaining]) =>
          Effect.all({
            frame: replayFrameFromQuery(search),
            isPlaying: replayPlaybackFromQuery(search),
          }).pipe(
            Effect.map(({ frame, isPlaying }) =>
              savedReplayParseResult(tapeId, frame, isPlaying, remaining),
            ),
          ),
        ),
      ),
    print: ({ tapeId, frame, isPlaying }, state) =>
      pipe(
        pathParser.print({ tapeId }, state),
        Effect.map(nextState => ({
          ...nextState,
          queryParams: setReplayQuery(nextState.queryParams, frame, isPlaying),
        })),
      ),
  }
}

const makeReplayPayloadParser = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
): Route.Biparser<
  Readonly<{
    tape: ReplayTape<Model, Message>
    frame: number
    isPlaying: boolean
  }>
> => {
  const pathParser = pipe(
    Route.literal(program.id),
    Route.slash(Route.literal('replay')),
  )
  return {
    parse: (segments, search) =>
      pipe(
        pathParser.parse(segments, search),
        Effect.flatMap(([_, remaining]) => {
          return pipe(
            QueryParams.parse(search ?? ''),
            Effect.mapError(
              error =>
                new Route.ParseError({
                  message: 'Replay query parameters could not be decoded',
                  actual: error.component,
                }),
            ),
            Effect.flatMap(queryParams => {
              const maybeTape = QueryParams.getLast(queryParams, 'tape')
              if (Option.isNone(maybeTape)) {
                return Effect.fail(
                  new Route.ParseError({
                    message: 'Expected replay tape query parameter',
                    expected: 'tape',
                    actual: 'missing',
                  }),
                )
              }
              const maybeFrameText = QueryParams.getLast(queryParams, 'frame')
              const maybePlay = QueryParams.getLast(queryParams, 'play')
              return pipe(
                decodeReplayTape(program, maybeTape.value),
                Effect.flatMap(tape => {
                  const frame = Option.match(maybeFrameText, {
                    onNone: () => tape.transitions.length,
                    onSome: value => globalThis.Number(value),
                  })
                  if (
                    !Number.isInteger(frame) ||
                    frame < 0 ||
                    frame > tape.transitions.length
                  ) {
                    return Effect.fail(
                      new Route.ParseError({
                        message: 'Replay frame is outside the tape bounds',
                        expected: `integer from 0 through ${tape.transitions.length.toString()}`,
                        actual: Option.getOrElse(maybeFrameText, () => ''),
                      }),
                    )
                  }
                  const isPlaying = Option.match(maybePlay, {
                    onNone: () => false,
                    onSome: value => value === '1',
                  })
                  if (
                    Option.isSome(maybePlay) &&
                    maybePlay.value !== '0' &&
                    maybePlay.value !== '1'
                  ) {
                    return Effect.fail(
                      new Route.ParseError({
                        message: 'Replay playback must be encoded as 0 or 1',
                        expected: '0 or 1',
                        actual: maybePlay.value,
                      }),
                    )
                  }
                  return Effect.succeed(
                    replayParseResult(tape, frame, isPlaying, remaining),
                  )
                }),
                Effect.mapError(
                  error =>
                    new Route.ParseError({
                      message: `Invalid replay tape: ${error._tag}`,
                      actual: maybeTape.value,
                    }),
                ),
              )
            }),
          )
        }),
      ),
    print: ({ tape, frame, isPlaying }, state) =>
      pipe(
        pathParser.print({}, state),
        Effect.flatMap(nextState =>
          pipe(
            encodeReplayTape(program, tape),
            Effect.map(encodedTape => {
              const nextQueryParams = setReplayQuery(
                QueryParams.set(nextState.queryParams, 'tape', encodedTape),
                frame,
                isPlaying,
              )
              return { ...nextState, queryParams: nextQueryParams }
            }),
            Effect.mapError(
              error =>
                new Route.ParseError({
                  message: `Could not encode replay tape: ${error.message}`,
                }),
            ),
          ),
        ),
      ),
  }
}

/** Creates the shared state and replay URI parser-printer for a Program. */
export const makeRouter = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
): ProgramRouter<Model, Message> => {
  const State = Schema.TaggedStruct('State', { model: program.Model })
  const Replay = Schema.TaggedStruct('Replay', {
    tape: makeReplayTapeSchema(program),
    frame: Schema.Int,
    isPlaying: Schema.Boolean,
  })
  const SavedReplay = Schema.TaggedStruct('SavedReplay', {
    tapeId: ReplayTapeId,
    frame: Schema.Int,
    isPlaying: Schema.Boolean,
  })
  const ProgramRoute = Schema.Union([State, Replay, SavedReplay])
  const ModelFromJsonString = JsonFromString.pipe(
    Schema.decodeTo(Schema.toCodecJson(program.Model)),
  )
  const statePayloadParser = pipe(
    Route.literal(program.id),
    Route.slash(Route.literal('state')),
    Route.query(Schema.Struct({ model: ModelFromJsonString })),
  )
  const replayPayloadParser = makeReplayPayloadParser(program)
  const savedReplayPayloadParser = makeSavedReplayPayloadParser(program)
  const parser = Route.oneOfCases<ProgramRoute<Model, Message>>(
    Route.caseOf<ProgramRoute<Model, Message>, Readonly<{ model: Model }>>(
      statePayloadParser,
      {
        embed: ({ model }) => State.make({ model }),
        extract: route =>
          route._tag === 'State'
            ? Option.some({ model: route.model })
            : Option.none(),
      },
    ),
    Route.caseOf<
      ProgramRoute<Model, Message>,
      Readonly<{
        tape: ReplayTape<Model, Message>
        frame: number
        isPlaying: boolean
      }>
    >(replayPayloadParser, {
      embed: ({ tape, frame, isPlaying }) =>
        Replay.make({ tape, frame, isPlaying }),
      extract: route =>
        route._tag === 'Replay'
          ? Option.some({
              tape: route.tape,
              frame: route.frame,
              isPlaying: route.isPlaying,
            })
          : Option.none(),
    }),
    Route.caseOf<
      ProgramRoute<Model, Message>,
      Readonly<{
        tapeId: ReplayTapeId
        frame: number
        isPlaying: boolean
      }>
    >(savedReplayPayloadParser, {
      embed: ({ tapeId, frame, isPlaying }) =>
        SavedReplay.make({ tapeId, frame, isPlaying }),
      extract: route =>
        route._tag === 'SavedReplay'
          ? Option.some({
              tapeId: route.tapeId,
              frame: route.frame,
              isPlaying: route.isPlaying,
            })
          : Option.none(),
    }),
  )

  const parse = (
    relativeRoute: string,
  ): Effect.Effect<ProgramRoute<Model, Message>, ProgramRouteError> => {
    const { segments, search } = splitRelativeRoute(relativeRoute)
    return pipe(
      parser.parse(segments, search),
      Effect.flatMap(([route, remaining]) => {
        if (Array.isReadonlyArrayNonEmpty(remaining)) {
          return Effect.fail(
            new Route.ParseError({
              message: `Unexpected remaining segments: ${Array.join(remaining, '/')}`,
              actual: Array.join(remaining, '/'),
            }),
          )
        }
        return Effect.succeed(route)
      }),
      Effect.mapError(toRouteError('The Program route could not be parsed')),
    )
  }

  const print = (
    route: ProgramRoute<Model, Message>,
  ): Effect.Effect<string, ProgramRouteError> =>
    pipe(
      parser.print(route, {
        segments: [],
        queryParams: QueryParams.empty,
      }),
      Effect.map(printState),
      Effect.mapError(toRouteError('The Program route could not be printed')),
    )

  const canonicalize = (
    relativeRoute: string,
  ): Effect.Effect<string, ProgramRouteError> =>
    pipe(relativeRoute, parse, Effect.flatMap(print))

  return { Route: ProgramRoute, parse, print, canonicalize }
}

/**
 * Focuses one Program's engine-owned routes into a larger destination union.
 */
export const routeCase = <
  Destination,
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
  casePath: Route.CasePath<Destination, ProgramRoute<Model, Message>>,
): ProgramRouteCase<Destination> => {
  const router = makeRouter(program)
  return {
    programId: program.id,
    parse: relativeRoute =>
      pipe(relativeRoute, router.parse, Effect.map(casePath.embed)),
    print: destination =>
      pipe(
        destination,
        casePath.extract,
        Option.map(route => router.print(route)),
      ),
  }
}

/**
 * Creates one canonical relative URI parser-printer for a registered Program
 * set. Case paths preserve the concrete Model and Message types of every
 * destination branch.
 */
export const makeDestinationRouter = <Destination>(
  ...cases: ReadonlyArray<ProgramRouteCase<Destination>>
): ProgramDestinationRouter<Destination> => {
  const parse = (
    relativeRoute: string,
  ): Effect.Effect<Destination, ProgramRouteError> => {
    const { segments } = splitRelativeRoute(relativeRoute)
    const maybeProgramId = Array.head(segments)
    if (Option.isNone(maybeProgramId)) {
      return Effect.fail(
        new ProgramRouteError({
          message: 'The Program destination path is empty',
          cause: relativeRoute,
        }),
      )
    }
    const matchingCases = Array.filter(
      cases,
      routeCase => routeCase.programId === maybeProgramId.value,
    )
    return Array.matchLeft(matchingCases, {
      onEmpty: () =>
        Effect.fail(
          new ProgramRouteError({
            message: `The Program destination '${maybeProgramId.value}' is not registered`,
            cause: relativeRoute,
          }),
        ),
      onNonEmpty: (matchingCase, remainingCases) => {
        if (Array.isReadonlyArrayNonEmpty(remainingCases)) {
          return Effect.fail(
            new ProgramRouteError({
              message: `The Program destination '${maybeProgramId.value}' is registered more than once`,
              cause: relativeRoute,
            }),
          )
        }
        return matchingCase.parse(relativeRoute)
      },
    })
  }

  const print = (
    destination: Destination,
  ): Effect.Effect<string, ProgramRouteError> => {
    const printers = pipe(
      cases,
      Array.map(routeCase => routeCase.print(destination)),
      Array.getSomes,
    )
    return Array.matchLeft(printers, {
      onEmpty: () =>
        Effect.fail(
          new ProgramRouteError({
            message: 'No registered Program route can print this destination',
            cause: destination,
          }),
        ),
      onNonEmpty: (printer, remainingPrinters) => {
        if (Array.isReadonlyArrayNonEmpty(remainingPrinters)) {
          return Effect.fail(
            new ProgramRouteError({
              message:
                'More than one registered Program route can print this destination',
              cause: destination,
            }),
          )
        }
        return printer
      },
    })
  }

  const canonicalize = (
    relativeRoute: string,
  ): Effect.Effect<string, ProgramRouteError> =>
    pipe(relativeRoute, parse, Effect.flatMap(print))

  return { parse, print, canonicalize }
}

/** Constructs the state branch of a Program route. */
export const state = <Model>(model: Model): StateRoute<Model> => ({
  _tag: 'State',
  model,
})

/** Constructs the replay branch of a Program route. */
export const replay = <Model, Message>(
  tape: ReplayTape<Model, Message>,
  frame = tape.transitions.length,
  isPlaying = false,
): ReplayRoute<Model, Message> => ({
  _tag: 'Replay',
  tape,
  frame,
  isPlaying,
})

/** Constructs the UUID-backed replay branch of a Program route. */
export const savedReplay = (
  tapeId: ReplayTapeId,
  frame: number,
  isPlaying = false,
): SavedReplayRoute => ({ _tag: 'SavedReplay', tapeId, frame, isPlaying })

/** Errors accepted from replay tape parser-printers. */
export type ProgramRouteTapeError =
  | ReplayTapeDecodeError
  | ReplayTapeExportError
