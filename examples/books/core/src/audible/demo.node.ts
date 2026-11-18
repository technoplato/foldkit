import {
  Array,
  Duration,
  Effect,
  Layer,
  Option,
  Redacted,
  Stream,
  String,
} from 'effect'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'

import { Milliseconds } from '../ids.js'
import {
  AudibleBridge,
  AudibleBridgeError,
  type BridgeErrorKind,
} from './bridge.node.js'
import {
  type LibraryImport,
  type TitleDetails,
  unwiredLibraryImport,
} from './libraryImport.js'
import { scribeLibraryImport } from './scribeImport.node.js'
import { Asin, type ListedTitle } from './title.js'

// DEMO

/** Where the demo's stand-in for Amazon's landing page is served. */
export const demoLandingPath = '/__books/audible-demo/landing'

const minuteMs = 60_000

const devAppPrefix = 'bd40c50a'

/**
 * What a made-up title is to the importer: a book bought outright, a free
 * one, an explicit one, a podcast, or an Audible Plus loan.
 */
type DemoKind = 'Book' | 'Free' | 'Explicit' | 'Podcast' | 'AudiblePlusLoan'

type DemoTitle = Readonly<{
  asin: string
  name: string
  author: string
  narrator: string
  minutes: number
  color: string
  kind: DemoKind
  maybeSeries: Option.Option<Readonly<{ name: string; sequence: string }>>
  chapters: ReadonlyArray<string>
}>

const demoTitles: ReadonlyArray<DemoTitle> = [
  {
    asin: 'B0DEMO0001',
    name: 'The Quiet Orchard',
    author: 'Mara Linden',
    narrator: 'Ezra Vale',
    minutes: 552,
    color: '#2f5f1e',
    kind: 'Book',
    maybeSeries: Option.none(),
    chapters: ['Blossom', 'Graft', 'Frost', 'Harvest'],
  },
  {
    asin: 'B0DEMO0002',
    name: 'Salt and Starlight',
    author: 'Theo Banks',
    narrator: 'Ivy Hart',
    minutes: 700,
    color: '#1e3a5f',
    kind: 'Book',
    maybeSeries: Option.some({ name: 'Lighthouse Tales', sequence: '1' }),
    chapters: ['Night Tide', 'The Lamp Room', 'Landfall'],
  },
  {
    asin: 'B0DEMO0003',
    name: 'A Map of Small Rivers',
    author: 'June Okafor',
    narrator: 'Sam Rowe',
    minutes: 425,
    color: '#5f4b1e',
    kind: 'Book',
    maybeSeries: Option.none(),
    chapters: ['Source', 'Bend', 'Delta'],
  },
  {
    asin: 'B0DEMO0004',
    name: 'The Glass Cartographer',
    author: 'Ines Varga',
    narrator: 'Tom Ellis',
    minutes: 610,
    color: '#5f1e3a',
    kind: 'Book',
    maybeSeries: Option.none(),
    chapters: ['North', 'East', 'South', 'West'],
  },
  {
    asin: 'B0DEMO0005',
    name: 'Winter Bees',
    author: 'Rosa Delgado',
    narrator: 'Marcus Lee',
    minutes: 390,
    color: '#3a1e5f',
    kind: 'Book',
    maybeSeries: Option.none(),
    chapters: ['First Snow', 'The Cluster', 'Thaw'],
  },
  {
    asin: 'B0DEMO0006',
    name: 'The Long Way to Noon',
    author: 'Felix Moreau',
    narrator: 'Ava Chen',
    minutes: 800,
    color: '#1e5f5a',
    kind: 'Explicit',
    maybeSeries: Option.some({ name: 'Noon Trilogy', sequence: '2' }),
    chapters: ['Dawn Road', 'The Ferry', 'High Sun', 'Noon'],
  },
  {
    asin: 'B0DEMO0007',
    name: 'Paper Boats',
    author: 'Nadia Rahman',
    narrator: 'Leo Park',
    minutes: 95,
    color: '#5f2f1e',
    kind: 'Free',
    maybeSeries: Option.none(),
    chapters: ['Fold', 'Launch', 'Current'],
  },
  {
    asin: 'B0DEMO0008',
    name: 'Field Notes on Kindness',
    author: 'Owen Pike',
    narrator: 'Grace Liu',
    minutes: 490,
    color: '#4a5f1e',
    kind: 'Book',
    maybeSeries: Option.none(),
    chapters: ['Morning', 'Neighbors', 'Strangers', 'Evening'],
  },
  {
    asin: 'B0DEMO0009',
    name: 'Notes from the Night Ferry',
    author: 'Kai Brennan',
    narrator: 'Ruth Ames',
    minutes: 280,
    color: '#1e2f5f',
    kind: 'Book',
    maybeSeries: Option.none(),
    chapters: [],
  },
  {
    asin: 'B0DEMOPOD1',
    name: 'The Made-Up Hour',
    author: 'Made-Up Radio',
    narrator: 'Made-Up Radio',
    minutes: 45,
    color: '#444444',
    kind: 'Podcast',
    maybeSeries: Option.none(),
    chapters: [],
  },
  {
    asin: 'B0DEMOPLUS',
    name: 'Borrowed Light',
    author: 'Corin Ash',
    narrator: 'Wren Hollis',
    minutes: 330,
    color: '#555555',
    kind: 'AudiblePlusLoan',
    maybeSeries: Option.none(),
    chapters: [],
  },
]

const escapedXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const coverSvgOf = (title: DemoTitle): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="${title.color}"/><text x="150" y="150" font-family="Georgia, serif" font-size="26" fill="#f5f0e6" text-anchor="middle">${escapedXml(title.name)}</text><text x="150" y="190" font-family="Georgia, serif" font-size="16" fill="#f5f0e6" opacity="0.75" text-anchor="middle">${escapedXml(title.author)}</text></svg>`

const coverUrlOf = (title: DemoTitle): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(coverSvgOf(title))}`

const purchasedAtOf = (index: number): string =>
  new Date(Date.UTC(2026, 8, 30 - index * 3)).toISOString()

const listedOf = (title: DemoTitle): ListedTitle => ({
  asin: Asin.make(title.asin),
  name: title.name,
  maybeSubtitle: Option.none(),
  authors: [title.author],
  narrators: [title.narrator],
  series: Array.fromOption(
    Option.map(title.maybeSeries, series => ({
      name: series.name,
      maybeSequence: Option.some(series.sequence),
    })),
  ),
  maybeCoverUrl: Option.some(coverUrlOf(title)),
  maybeRuntimeMs: Option.some(Milliseconds.make(title.minutes * minuteMs)),
})

const originTypeOf = (kind: DemoKind): string => {
  if (kind === 'Free') {
    return 'AudibleComplimentaryOriginal'
  } else if (kind === 'AudiblePlusLoan') {
    return 'AudibleChannels'
  } else {
    return 'Purchase'
  }
}

/**
 * One made-up title as Audible's library answer lists it, the shape
 * `fetch_library.py` writes and the importer reads, with no cover, so the
 * importer never reaches for one.
 */
const rawItemOf = (
  title: DemoTitle,
  index: number,
): Readonly<Record<string, unknown>> => ({
  asin: title.asin,
  title: title.name,
  authors: [{ name: title.author }],
  narrators: [{ name: title.narrator }],
  series: Array.fromOption(
    Option.map(title.maybeSeries, series => ({
      title: series.name,
      sequence: series.sequence,
    })),
  ),
  publisher_name: 'Made-Up Press',
  release_date: '2021-05-04',
  runtime_length_min: title.minutes,
  purchase_date: purchasedAtOf(index),
  library_status: { date_added: purchasedAtOf(index), is_preordered: false },
  language: 'english',
  content_type: title.kind === 'Podcast' ? 'Podcast' : 'Product',
  content_delivery_type:
    title.kind === 'Podcast' ? 'PodcastParent' : 'SinglePartBook',
  status: 'Active',
  origin_type: originTypeOf(title.kind),
  is_ayce: title.kind === 'AudiblePlusLoan',
  is_adult_product: title.kind === 'Explicit',
})

const detailsOf = (title: DemoTitle): TitleDetails => {
  const runtimeMs = title.minutes * minuteMs
  const chapterMs = Math.floor(runtimeMs / Math.max(1, title.chapters.length))
  return {
    asin: Asin.make(title.asin),
    chapters: Array.map(title.chapters, (name, index) => ({
      name,
      startMs: Milliseconds.make(index * chapterMs),
      endMs: Milliseconds.make((index + 1) * chapterMs),
    })),
    maybeRuntimeMs: Option.some(Milliseconds.make(runtimeMs)),
    maybePosition: Option.none(),
    source: { asin: title.asin, isMadeUp: true },
  }
}

const demoTitleOf = (asin: string): Option.Option<DemoTitle> =>
  Array.findFirst(demoTitles, title => title.asin === asin)

const demoStepDelay = Duration.millis(300)

const refusedCode = 'books-demo-refused'

const expiredCode = 'books-demo-expired'

const expiredCredentials = 'demo-expired-credentials'

const demoError = (
  kind: BridgeErrorKind,
  maybeCode: Option.Option<string> = Option.none(),
): AudibleBridgeError => new AudibleBridgeError({ kind, maybeCode })

const finishedDemoSignIn = (
  address: string,
): Effect.Effect<Redacted.Redacted<string>, AudibleBridgeError> => {
  if (!String.includes('openid.oa2.authorization_code=')(address)) {
    return Effect.fail(demoError('AddressMismatch'))
  } else if (String.includes(refusedCode)(address)) {
    return Effect.fail(demoError('AmazonRefused', Option.some('InvalidValue')))
  } else if (String.includes(expiredCode)(address)) {
    return Effect.succeed(Redacted.make(expiredCredentials))
  } else {
    return Effect.succeed(Redacted.make('demo-credentials'))
  }
}

/**
 * A helper with made-up answers, for the demo and screenshots: any
 * address with a sign-in code connects, the library is eleven titles by
 * people who do not exist, a podcast and an Audible Plus loan among them,
 * and each title's chapters take a moment to read. A code that starts
 * `books-demo-refused` is one Amazon refuses, and one that starts
 * `books-demo-expired` saves a login Audible no longer accepts, so the
 * screens for both can be seen. It never reaches Amazon.
 */
export const demoBridge = Layer.succeed(AudibleBridge, {
  start: locale =>
    Effect.succeed({
      loginUrl: demoLandingPath,
      codeVerifier: Redacted.make('demo-verifier'),
      serial: Redacted.make('DEMO'),
      locale,
    }),
  finish: ({ redirectUrl }) => finishedDemoSignIn(Redacted.value(redirectUrl)),
  library: credentials =>
    Redacted.value(credentials) === expiredCredentials
      ? Effect.fail(demoError('LoginExpired'))
      : Effect.succeed({
          titles: Array.map(demoTitles, listedOf),
          items: Array.map(demoTitles, rawItemOf),
        }),
  details: (_credentials, asins) =>
    Stream.mapEffect(Stream.fromIterable(asins), asin =>
      Effect.as(Effect.sleep(demoStepDelay), {
        asin,
        maybeDetails: Option.map(demoTitleOf(asin), detailsOf),
      }),
    ),
})

/**
 * The demo's importer: the vendored Scribe importer, on the throwaway dev
 * app only, keeping its journals in a temporary folder. For any other app
 * it is the unwired importer, which refuses to write, so the demo can
 * never touch production.
 *
 * @example
 * ```typescript
 * demoLibraryImport({ appId, adminToken })
 * ```
 */
export const demoLibraryImport = (
  config: Readonly<{ appId: string; adminToken: string }>,
): Layer.Layer<LibraryImport> =>
  config.appId.startsWith(devAppPrefix) && config.adminToken !== ''
    ? scribeLibraryImport({
        appId: config.appId,
        adminToken: config.adminToken,
        journalDirectory: join(tmpdir(), 'books-audible-demo'),
      })
    : unwiredLibraryImport

const landingPage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Books demo sign-in</title>
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#111827}main{box-sizing:border-box;max-width:560px;margin:0 auto;padding:48px 24px}h1{font-size:22px}p{color:#4b5563;line-height:1.5}code{background:#f3f4f6;padding:2px 6px;border-radius:4px}</style>
</head><body><main>
<h1>Looking for something?</h1>
<p>This is the Books demo's stand-in for the page Amazon shows after you sign in. On Amazon it looks broken too.</p>
<p>Copy this page's address from the address bar, starting with <code>http</code>, and paste it into Books.</p>
</main></body></html>`

const pathAndQueryOf = (url: string): URL => new URL(url, 'http://localhost')

/**
 * The demo's stand-in for the page Amazon lands on after a sign-in, at
 * `/__books/audible-demo/landing`: its address carries a made-up sign-in
 * code, the way Amazon's does, so a person can copy it and paste it into
 * Books. Only for the demo.
 *
 * @example
 * ```typescript
 * plugins: [hostedIdentity({ publicRoutes }), audibleDemoLanding(), audibleImportEndpoint({ bridge: demoBridge, vault: memoryVault, libraryImport: demoLibraryImport({ appId, adminToken }) })]
 * ```
 */
export const audibleDemoLanding = (): Plugin => {
  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void => {
    const url = pathAndQueryOf(request.url ?? '')
    if (url.pathname !== demoLandingPath) {
      next()
    } else if (url.searchParams.has('openid.oa2.authorization_code')) {
      response.statusCode = 200
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.setHeader('cache-control', 'no-store')
      response.end(landingPage)
    } else {
      response.statusCode = 302
      response.setHeader(
        'location',
        `${demoLandingPath}?openid.mode=id_res&openid.oa2.authorization_code=books-demo-${randomUUID()}`,
      )
      response.end()
    }
  }
  return {
    name: 'books-audible-demo-landing',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
