import {
  Array as Array_,
  Data,
  Effect,
  Exit,
  Match as M,
  Option,
  Schema as S,
  Scope,
  String as String_,
} from 'effect'
import { Runtime } from 'foldkit'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

import {
  Loading,
  Message,
  Model,
  RequestedDecrement,
  RequestedIncrement,
  RequestedOpenCounter,
  RequestedReset,
  makeCounterProgram,
} from './counter.js'
import { renderCounterShareCardPng } from './counterShareCard.js'
import {
  CounterTapeEntry,
  fetchCounterTapeXml,
  messageForCounterTapeEntry,
  parseCounterTapeEntries,
  parseCounterTapeXml,
  sampleIncrementTapeXml,
} from './counterTape.js'
import { parseCounterUri, printCounterUri } from './counterUri.js'
import { counterStorageLayer } from './nodeHost.js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 8765
const MAX_BODY_BYTES = 4096
const TAPE_REPLAY_STEP_DELAY_MILLISECONDS = 150
const HOST_ENVIRONMENT_VARIABLE = 'FOLDKIT_COUNTER_PORTAL_HOST'
const PORT_ENVIRONMENT_VARIABLE = 'PORT'
const DEFAULT_TAPE_PATH = '/counter.tape.xml'

// MODEL

export const PortalCommand = S.Literals([
  'Show',
  'Increment',
  'Decrement',
  'Reset',
  'Help',
])
export type PortalCommand = typeof PortalCommand.Type

export const ViewMedium = S.Literals([
  'Terminal',
  'Foldkit',
  'React',
  'ReactNativeWeb',
])
export type ViewMedium = typeof ViewMedium.Type

const PortalCommandRequest = S.Struct({ input: S.String })

/** Options used to start the terminal portal host. */
export type CounterPortalServerOptions = Readonly<{
  host?: string
  port?: number
}>

/** A running Counter terminal portal. */
export type CounterPortalServer = Readonly<{
  localUrl: string
  port: number
  shutdown: Effect.Effect<void>
}>

/** Error raised by the Counter terminal portal host. */
export class CounterPortalServerError extends Data.TaggedError(
  'CounterPortalServerError',
)<{
  readonly reason: string
}> {}

type PortalSnapshot = Readonly<{
  count: string
  carrierUri: string
  model: Model
  mode: string
  portableUri: string
  uri: string
  viewMedium: ViewMedium
}>

type PortalCommandResponse = Readonly<{
  command: string
  output: string
  snapshot: PortalSnapshot
}>

type PortalShareMetadata = Readonly<{
  decrementUrl: string
  description: string
  imageUrl: string
  incrementUrl: string
  stateUrl: string
  title: string
}>

type TapeReplayOptions = Readonly<{
  tapeUrl: URL
}>

type TapeReplayStepStatus = 'Passed' | 'Failed' | 'Observed' | 'Processed'

type TapeReplayEvent = Readonly<
  | {
      _tag: 'TapeReplayStarted'
      snapshot: PortalSnapshot
      tapeUrl: string
      total: number
    }
  | {
      _tag: 'TapeReplayStepStarted'
      entry: CounterTapeEntry
      index: number
      total: number
    }
  | {
      _tag: 'TapeReplayStepCompleted'
      entry: CounterTapeEntry
      index: number
      snapshot: PortalSnapshot
      status: TapeReplayStepStatus
      total: number
    }
  | {
      _tag: 'TapeReplayCompleted'
      snapshot: PortalSnapshot
      tapeUrl: string
      total: number
    }
  | {
      _tag: 'TapeReplayFailed'
      reason: string
      snapshot: PortalSnapshot
    }
>

type CommandGate = {
  isRunning: boolean
}

type PortalClient = Readonly<{
  medium: ViewMedium
  response: ServerResponse
}>

const decodePortalCommandRequest = S.decodeUnknownSync(PortalCommandRequest)

const pathForMedium = (medium: ViewMedium): string =>
  M.value(medium).pipe(
    M.withReturnType<string>(),
    M.when('Terminal', () => '/counter.terminal'),
    M.when('Foldkit', () => '/counter.foldkit'),
    M.when('React', () => '/counter.react'),
    M.when('ReactNativeWeb', () => '/counter.react-native-web'),
    M.exhaustive,
  )

const mediumForPath = (pathname: string): Option.Option<ViewMedium> =>
  M.value(pathname).pipe(
    M.withReturnType<Option.Option<ViewMedium>>(),
    M.when('/', () => Option.some('Terminal')),
    M.when('/counter.terminal', () => Option.some('Terminal')),
    M.when('/counter.foldkit', () => Option.some('Foldkit')),
    M.when('/counter.react', () => Option.some('React')),
    M.when('/counter.react-native-web', () => Option.some('ReactNativeWeb')),
    M.orElse(() => Option.none()),
  )

const mediumQueryValue = (medium: ViewMedium): string =>
  M.value(medium).pipe(
    M.withReturnType<string>(),
    M.when('Terminal', () => 'Terminal'),
    M.when('Foldkit', () => 'Foldkit'),
    M.when('React', () => 'React'),
    M.when('ReactNativeWeb', () => 'ReactNativeWeb'),
    M.exhaustive,
  )

const mediumForQuery = (value: string | null): ViewMedium =>
  M.value(value).pipe(
    M.withReturnType<ViewMedium>(),
    M.when('Foldkit', () => 'Foldkit'),
    M.when('React', () => 'React'),
    M.when('ReactNativeWeb', () => 'ReactNativeWeb'),
    M.orElse(() => 'Terminal'),
  )

const messageForCommand = (command: PortalCommand): Option.Option<Message> =>
  M.value(command).pipe(
    M.withReturnType<Option.Option<Message>>(),
    M.when('Show', () => Option.none()),
    M.when('Increment', () => Option.some(RequestedIncrement())),
    M.when('Decrement', () => Option.some(RequestedDecrement())),
    M.when('Reset', () => Option.some(RequestedReset())),
    M.when('Help', () => Option.none()),
    M.exhaustive,
  )

const parseCommand = (input: string): Option.Option<PortalCommand> => {
  const normalizedInput = input.trim().toLowerCase()
  return M.value(normalizedInput).pipe(
    M.withReturnType<Option.Option<PortalCommand>>(),
    M.when('show', () => Option.some('Show')),
    M.when('count', () => Option.some('Show')),
    M.when('increment', () => Option.some('Increment')),
    M.when('inc', () => Option.some('Increment')),
    M.when('+', () => Option.some('Increment')),
    M.when('decrement', () => Option.some('Decrement')),
    M.when('dec', () => Option.some('Decrement')),
    M.when('-', () => Option.some('Decrement')),
    M.when('reset', () => Option.some('Reset')),
    M.when('r', () => Option.some('Reset')),
    M.when('help', () => Option.some('Help')),
    M.when('', () => Option.some('Help')),
    M.orElse(() => Option.none()),
  )
}

const carrierUriForModel = (medium: ViewMedium, model: Model): string => {
  const portableUri = printCounterUri(model)
  const query = portableUri.startsWith('/?') ? portableUri.substring(1) : ''
  return `${pathForMedium(medium)}${query}`
}

const snapshotForModel = (model: Model, medium: ViewMedium): PortalSnapshot => {
  const count = M.value(model).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Loading: () => 'loading',
      Ready: ({ count }) => count.toString(),
      Saving: ({ count }) => count.toString(),
    }),
  )

  const portableUri = printCounterUri(model)
  const carrierUri = carrierUriForModel(medium, model)

  return {
    carrierUri,
    count,
    model,
    mode: model._tag,
    portableUri,
    uri: carrierUri,
    viewMedium: medium,
  }
}

const maybeCountForModel = (model: Model): Option.Option<number> =>
  M.value(model).pipe(
    M.withReturnType<Option.Option<number>>(),
    M.tagsExhaustive({
      Loading: () => Option.none(),
      Ready: ({ count }) => Option.some(count),
      Saving: ({ count }) => Option.some(count),
    }),
  )

const statusForTapeEntry = (
  entry: CounterTapeEntry,
  model: Model,
): TapeReplayStepStatus =>
  M.value(entry).pipe(
    M.withReturnType<TapeReplayStepStatus>(),
    M.tagsExhaustive({
      Action: () => 'Processed',
      Expect: ({ count }) => {
        const maybeCount = maybeCountForModel(model)
        if (Option.isSome(maybeCount) && maybeCount.value === count) {
          return 'Passed'
        } else {
          return 'Failed'
        }
      },
      Final: ({ count }) => {
        const maybeCount = maybeCountForModel(model)
        if (Option.isSome(maybeCount) && maybeCount.value === count) {
          return 'Passed'
        } else {
          return 'Failed'
        }
      },
      Snapshot: () => 'Observed',
    }),
  )

const formatSnapshot = (snapshot: PortalSnapshot): string =>
  `${snapshot.mode} ${snapshot.count} ${snapshot.uri}`

const helpOutput =
  'Commands: show, increment, decrement, reset. Aliases: count, inc, dec, +, -, r.'

const outputForCommand = (
  command: PortalCommand,
  snapshot: PortalSnapshot,
): string =>
  M.value(command).pipe(
    M.withReturnType<string>(),
    M.when('Help', () => helpOutput),
    M.when('Show', () => formatSnapshot(snapshot)),
    M.when('Increment', () => formatSnapshot(snapshot)),
    M.when('Decrement', () => formatSnapshot(snapshot)),
    M.when('Reset', () => formatSnapshot(snapshot)),
    M.exhaustive,
  )

const portableUriForUrl = (url: URL): string => {
  const searchParams = new URLSearchParams(url.searchParams)
  searchParams.delete('command')
  tapeQueryParameterNames.forEach(name => {
    searchParams.delete(name)
  })
  return `/?${searchParams.toString()}`
}

const maybeModelForUrl = (
  url: URL,
): Effect.Effect<Option.Option<Model>, CounterPortalServerError> => {
  if (!url.searchParams.has('mode')) {
    return Effect.succeed(Option.none())
  } else {
    return parseCounterUri(portableUriForUrl(url)).pipe(
      Effect.map(model => Option.some(model)),
      Effect.mapError(
        error => new CounterPortalServerError({ reason: error.reason }),
      ),
    )
  }
}

const maybeCommandInputForUrl = (url: URL): Option.Option<string> =>
  Option.fromNullishOr(url.searchParams.get('command'))

const urlHasLaunchWork = (url: URL): boolean =>
  url.searchParams.has('mode') ||
  url.searchParams.has('command') ||
  hasTapeQuery(url)

const runCounterTape = (
  runtime: Runtime.HostRuntime<Model, Message>,
  tapeUrl: URL,
): Effect.Effect<Model, CounterPortalServerError> =>
  Effect.gen(function* () {
    const xml = yield* fetchCounterTapeXml(tapeUrl).pipe(
      Effect.mapError(
        error => new CounterPortalServerError({ reason: error.reason }),
      ),
    )
    const messages = yield* parseCounterTapeXml(xml).pipe(
      Effect.mapError(
        error => new CounterPortalServerError({ reason: error.reason }),
      ),
    )

    let nextModel = runtime.readModel()
    for (const message of messages) {
      nextModel = yield* runtime.run(message)
    }
    return nextModel
  })

const applyUrlRequest = (
  runtime: Runtime.HostRuntime<Model, Message>,
  url: URL,
  medium: ViewMedium,
  origin: string,
): Effect.Effect<PortalSnapshot, CounterPortalServerError> =>
  Effect.gen(function* () {
    const maybeModel = yield* maybeModelForUrl(url)
    let model = Option.isSome(maybeModel)
      ? yield* runtime.run(RequestedOpenCounter({ model: maybeModel.value }))
      : runtime.readModel()

    const maybeTapeUrl = yield* maybeTapeUrlForUrl(url, origin)
    if (Option.isSome(maybeTapeUrl)) {
      model = yield* runCounterTape(runtime, maybeTapeUrl.value)
    }

    const maybeCommandInput = maybeCommandInputForUrl(url)
    if (Option.isSome(maybeCommandInput)) {
      const response = yield* runPortalCommand(
        runtime,
        maybeCommandInput.value,
        medium,
      )
      return response.snapshot
    } else {
      return snapshotForModel(model, medium)
    }
  })

const parseCommandRequest = (
  body: string,
): Effect.Effect<string, CounterPortalServerError> =>
  Effect.try({
    try: () => decodePortalCommandRequest(JSON.parse(body)).input,
    catch: error =>
      new CounterPortalServerError({
        reason: `Could not parse command request: ${globalThis.String(error)}`,
      }),
  })

const readRequestBody = (
  request: IncomingMessage,
): Effect.Effect<string, CounterPortalServerError> =>
  Effect.callback<string, CounterPortalServerError>(resume => {
    const chunks = new Array<Buffer>()
    let byteCount = 0
    let isComplete = false

    const complete = (
      effect: Effect.Effect<string, CounterPortalServerError>,
    ): void => {
      if (!isComplete) {
        isComplete = true
        resume(effect)
      }
    }

    request.on('data', (chunk: Buffer) => {
      if (isComplete) {
        return
      }

      byteCount += chunk.byteLength
      if (byteCount > MAX_BODY_BYTES) {
        complete(
          Effect.fail(
            new CounterPortalServerError({
              reason: 'Command request body was too large',
            }),
          ),
        )
        request.destroy()
      } else {
        chunks.push(chunk)
      }
    })

    request.on('end', () => {
      complete(Effect.succeed(Buffer.concat(chunks).toString('utf8')))
    })

    request.on('error', error => {
      complete(
        Effect.fail(
          new CounterPortalServerError({
            reason: globalThis.String(error),
          }),
        ),
      )
    })
  })

const runPortalCommand = (
  runtime: Runtime.HostRuntime<Model, Message>,
  input: string,
  medium: ViewMedium,
): Effect.Effect<PortalCommandResponse, CounterPortalServerError> =>
  Effect.gen(function* () {
    const maybeCommand = parseCommand(input)
    if (Option.isNone(maybeCommand)) {
      return yield* Effect.fail(
        new CounterPortalServerError({
          reason: `Unknown command "${input}". ${helpOutput}`,
        }),
      )
    }

    const command = maybeCommand.value
    const maybeMessage = messageForCommand(command)
    const model = Option.isSome(maybeMessage)
      ? yield* runtime.run(maybeMessage.value)
      : runtime.readModel()
    const snapshot = snapshotForModel(model, medium)

    return {
      command,
      output: outputForCommand(command, snapshot),
      snapshot,
    }
  })

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void => {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(`${JSON.stringify(value)}\n`)
}

const writeText = (
  response: ServerResponse,
  statusCode: number,
  value: string,
): void => {
  response.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(value)
}

const writeXml = (
  response: ServerResponse,
  statusCode: number,
  value: string,
): void => {
  response.writeHead(statusCode, {
    'content-type': 'application/xml; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(value)
}

const writeSnapshotEvent = (
  response: ServerResponse,
  snapshot: PortalSnapshot,
): void => {
  response.write(`data: ${JSON.stringify(snapshot)}\n\n`)
}

const writeTapeReplayEvent = (
  response: ServerResponse,
  event: TapeReplayEvent,
): void => {
  if (!response.destroyed && !response.writableEnded) {
    response.write(`data: ${JSON.stringify(event)}\n\n`)
  }
}

const pauseTapeReplay = Effect.promise<void>(
  () =>
    new Promise(resolve => {
      setTimeout(resolve, TAPE_REPLAY_STEP_DELAY_MILLISECONDS)
    }),
)

const labelForMedium = (medium: ViewMedium): string =>
  M.value(medium).pipe(
    M.withReturnType<string>(),
    M.when('Terminal', () => 'Terminal'),
    M.when('Foldkit', () => 'Foldkit'),
    M.when('React', () => 'React'),
    M.when('ReactNativeWeb', () => 'React Native Web'),
    M.exhaustive,
  )

const htmlEscape = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

const firstHeaderPart = (value: string): string => {
  const maybeFirstPart = Array_.head(value.split(','))
  if (Option.isSome(maybeFirstPart)) {
    return maybeFirstPart.value.trim()
  } else {
    return value.trim()
  }
}

const originForRequest = (request: IncomingMessage): string => {
  const protocolHeader = request.headers['x-forwarded-proto']?.toString()
  const hostHeader = request.headers.host?.toString()
  const protocol =
    protocolHeader === undefined ? 'http' : firstHeaderPart(protocolHeader)
  const host =
    hostHeader === undefined ? `${DEFAULT_HOST}:${DEFAULT_PORT}` : hostHeader

  return `${protocol}://${host}`
}

const absoluteUrl = (origin: string, pathname: string): string =>
  new URL(pathname, origin).toString()

const commandUrlForSnapshot = (
  snapshot: PortalSnapshot,
  origin: string,
  command: string,
): string => {
  const commandUrl = new URL(snapshot.carrierUri, origin)
  commandUrl.searchParams.set('command', command)
  return commandUrl.toString()
}

const shareImageUrlForSnapshot = (
  snapshot: PortalSnapshot,
  origin: string,
): string => {
  const imageUrl = new URL('/counter-card.png', origin)
  const portableUrl = new URL(snapshot.portableUri, origin)
  portableUrl.searchParams.forEach((value, key) => {
    imageUrl.searchParams.set(key, value)
  })
  imageUrl.searchParams.set('medium', mediumQueryValue(snapshot.viewMedium))
  return imageUrl.toString()
}

const shareMetadataForSnapshot = (
  snapshot: PortalSnapshot,
  origin: string,
): PortalShareMetadata => {
  const incrementUrl = commandUrlForSnapshot(snapshot, origin, 'increment')
  const decrementUrl = commandUrlForSnapshot(snapshot, origin, 'decrement')
  const stateUrl = absoluteUrl(origin, snapshot.carrierUri)

  return {
    decrementUrl,
    description: `Count ${snapshot.count}. Increment: ${incrementUrl}. Decrement: ${decrementUrl}.`,
    imageUrl: shareImageUrlForSnapshot(snapshot, origin),
    incrementUrl,
    stateUrl,
    title: `Foldkit Counter: ${snapshot.count}`,
  }
}

const tapeQueryParameterNames = [
  'replayTapeUrl',
  'tapeDomain',
  'tapePath',
  'tapeUrl',
]

const hasTapeQuery = (url: URL): boolean =>
  tapeQueryParameterNames.some(name => url.searchParams.has(name))

const isLoopbackOrPrivateHostname = (hostname: string): boolean => {
  const normalizedHostname = hostname.toLowerCase()

  if (normalizedHostname === 'localhost') {
    return true
  } else if (normalizedHostname.includes(':')) {
    return true
  } else if (/^0\./u.test(normalizedHostname)) {
    return true
  } else if (/^127\./u.test(normalizedHostname)) {
    return true
  } else if (/^10\./u.test(normalizedHostname)) {
    return true
  } else if (/^169\.254\./u.test(normalizedHostname)) {
    return true
  } else if (/^192\.168\./u.test(normalizedHostname)) {
    return true
  } else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./u.test(normalizedHostname)) {
    return true
  } else {
    return false
  }
}

const isAllowedRemoteTapeHostname = (hostname: string): boolean => {
  const normalizedHostname = hostname.toLowerCase()
  return (
    normalizedHostname === 'knophy.com' ||
    normalizedHostname.endsWith('.knophy.com')
  )
}

const validateTapeUrl = (
  tapeUrl: URL,
  origin: string,
): Effect.Effect<URL, CounterPortalServerError> => {
  const originUrl = new URL(origin)

  if (tapeUrl.protocol !== 'http:' && tapeUrl.protocol !== 'https:') {
    return Effect.fail(
      new CounterPortalServerError({
        reason: 'Counter tape URL must use http or https',
      }),
    )
  } else if (
    String_.isNonEmpty(tapeUrl.username) ||
    String_.isNonEmpty(tapeUrl.password)
  ) {
    return Effect.fail(
      new CounterPortalServerError({
        reason: 'Counter tape URL must not contain credentials',
      }),
    )
  } else if (
    tapeUrl.host !== originUrl.host &&
    isLoopbackOrPrivateHostname(tapeUrl.hostname)
  ) {
    return Effect.fail(
      new CounterPortalServerError({
        reason: 'Counter tape URL must not target a private host',
      }),
    )
  } else if (
    tapeUrl.host !== originUrl.host &&
    !isAllowedRemoteTapeHostname(tapeUrl.hostname)
  ) {
    return Effect.fail(
      new CounterPortalServerError({
        reason:
          'Counter tape URL must target the current host or a Knophy domain',
      }),
    )
  } else {
    return Effect.succeed(tapeUrl)
  }
}

const tapeUrlForDomain = (
  origin: string,
  domain: string,
  path: string,
): Effect.Effect<URL, CounterPortalServerError> =>
  Effect.try({
    try: () => {
      const originUrl = new URL(origin)
      const domainUrl = domain.includes('://')
        ? new URL(domain)
        : new URL(`${originUrl.protocol}//${domain}`)
      if (!path.startsWith('/')) {
        throw new Error('Counter tape path must start with /')
      }

      return new URL(path, `${originUrl.protocol}//${domainUrl.host}`)
    },
    catch: error =>
      new CounterPortalServerError({
        reason: globalThis.String(error),
      }),
  })

const maybeTapeUrlForUrl = (
  url: URL,
  origin: string,
): Effect.Effect<Option.Option<URL>, CounterPortalServerError> => {
  const maybeTapeUrl = Option.fromNullishOr(url.searchParams.get('tapeUrl'))
  if (Option.isSome(maybeTapeUrl)) {
    return Effect.try({
      try: () => new URL(maybeTapeUrl.value),
      catch: error =>
        new CounterPortalServerError({
          reason: globalThis.String(error),
        }),
    }).pipe(
      Effect.flatMap(tapeUrl => validateTapeUrl(tapeUrl, origin)),
      Effect.map(tapeUrl => Option.some(tapeUrl)),
    )
  }

  const maybeTapeDomain = Option.fromNullishOr(
    url.searchParams.get('tapeDomain'),
  )
  if (Option.isSome(maybeTapeDomain)) {
    const tapePath = url.searchParams.get('tapePath') ?? DEFAULT_TAPE_PATH
    return tapeUrlForDomain(origin, maybeTapeDomain.value, tapePath).pipe(
      Effect.flatMap(tapeUrl => validateTapeUrl(tapeUrl, origin)),
      Effect.map(tapeUrl => Option.some(tapeUrl)),
    )
  } else {
    return Effect.succeed(Option.none())
  }
}

const maybeReplayTapeUrlForUrl = (
  url: URL,
  origin: string,
): Effect.Effect<
  Option.Option<TapeReplayOptions>,
  CounterPortalServerError
> => {
  const maybeReplayTapeUrl = Option.fromNullishOr(
    url.searchParams.get('replayTapeUrl'),
  )
  if (Option.isNone(maybeReplayTapeUrl)) {
    return Effect.succeed(Option.none())
  }

  return Effect.try({
    try: () => new URL(maybeReplayTapeUrl.value),
    catch: error =>
      new CounterPortalServerError({
        reason: globalThis.String(error),
      }),
  }).pipe(
    Effect.flatMap(tapeUrl => validateTapeUrl(tapeUrl, origin)),
    Effect.map(tapeUrl => Option.some({ tapeUrl })),
  )
}

const mediumLink = (medium: ViewMedium, model: Model): string =>
  `<a href="${carrierUriForModel(medium, model)}">${labelForMedium(medium)}</a>`

const htmlForMedium = (
  medium: ViewMedium,
  initialSnapshot: PortalSnapshot,
  origin: string,
  maybeTapeReplay: Option.Option<TapeReplayOptions>,
): string => {
  const initialSnapshotJson = JSON.stringify(initialSnapshot)
  const tapeReplayJson = Option.isSome(maybeTapeReplay)
    ? JSON.stringify({
        tapeUrl: maybeTapeReplay.value.tapeUrl.toString(),
      })
    : 'null'
  const mediumLabel = labelForMedium(medium)
  const mediumQuery = mediumQueryValue(medium)
  const shareMetadata = shareMetadataForSnapshot(initialSnapshot, origin)
  const mediumLinks = [
    mediumLink('Terminal', initialSnapshot.model),
    mediumLink('Foldkit', initialSnapshot.model),
    mediumLink('React', initialSnapshot.model),
    mediumLink('ReactNativeWeb', initialSnapshot.model),
  ].join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(shareMetadata.title)}</title>
    <meta name="description" content="${htmlEscape(shareMetadata.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${htmlEscape(shareMetadata.title)}" />
    <meta property="og:description" content="${htmlEscape(shareMetadata.description)}" />
    <meta property="og:url" content="${htmlEscape(shareMetadata.stateUrl)}" />
    <meta property="og:image" content="${htmlEscape(shareMetadata.imageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${htmlEscape(shareMetadata.title)}" />
    <meta name="twitter:description" content="${htmlEscape(shareMetadata.description)}" />
    <meta name="twitter:image" content="${htmlEscape(shareMetadata.imageUrl)}" />
    <style>
      :root {
        color-scheme: dark;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        background: #09090b;
        color: #fafafa;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(34, 197, 94, 0.2), transparent 36rem),
          #09090b;
      }
      main {
        box-sizing: border-box;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(20rem, 30rem);
        gap: 1rem;
        min-height: 100vh;
        padding: 1rem;
      }
      section {
        border: 1px solid rgba(250, 250, 250, 0.14);
        border-radius: 1rem;
        background: rgba(24, 24, 27, 0.82);
        box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.35);
      }
      .counter {
        display: grid;
        place-items: center;
        min-height: 24rem;
        padding: 2rem;
        text-align: center;
      }
      .label {
        margin: 0 0 0.75rem;
        color: #a1a1aa;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .count {
        margin: 0;
        font-size: clamp(5rem, 18vw, 14rem);
        line-height: 0.9;
      }
      .mode {
        display: inline-flex;
        gap: 0.5rem;
        align-items: center;
        margin-top: 1.25rem;
        padding: 0.5rem 0.75rem;
        border-radius: 999px;
        background: rgba(63, 63, 70, 0.7);
        color: #d4d4d8;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .medium-links {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: center;
        margin-top: 1rem;
      }
      .medium-links a {
        border: 1px solid rgba(250, 250, 250, 0.14);
        border-radius: 999px;
        color: #d4d4d8;
        padding: 0.45rem 0.7rem;
        text-decoration: none;
      }
      .terminal {
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        min-height: 24rem;
        overflow: hidden;
      }
      .terminal header {
        padding: 1rem;
        border-bottom: 1px solid rgba(250, 250, 250, 0.1);
      }
      .terminal h1 {
        margin: 0;
        font-size: 1rem;
      }
      .terminal p {
        margin: 0.25rem 0 0;
        color: #a1a1aa;
      }
      .tape-replay {
        display: grid;
        gap: 0.75rem;
        padding: 1rem;
        border-bottom: 1px solid rgba(250, 250, 250, 0.1);
        background: rgba(20, 83, 45, 0.18);
      }
      .tape-replay[hidden] {
        display: none;
      }
      .tape-replay h2 {
        margin: 0;
        font-size: 0.95rem;
      }
      .tape-replay p {
        margin: 0;
        color: #bbf7d0;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.85rem;
        overflow-wrap: anywhere;
      }
      .tape-steps {
        display: grid;
        gap: 0.4rem;
        margin: 0;
        padding: 0;
        list-style: none;
        color: #d4d4d8;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.85rem;
      }
      .tape-steps li {
        margin: 0;
      }
      .tape-steps button {
        width: 100%;
        padding: 0.5rem 0.65rem;
        border-radius: 0.6rem;
        text-align: left;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.85rem;
      }
      .tape-steps button:hover {
        border-color: rgba(187, 247, 208, 0.45);
      }
      .tape-steps li[data-status="Passed"],
      .tape-steps li[data-status="Processed"] {
        color: #bbf7d0;
      }
      .tape-steps li[data-status="Observed"] {
        color: #bfdbfe;
      }
      .tape-steps li[data-status="Failed"] {
        color: #fecaca;
      }
      .tape-steps li[data-occurrence="Future"] {
        opacity: 0.38;
      }
      .tape-steps li[data-occurrence="Future"] button {
        border-color: rgba(250, 250, 250, 0.08);
        color: #71717a;
      }
      .tape-steps li[data-selected="true"] button {
        border-color: #22c55e;
        background: rgba(34, 197, 94, 0.18);
      }
      .tape-scrubber {
        display: grid;
        gap: 0.4rem;
      }
      .tape-scrubber[hidden] {
        display: none;
      }
      .tape-scrubber label {
        color: #d4d4d8;
        font-size: 0.85rem;
      }
      .tape-scrubber input {
        width: 100%;
        min-width: 0;
        padding: 0;
        accent-color: #22c55e;
      }
      .tape-scrubber-controls {
        display: flex;
        gap: 0.5rem;
      }
      .tape-scrubber-controls button {
        flex: 1;
        padding: 0.55rem 0.75rem;
      }
      .tape-scrubber p {
        margin: 0;
        color: #a1a1aa;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.85rem;
      }
      .tape-save {
        display: grid;
        gap: 0.5rem;
      }
      .tape-save[hidden] {
        display: none;
      }
      .tape-save-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .tape-save-actions button,
      .tape-save-actions a {
        border: 1px solid rgba(250, 250, 250, 0.16);
        border-radius: 0.75rem;
        background: rgba(39, 39, 42, 0.9);
        color: #fafafa;
        padding: 0.55rem 0.75rem;
        text-decoration: none;
      }
      .tape-save-actions a {
        color: #bbf7d0;
      }
      .saved-tape-run[hidden] {
        display: none;
      }
      .saved-tape-run {
        color: #93c5fd;
        overflow-wrap: anywhere;
      }
      .terminal-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 1rem;
        border-bottom: 1px solid rgba(250, 250, 250, 0.1);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .log {
        min-height: 14rem;
        margin: 0;
        padding: 1rem;
        overflow: auto;
        color: #bbf7d0;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.9rem;
        white-space: pre-wrap;
      }
      form {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 0.5rem;
        padding: 1rem;
        border-top: 1px solid rgba(250, 250, 250, 0.1);
      }
      input,
      button {
        border: 1px solid rgba(250, 250, 250, 0.16);
        border-radius: 0.75rem;
        background: rgba(39, 39, 42, 0.9);
        color: #fafafa;
        font: inherit;
      }
      input {
        min-width: 0;
        padding: 0.75rem 1rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      button {
        cursor: pointer;
        padding: 0.75rem 1rem;
      }
      button:disabled,
      input:disabled {
        cursor: wait;
        opacity: 0.55;
      }
      @media (max-width: 48rem) {
        main {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="counter" aria-live="polite">
        <div>
          <p class="label">Shared Counter Model</p>
          <p id="count" class="count">loading</p>
          <p id="mode" class="mode">Loading /?mode=Loading</p>
          <nav class="medium-links" aria-label="View medium links">
            ${mediumLinks}
          </nav>
        </div>
      </section>
      <section class="terminal">
        <header>
          <h1>${mediumLabel} medium</h1>
          <p>The URL carries portable Counter state plus the view medium suffix. Commands are decoded into Counter Messages and run through the same host runtime.</p>
        </header>
        <div id="tape-replay" class="tape-replay" hidden>
          <h2>Tape replay</h2>
          <p id="tape-status">waiting</p>
          <ol id="tape-steps" class="tape-steps"></ol>
          <div id="tape-scrubber" class="tape-scrubber" hidden>
            <label for="tape-position">Replay position</label>
            <input id="tape-position" type="range" min="0" max="0" value="0" />
            <div class="tape-scrubber-controls" aria-label="Replay step controls">
              <button id="tape-step-back" type="button">← back</button>
              <button id="tape-step-forward" type="button">forward →</button>
            </div>
            <p id="tape-position-label">Live</p>
          </div>
          <div id="tape-save" class="tape-save" hidden>
            <div class="tape-save-actions">
              <button id="save-tape" type="button">save tape</button>
              <button id="share-tape" type="button" disabled>copy share URL</button>
              <a href="https://tapes.knophy.com/#saved">view saved tapes</a>
            </div>
            <a id="saved-tape-run" class="saved-tape-run" hidden></a>
            <p id="save-tape-status">Replay first, then save.</p>
          </div>
        </div>
        <div class="terminal-actions" aria-label="Terminal command buttons">
          <button data-command="decrement">[-] decrement</button>
          <button data-command="reset">[R] reset</button>
          <button data-command="increment">[+] increment</button>
        </div>
        <pre id="log" class="log"></pre>
        <form id="form">
          <input id="command" name="command" autocomplete="off" placeholder="show | increment | decrement | reset" />
          <button id="send" type="submit">send</button>
        </form>
      </section>
    </main>
    <script type="module">
      const count = document.querySelector('#count')
      const mode = document.querySelector('#mode')
      const log = document.querySelector('#log')
      const tapeReplayPanel = document.querySelector('#tape-replay')
      const tapeStatus = document.querySelector('#tape-status')
      const tapeSteps = document.querySelector('#tape-steps')
      const tapeScrubber = document.querySelector('#tape-scrubber')
      const tapePosition = document.querySelector('#tape-position')
      const tapeStepBack = document.querySelector('#tape-step-back')
      const tapeStepForward = document.querySelector('#tape-step-forward')
      const tapePositionLabel = document.querySelector('#tape-position-label')
      const tapeSave = document.querySelector('#tape-save')
      const saveTape = document.querySelector('#save-tape')
      const shareTape = document.querySelector('#share-tape')
      const savedTapeRun = document.querySelector('#saved-tape-run')
      const saveTapeStatus = document.querySelector('#save-tape-status')
      const form = document.querySelector('#form')
      const command = document.querySelector('#command')
      const controls = Array.from(document.querySelectorAll('[data-command], #command, #send'))
      const initialSnapshot = ${initialSnapshotJson}
      const tapeReplay = ${tapeReplayJson}
      const viewMedium = '${mediumQuery}'
      const tapeStepItems = new Map()
      const tapeHistory = []
      const recordedActions = []
      const savedTapeApi = 'https://tapes.knophy.com/saved-tapes'
      let savedTapeRunUrl = null
      let isCommandPending = false
      let isReplayComplete = tapeReplay === null
      let isViewingHistory = false

      const append = value => {
        log.textContent += value + "\\n"
        log.scrollTop = log.scrollHeight
      }

      const render = snapshot => {
        count.textContent = snapshot.count
        mode.textContent = snapshot.mode + ' ' + snapshot.uri
      }

      const setPending = isPending => {
        isCommandPending = isPending
        updateControls()
      }

      const updateControls = () => {
        const isDisabled = isCommandPending || isViewingHistory
        controls.forEach(control => {
          control.disabled = isDisabled
        })
        updateSaveControls()
      }

      const updateSaveControls = () => {
        const canSave =
          isReplayComplete &&
          !isCommandPending &&
          !isViewingHistory &&
          recordedActions.length > 0
        saveTape.disabled = !canSave
        shareTape.disabled = savedTapeRunUrl === null
      }

      const resetSavedTapeLink = () => {
        savedTapeRunUrl = null
        savedTapeRun.hidden = true
        savedTapeRun.removeAttribute('href')
        savedTapeRun.textContent = ''
      }

      const setSaveStatus = value => {
        saveTapeStatus.textContent = value
      }

      const actionForTapeStep = step => {
        if (step === 'Increment') {
          return 'increment'
        } else if (step === 'Decrement') {
          return 'decrement'
        } else {
          return 'reset'
        }
      }

      const actionForCommandName = commandName => {
        if (commandName === 'Increment') {
          return 'increment'
        } else if (commandName === 'Decrement') {
          return 'decrement'
        } else if (commandName === 'Reset') {
          return 'reset'
        } else {
          return null
        }
      }

      const recordAction = action => {
        recordedActions.push(action)
        resetSavedTapeLink()
        if (isReplayComplete) {
          setSaveStatus(recordedActions.length + ' actions ready to save.')
        }
        updateSaveControls()
      }

      const saveRecordedTape = async () => {
        if (recordedActions.length === 0 || isViewingHistory) {
          return
        }

        saveTape.disabled = true
        setSaveStatus('saving tape...')
        try {
          const response = await fetch(savedTapeApi, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({ actions: recordedActions }),
          })
          const payload = await response.json()
          if (response.ok) {
            savedTapeRunUrl = payload.run
            savedTapeRun.href = payload.run
            savedTapeRun.textContent = payload.run
            savedTapeRun.hidden = false
            setSaveStatus('saved ' + payload.name)
          } else {
            setSaveStatus('save failed: ' + payload.reason)
          }
        } catch (error) {
          setSaveStatus('save failed: ' + String(error))
        } finally {
          updateSaveControls()
        }
      }

      const copySavedTapeUrl = async () => {
        if (savedTapeRunUrl === null) {
          return
        }

        try {
          await navigator.clipboard.writeText(savedTapeRunUrl)
          setSaveStatus('copied share URL')
        } catch (error) {
          setSaveStatus('share URL: ' + savedTapeRunUrl)
        }
      }

      const liveHistoryIndex = () => Math.max(tapeHistory.length - 1, 0)

      const tapeHistoryEntryAt = index => tapeHistory.at(index)

      const updateTapeStepSelection = index => {
        tapeStepItems.forEach((item, stepIndex) => {
          item.dataset.occurrence = stepIndex <= index ? 'Occurred' : 'Future'
          item.dataset.selected = stepIndex === index ? 'true' : 'false'
          const button = item.querySelector('button')
          if (button !== null) {
            button.setAttribute(
              'aria-current',
              stepIndex === index ? 'step' : 'false',
            )
          }
        })
      }

      const updateScrubberStepControls = index => {
        tapeStepBack.disabled = index <= 0
        tapeStepForward.disabled = index >= liveHistoryIndex()
      }

      const updateScrubberLabel = index => {
        const entry = tapeHistoryEntryAt(index)
        if (entry === undefined) {
          tapePositionLabel.textContent = 'Live'
        } else if (index === liveHistoryIndex()) {
          tapePositionLabel.textContent = entry.label + ' · live'
        } else {
          tapePositionLabel.textContent = entry.label + ' · history preview'
        }
        updateTapeStepSelection(index)
        updateScrubberStepControls(index)
      }

      const showScrubberAtLive = () => {
        if (tapeHistory.length === 0) {
          return
        }

        const liveIndex = liveHistoryIndex()
        tapeScrubber.hidden = false
        tapePosition.max = String(liveIndex)
        tapePosition.value = String(liveIndex)
        isViewingHistory = false
        updateScrubberLabel(liveIndex)
        updateControls()
      }

      const recordTapeHistory = (label, snapshot) => {
        tapeHistory.push({ label, snapshot })
        if (!tapeScrubber.hidden) {
          showScrubberAtLive()
        }
      }

      const previewTapeHistory = index => {
        const entry = tapeHistoryEntryAt(index)
        if (entry === undefined) {
          return
        }

        tapePosition.value = String(index)
        render(entry.snapshot)
        isViewingHistory = index !== liveHistoryIndex()
        updateScrubberLabel(index)
        updateControls()
      }

      const stepTapeHistory = offset => {
        const currentIndex = Number.parseInt(tapePosition.value, 10)
        const nextIndex = Math.max(0, Math.min(liveHistoryIndex(), currentIndex + offset))
        previewTapeHistory(nextIndex)
      }

      const createTapeStepItem = payload => {
        const item = document.createElement('li')
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = payload.index + '/' + payload.total + ' ' + payload.entry.label + ' running'
        button.addEventListener('click', () => {
          previewTapeHistory(payload.index)
        })
        item.append(button)
        item.dataset.status = 'Running'
        item.dataset.occurrence = 'Future'
        item.dataset.selected = 'false'
        tapeStepItems.set(payload.index, item)
        tapeSteps.append(item)
        updateTapeStepSelection(Number.parseInt(tapePosition.value, 10))
        return item
      }

      const updateTapeStepItem = payload => {
        const item = tapeStepItems.get(payload.index) ?? createTapeStepItem(payload)
        const button = item.querySelector('button')
        if (button !== null) {
          button.textContent =
          payload.index +
          '/' +
          payload.total +
          ' ' +
          payload.entry.label +
          ' ' +
          payload.status +
          ' count ' +
          payload.snapshot.count
        }
        item.dataset.status = payload.status
        updateTapeStepSelection(Number.parseInt(tapePosition.value, 10))
      }

      const startTapeReplay = () => {
        if (tapeReplay === null) {
          return
        }

        tapeHistory.splice(0)
        recordedActions.splice(0)
        resetSavedTapeLink()
        tapeReplayPanel.hidden = false
        tapeScrubber.hidden = true
        tapeSave.hidden = true
        tapeStatus.textContent = 'loading ' + tapeReplay.tapeUrl
        setSaveStatus('Replay first, then save.')
        isViewingHistory = false
        setPending(true)
        append('replay ' + tapeReplay.tapeUrl)

        const replayUrl = new URL('/tape-run-events', window.location.origin)
        replayUrl.searchParams.set('medium', viewMedium)
        replayUrl.searchParams.set('replayTapeUrl', tapeReplay.tapeUrl)
        const source = new EventSource(replayUrl.toString())

        source.addEventListener('message', event => {
          const payload = JSON.parse(event.data)
          if (payload._tag === 'TapeReplayStarted') {
            render(payload.snapshot)
            recordTapeHistory('start count ' + payload.snapshot.count, payload.snapshot)
            tapeStatus.textContent = 'processing ' + payload.total + ' tape entries'
          } else if (payload._tag === 'TapeReplayStepStarted') {
            createTapeStepItem(payload)
          } else if (payload._tag === 'TapeReplayStepCompleted') {
            render(payload.snapshot)
            updateTapeStepItem(payload)
            if (payload.entry._tag === 'Action') {
              recordAction(actionForTapeStep(payload.entry.step))
            }
            recordTapeHistory(
              payload.index +
                '/' +
                payload.total +
                ' ' +
                payload.entry.label +
                ' ' +
                payload.status,
              payload.snapshot,
            )
          } else if (payload._tag === 'TapeReplayCompleted') {
            render(payload.snapshot)
            tapeStatus.textContent = 'complete ' + payload.snapshot.uri
            append('replay complete ' + payload.snapshot.uri)
            isReplayComplete = true
            showScrubberAtLive()
            tapeSave.hidden = false
            setSaveStatus(recordedActions.length + ' actions ready to save.')
            setPending(false)
            command.focus()
            source.close()
          } else if (payload._tag === 'TapeReplayFailed') {
            render(payload.snapshot)
            tapeStatus.textContent = 'failed ' + payload.reason
            append('replay failed: ' + payload.reason)
            isReplayComplete = true
            setPending(false)
            source.close()
          }
        })

        source.addEventListener('error', () => {
          if (!isReplayComplete) {
            tapeStatus.textContent = 'lost replay stream'
            append('replay stream lost')
            isReplayComplete = true
            setPending(false)
          }
          source.close()
        })
      }

      const send = async input => {
        if (isCommandPending) {
          append('busy: waiting for current command to settle')
          return
        }
        if (isViewingHistory) {
          append('history: move replay position to live before sending commands')
          return
        }

        const commandText = input.trim()
        setPending(true)
        append('$ ' + commandText)
        try {
          const response = await fetch('/commands', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-foldkit-view-medium': viewMedium,
            },
            body: JSON.stringify({ input: commandText }),
          })
          const payload = await response.json()
          if (response.ok) {
            render(payload.snapshot)
            const maybeAction = actionForCommandName(payload.command)
            if (maybeAction !== null) {
              recordAction(maybeAction)
            }
            if (isReplayComplete && tapeReplay !== null) {
              recordTapeHistory('$ ' + commandText, payload.snapshot)
            }
            append(payload.output)
          } else {
            append('error: ' + payload.reason)
          }
        } catch (error) {
          append('error: ' + String(error))
        } finally {
          setPending(false)
          command.focus()
        }
      }

      new EventSource('/events?medium=' + encodeURIComponent(viewMedium)).addEventListener('message', event => {
        if (!isViewingHistory) {
          render(JSON.parse(event.data))
        }
      })

      tapePosition.addEventListener('input', () => {
        previewTapeHistory(Number.parseInt(tapePosition.value, 10))
      })

      tapeStepBack.addEventListener('click', () => {
        stepTapeHistory(-1)
      })

      tapeStepForward.addEventListener('click', () => {
        stepTapeHistory(1)
      })

      saveTape.addEventListener('click', () => {
        saveRecordedTape()
      })

      shareTape.addEventListener('click', () => {
        copySavedTapeUrl()
      })

      form.addEventListener('submit', event => {
        event.preventDefault()
        const input = command.value
        command.value = ''
        send(input)
      })

      document.querySelectorAll('[data-command]').forEach(button => {
        button.addEventListener('click', () => {
          send(button.dataset.command ?? '')
        })
      })

      render(initialSnapshot)
      append('opened ' + initialSnapshot.uri)
      startTapeReplay()
      command.focus()
    </script>
  </body>
</html>
`
}

const serveEvents = (
  response: ServerResponse,
  runtime: Runtime.HostRuntime<Model, Message>,
  clients: Set<PortalClient>,
  medium: ViewMedium,
): void => {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  })
  const client = { medium, response }
  clients.add(client)
  writeSnapshotEvent(response, snapshotForModel(runtime.readModel(), medium))
  response.on('close', () => {
    clients.delete(client)
  })
}

const loadCounterTapeEntries = (
  tapeUrl: URL,
): Effect.Effect<ReadonlyArray<CounterTapeEntry>, CounterPortalServerError> =>
  Effect.gen(function* () {
    const xml = yield* fetchCounterTapeXml(tapeUrl).pipe(
      Effect.mapError(
        error => new CounterPortalServerError({ reason: error.reason }),
      ),
    )
    return yield* parseCounterTapeEntries(xml).pipe(
      Effect.mapError(
        error => new CounterPortalServerError({ reason: error.reason }),
      ),
    )
  })

const runTapeReplayEntry = (
  runtime: Runtime.HostRuntime<Model, Message>,
  entry: CounterTapeEntry,
): Effect.Effect<Model, CounterPortalServerError> => {
  const maybeMessage = messageForCounterTapeEntry(entry)
  if (Option.isSome(maybeMessage)) {
    return runtime.run(maybeMessage.value)
  } else {
    return Effect.succeed(runtime.readModel())
  }
}

const runTapeReplay = (
  response: ServerResponse,
  runtime: Runtime.HostRuntime<Model, Message>,
  tapeUrl: URL,
  medium: ViewMedium,
  isClosed: () => boolean,
): Effect.Effect<void, CounterPortalServerError> =>
  Effect.gen(function* () {
    const entries = yield* loadCounterTapeEntries(tapeUrl)
    const total = entries.length
    writeTapeReplayEvent(response, {
      _tag: 'TapeReplayStarted',
      snapshot: snapshotForModel(runtime.readModel(), medium),
      tapeUrl: tapeUrl.toString(),
      total,
    })

    let index = 0
    for (const entry of entries) {
      if (isClosed()) {
        return
      }

      index += 1
      writeTapeReplayEvent(response, {
        _tag: 'TapeReplayStepStarted',
        entry,
        index,
        total,
      })

      const model = yield* runTapeReplayEntry(runtime, entry)
      const snapshot = snapshotForModel(model, medium)
      writeTapeReplayEvent(response, {
        _tag: 'TapeReplayStepCompleted',
        entry,
        index,
        snapshot,
        status: statusForTapeEntry(entry, model),
        total,
      })
      yield* pauseTapeReplay
    }

    writeTapeReplayEvent(response, {
      _tag: 'TapeReplayCompleted',
      snapshot: snapshotForModel(runtime.readModel(), medium),
      tapeUrl: tapeUrl.toString(),
      total,
    })
  })

const serveTapeReplayEvents = (
  request: IncomingMessage,
  response: ServerResponse,
  runtime: Runtime.HostRuntime<Model, Message>,
  commandGate: CommandGate,
  url: URL,
): void => {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  })

  const medium = mediumForQuery(url.searchParams.get('medium'))
  const origin = originForRequest(request)
  let isClosed = false
  response.on('close', () => {
    isClosed = true
  })

  if (commandGate.isRunning) {
    writeTapeReplayEvent(response, {
      _tag: 'TapeReplayFailed',
      reason: 'Terminal is busy. Wait for the current command to settle.',
      snapshot: snapshotForModel(runtime.readModel(), medium),
    })
    response.end()
    return
  }

  commandGate.isRunning = true
  Effect.runPromise(
    maybeReplayTapeUrlForUrl(url, origin).pipe(
      Effect.flatMap(maybeTapeReplay => {
        if (Option.isSome(maybeTapeReplay)) {
          return runTapeReplay(
            response,
            runtime,
            maybeTapeReplay.value.tapeUrl,
            medium,
            () => isClosed,
          )
        } else {
          return Effect.fail(
            new CounterPortalServerError({
              reason: 'Tape replay needs replayTapeUrl',
            }),
          )
        }
      }),
    ),
  )
    .then(
      () => undefined,
      error => {
        writeTapeReplayEvent(response, {
          _tag: 'TapeReplayFailed',
          reason:
            error instanceof CounterPortalServerError
              ? error.reason
              : globalThis.String(error),
          snapshot: snapshotForModel(runtime.readModel(), medium),
        })
      },
    )
    .finally(() => {
      commandGate.isRunning = false
      if (!response.destroyed && !response.writableEnded) {
        response.end()
      }
    })
}

const serveCommand = (
  request: IncomingMessage,
  response: ServerResponse,
  runtime: Runtime.HostRuntime<Model, Message>,
  commandGate: CommandGate,
  medium: ViewMedium,
): void => {
  if (commandGate.isRunning) {
    writeJson(response, 409, {
      reason: 'Terminal is busy. Wait for the current command to settle.',
    })
    return
  }

  commandGate.isRunning = true
  Effect.runPromise(
    Effect.gen(function* () {
      const body = yield* readRequestBody(request)
      const input = yield* parseCommandRequest(body)
      return yield* runPortalCommand(runtime, input, medium)
    }),
  )
    .then(
      result => writeJson(response, 200, result),
      error =>
        writeJson(response, 400, {
          reason:
            error instanceof CounterPortalServerError
              ? error.reason
              : globalThis.String(error),
        }),
    )
    .finally(() => {
      commandGate.isRunning = false
    })
}

const servePage = (
  request: IncomingMessage,
  response: ServerResponse,
  runtime: Runtime.HostRuntime<Model, Message>,
  commandGate: CommandGate,
  url: URL,
  medium: ViewMedium,
): void => {
  if (urlHasLaunchWork(url) && commandGate.isRunning) {
    writeJson(response, 409, {
      reason: 'Terminal is busy. Wait for the current command to settle.',
    })
    return
  }

  if (urlHasLaunchWork(url)) {
    commandGate.isRunning = true
  }

  const origin = originForRequest(request)
  Effect.runPromise(
    Effect.gen(function* () {
      const snapshot = yield* applyUrlRequest(runtime, url, medium, origin)
      const maybeTapeReplay = yield* maybeReplayTapeUrlForUrl(url, origin)
      return { maybeTapeReplay, snapshot }
    }),
  )
    .then(
      ({ maybeTapeReplay, snapshot }) => {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        })
        response.end(htmlForMedium(medium, snapshot, origin, maybeTapeReplay))
      },
      error =>
        writeJson(response, 400, {
          reason:
            error instanceof CounterPortalServerError
              ? error.reason
              : globalThis.String(error),
        }),
    )
    .finally(() => {
      if (urlHasLaunchWork(url)) {
        commandGate.isRunning = false
      }
    })
}

const modelForCardUrl = (
  runtime: Runtime.HostRuntime<Model, Message>,
  url: URL,
): Effect.Effect<Model, CounterPortalServerError> =>
  Effect.gen(function* () {
    const maybeModel = yield* maybeModelForUrl(url)
    if (Option.isSome(maybeModel)) {
      return maybeModel.value
    } else {
      return runtime.readModel()
    }
  })

const serveCardImage = (
  request: IncomingMessage,
  response: ServerResponse,
  runtime: Runtime.HostRuntime<Model, Message>,
  url: URL,
): void => {
  const medium = mediumForQuery(url.searchParams.get('medium'))
  Effect.runPromise(modelForCardUrl(runtime, url)).then(
    model => {
      const snapshot = snapshotForModel(model, medium)
      const origin = originForRequest(request)
      const shareMetadata = shareMetadataForSnapshot(snapshot, origin)
      const image = renderCounterShareCardPng({
        count: snapshot.count,
        decrementUrl: shareMetadata.decrementUrl,
        incrementUrl: shareMetadata.incrementUrl,
        mediumLabel: labelForMedium(medium),
        stateUrl: shareMetadata.stateUrl,
      })

      response.writeHead(200, {
        'content-type': 'image/png',
        'cache-control': 'no-store',
        'content-length': image.byteLength,
      })
      response.end(image)
    },
    error =>
      writeJson(response, 400, {
        reason:
          error instanceof CounterPortalServerError
            ? error.reason
            : globalThis.String(error),
      }),
  )
}

const makeRequestHandler = (
  runtime: Runtime.HostRuntime<Model, Message>,
  clients: Set<PortalClient>,
  commandGate: CommandGate,
) => {
  return (request: IncomingMessage, response: ServerResponse): void => {
    const url = new URL(request.url ?? '/', 'http://foldkit.local')
    const maybeMedium = mediumForPath(url.pathname)

    if (request.method === 'GET' && Option.isSome(maybeMedium)) {
      servePage(request, response, runtime, commandGate, url, maybeMedium.value)
    } else if (
      request.method === 'GET' &&
      url.pathname === '/counter-card.png'
    ) {
      serveCardImage(request, response, runtime, url)
    } else if (request.method === 'GET' && url.pathname === DEFAULT_TAPE_PATH) {
      writeXml(response, 200, sampleIncrementTapeXml)
    } else if (
      request.method === 'GET' &&
      url.pathname === '/tape-run-events'
    ) {
      serveTapeReplayEvents(request, response, runtime, commandGate, url)
    } else if (request.method === 'GET' && url.pathname === '/events') {
      serveEvents(
        response,
        runtime,
        clients,
        mediumForQuery(url.searchParams.get('medium')),
      )
    } else if (request.method === 'GET' && url.pathname === '/model') {
      writeJson(
        response,
        200,
        snapshotForModel(
          runtime.readModel(),
          mediumForQuery(url.searchParams.get('medium')),
        ),
      )
    } else if (request.method === 'POST' && url.pathname === '/commands') {
      serveCommand(
        request,
        response,
        runtime,
        commandGate,
        mediumForQuery(
          request.headers['x-foldkit-view-medium']?.toString() ?? null,
        ),
      )
    } else if (request.method === 'GET' && url.pathname === '/healthz') {
      writeText(response, 200, 'ok\n')
    } else {
      writeJson(response, 404, { reason: 'Not found' })
    }
  }
}

const resolveAddress = (
  server: Server,
  host: string,
): Effect.Effect<readonly [number, string], CounterPortalServerError> =>
  Effect.sync(() => server.address()).pipe(
    Effect.flatMap(address => {
      if (typeof address === 'object' && address !== null) {
        return Effect.succeed([address.port, `http://${host}:${address.port}`])
      } else {
        return Effect.fail(
          new CounterPortalServerError({
            reason: 'HTTP server did not expose a TCP address',
          }),
        )
      }
    }),
  )

const listen = (
  server: Server,
  host: string,
  port: number,
): Effect.Effect<readonly [number, string], CounterPortalServerError> =>
  Effect.callback<readonly [number, string], CounterPortalServerError>(
    resume => {
      const handleError = (error: Error): void => {
        resume(
          Effect.fail(
            new CounterPortalServerError({
              reason: globalThis.String(error),
            }),
          ),
        )
      }

      server.once('error', handleError)
      server.listen(port, host, () => {
        server.off('error', handleError)
        resume(resolveAddress(server, host))
      })

      return Effect.sync(() => {
        server.off('error', handleError)
      })
    },
  )

const closeServer = (server: Server): Effect.Effect<void> => {
  if (!server.listening) {
    return Effect.void
  } else {
    return Effect.promise(
      () =>
        new Promise<void>((resolve, reject) => {
          server.close(error => {
            if (error !== undefined) {
              reject(error)
            } else {
              resolve()
            }
          })
        }),
    ).pipe(Effect.orDie)
  }
}

const parsePort = (port: string | undefined): number => {
  if (port === undefined) {
    return DEFAULT_PORT
  } else {
    return Number.parseInt(port, 10)
  }
}

/** Starts a shared-state Counter GUI with an HTTP command portal. */
export const makeCounterPortalServer = (
  options: CounterPortalServerOptions = {},
): Effect.Effect<CounterPortalServer, CounterPortalServerError> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    const runtime = yield* Effect.provideService(
      Runtime.makeHostRuntime({
        ...makeCounterProgram(Loading()),
        resources: counterStorageLayer(),
      }),
      Scope.Scope,
      scope,
    )
    yield* runtime.initialization

    const clients = new Set<PortalClient>()
    const commandGate: CommandGate = { isRunning: false }
    const unsubscribe = runtime.observeModel(model => {
      clients.forEach(client =>
        writeSnapshotEvent(
          client.response,
          snapshotForModel(model, client.medium),
        ),
      )
    })
    const server = createServer(
      makeRequestHandler(runtime, clients, commandGate),
    )
    const host = options.host ?? DEFAULT_HOST
    const [port, localUrl] = yield* listen(
      server,
      host,
      options.port ?? DEFAULT_PORT,
    )

    return {
      localUrl,
      port,
      shutdown: Effect.gen(function* () {
        unsubscribe()
        clients.forEach(client => client.response.end())
        clients.clear()
        yield* closeServer(server)
        yield* runtime.shutdown
        yield* Scope.close(scope, Exit.void)
      }),
    }
  })

/** Runs the terminal portal until the process is interrupted. */
export const runCounterPortalServer = (
  options: CounterPortalServerOptions = {},
): Effect.Effect<void, CounterPortalServerError> =>
  Effect.scoped(
    Effect.acquireRelease(
      makeCounterPortalServer(options),
      server => server.shutdown,
    ).pipe(
      Effect.tap(server =>
        Effect.sync(() => {
          process.stdout.write(`Counter terminal portal: ${server.localUrl}\n`)
        }),
      ),
      Effect.flatMap(() => Effect.never),
    ),
  )

/** Reads terminal portal host and port options from process environment. */
export const optionsFromEnvironment = (): CounterPortalServerOptions => ({
  host: process.env[HOST_ENVIRONMENT_VARIABLE] ?? DEFAULT_HOST,
  port: parsePort(process.env[PORT_ENVIRONMENT_VARIABLE]),
})
