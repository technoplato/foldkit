import {
  CounterFactClient,
  type Message,
  type Model,
  MultipleCountersProgram,
  StaticCounterFactClient,
} from 'counters-core-example'
import { Effect, Scope } from 'effect'
import { Runtime } from 'foldkit'
import * as InteractionGraph from 'foldkit/interaction-graph'
import { onUpdate } from 'foldkit/program'
import { existsSync, readFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'

import {
  type SurfaceIdentity,
  patchEvent,
  resolveToken,
  screenFragment,
} from './render.js'
import { gitSourceUrl } from './surfaceLabel.js'

// DATASTAR SURFACE (SERVER HOST)
//
// Datastar is hypermedia-first: the server holds the state and streams
// DOM patches over SSE. One Node process runs MultipleCountersProgram;
// every connected browser receives element patches on each transition,
// and button intents POST back through the same token resolution the
// CLI uses. Multi-user by construction: two tabs converge on one tape.
//
// Decorator adoption: transitions are observed server-side via onUpdate.

const identity: SurfaceIdentity = {
  surface: 'Datastar (SSE server)',
  sourceUrl: gitSourceUrl(),
}

const occurrenceId = InteractionGraph.InteractionOccurrenceId.make('datastar-1')

let send: ((message: Message) => void) | undefined = undefined
let currentModel: Model | undefined = undefined
const clients = new Set<http.ServerResponse>()

/** Locates the Datastar browser bundle shipped by its npm package. */
const datastarBundlePath = (): string | undefined => {
  try {
    const require_ = createRequire(import.meta.url)
    const pkgRoot = path.dirname(
      require_.resolve('@starfederation/datastar/package.json'),
    )
    const candidates = [
      'dist/bundles/datastar.js',
      'dist/datastar.js',
      'bundles/datastar.js',
    ]
    for (const candidate of candidates) {
      const full = path.join(pkgRoot, candidate)
      if (existsSync(full)) {
        return full
      }
    }
  } catch {
    // Package not installed: the page falls back to a CDN script tag.
  }
  return undefined
}

let bundleFile: string | undefined

const screenHtml = (): string =>
  currentModel === undefined ? '' : screenFragment(currentModel, identity)

/** Broadcasts one element patch of the whole screen to every SSE client. */
const broadcast = (): void => {
  if (currentModel === undefined) return
  const event = patchEvent(screenFragment(currentModel, identity))
  for (const client of clients) {
    client.write(event)
  }
}

const pageHtml = (): string => `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Foldkit | Multiple Counters — Datastar</title>
<script src="/datastar.js" defer></script>
<style>
body{background:#0c0a09;color:#fafaf9;padding:2rem;font-family:ui-monospace,monospace}
.banner{color:#fbbf24;font-weight:600}
.carrier{color:#a8a29e}
button{background:#fbbf24;color:#0c0a09;border:none;padding:.4rem .8rem;border-radius:6px;margin-right:.4rem;cursor:pointer;font-family:inherit}
li{margin:.3rem 0}
</style>
</head>
<body>
<div id="screen">${screenHtml()}</div>
</body>
</html>`

const handleRequest = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void => {
  const url = req.url ?? '/'
  if (url === '/datastar.js') {
    if (bundleFile === undefined || !existsSync(bundleFile)) {
      res.writeHead(404)
      res.end('// datastar bundle not found')
      return
    }
    res.writeHead(200, { 'content-type': 'text/javascript' })
    res.end(readFileSync(bundleFile))
    return
  }
  if (url === '/sse') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    clients.add(res)
    if (currentModel !== undefined) {
      res.write(patchEvent(screenFragment(currentModel, identity)))
    }
    req.on('close', () => {
      clients.delete(res)
    })
    return
  }
  if (url.startsWith('/action/') && req.method === 'POST') {
    const token = decodeURIComponent(url.slice('/action/'.length))
    if (send !== undefined && currentModel !== undefined) {
      const message = resolveToken(currentModel, token, occurrenceId)
      if (message !== undefined) {
        send(message)
      }
    }
    res.writeHead(204)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(pageHtml())
}

const port = Number(process.env['PORT'] ?? 5231)

// Manual scope: the runtime lives as long as the process does.
const scope = Effect.runSync(Scope.make())
void Effect.runPromise(
  Effect.gen(function* () {
    // Decorator adoption: observe every transition server-side without
    // touching the Program's update.
    const decorated = onUpdate<Model, Message, CounterFactClient>(
      ({ message }) => {
        console.info(`[datastar] ${message._tag}`)
      },
    )(MultipleCountersProgram)

    const runtime = yield* Runtime.makeProgramRuntime({
      program: decorated,
      resources: StaticCounterFactClient,
    })
    yield* runtime.initialization

    send = message => runtime.send(message)
    runtime.observeModel(model => {
      currentModel = model
      broadcast()
    })
  }).pipe(Effect.provideService(Scope.Scope, scope)),
).then(() => {
  bundleFile = datastarBundlePath()
  const server = http.createServer(handleRequest)
  server.listen(port, () => {
    console.log(
      `Datastar Counters listening on http://localhost:${port.toString()} · Source: ${
        identity.sourceUrl === '' ? 'local checkout' : identity.sourceUrl
      }`,
    )
  })
})
