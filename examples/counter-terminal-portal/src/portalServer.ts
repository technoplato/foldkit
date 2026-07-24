import {
  Data,
  Effect,
  Exit,
  Match as M,
  Option,
  Schema as S,
  Scope,
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
import { parseCounterUri, printCounterUri } from './counterUri.js'
import { counterStorageLayer } from './nodeHost.js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 8765
const MAX_BODY_BYTES = 4096
const HOST_ENVIRONMENT_VARIABLE = 'FOLDKIT_COUNTER_PORTAL_HOST'
const PORT_ENVIRONMENT_VARIABLE = 'PORT'

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
  url.searchParams.has('mode') || url.searchParams.has('command')

const applyUrlRequest = (
  runtime: Runtime.HostRuntime<Model, Message>,
  url: URL,
  medium: ViewMedium,
): Effect.Effect<PortalSnapshot, CounterPortalServerError> =>
  Effect.gen(function* () {
    const maybeModel = yield* maybeModelForUrl(url)
    const model = Option.isSome(maybeModel)
      ? yield* runtime.run(RequestedOpenCounter({ model: maybeModel.value }))
      : runtime.readModel()

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

const writeSnapshotEvent = (
  response: ServerResponse,
  snapshot: PortalSnapshot,
): void => {
  response.write(`data: ${JSON.stringify(snapshot)}\n\n`)
}

const labelForMedium = (medium: ViewMedium): string =>
  M.value(medium).pipe(
    M.withReturnType<string>(),
    M.when('Terminal', () => 'Terminal'),
    M.when('Foldkit', () => 'Foldkit'),
    M.when('React', () => 'React'),
    M.when('ReactNativeWeb', () => 'React Native Web'),
    M.exhaustive,
  )

const mediumLink = (medium: ViewMedium, model: Model): string =>
  `<a href="${carrierUriForModel(medium, model)}">${labelForMedium(medium)}</a>`

const htmlForMedium = (
  medium: ViewMedium,
  initialSnapshot: PortalSnapshot,
): string => {
  const initialSnapshotJson = JSON.stringify(initialSnapshot)
  const mediumLabel = labelForMedium(medium)
  const mediumQuery = mediumQueryValue(medium)
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
    <title>Foldkit Counter ${mediumLabel}</title>
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
      const form = document.querySelector('#form')
      const command = document.querySelector('#command')
      const controls = Array.from(document.querySelectorAll('[data-command], #command, #send'))
      const initialSnapshot = ${initialSnapshotJson}
      const viewMedium = '${mediumQuery}'
      let isCommandPending = false

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
        controls.forEach(control => {
          control.disabled = isPending
        })
      }

      const send = async input => {
        if (isCommandPending) {
          append('busy: waiting for current command to settle')
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
        render(JSON.parse(event.data))
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

  Effect.runPromise(applyUrlRequest(runtime, url, medium))
    .then(
      snapshot => {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        })
        response.end(htmlForMedium(medium, snapshot))
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

const makeRequestHandler = (
  runtime: Runtime.HostRuntime<Model, Message>,
  clients: Set<PortalClient>,
  commandGate: CommandGate,
) => {
  return (request: IncomingMessage, response: ServerResponse): void => {
    const url = new URL(request.url ?? '/', 'http://foldkit.local')
    const maybeMedium = mediumForPath(url.pathname)

    if (request.method === 'GET' && Option.isSome(maybeMedium)) {
      servePage(response, runtime, commandGate, url, maybeMedium.value)
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
