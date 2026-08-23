import { Schema as S } from 'effect'

/** Live Puzzle page. The page is the source, not GitHub. */
export const puzzleLiveUrl = 'https://puzzle.knophy.com'

/** Live Replicate host. Same origin as Puzzle (127.0.0.1:5209). */
export const replicateLiveUrl = 'https://replicate.knophy.com'

/** Live Operator host. Same origin as Puzzle (127.0.0.1:5209). */
export const grokLiveUrl = 'https://grok.knophy.com'

/** The three public Puzzle hosts. No GitHub blob chrome. */
export const LiveHostUrls = S.Struct({
  puzzle: S.Literal(puzzleLiveUrl),
  replicate: S.Literal(replicateLiveUrl),
  grok: S.Literal(grokLiveUrl),
})
/** The three public Puzzle hosts. No GitHub blob chrome. */
export type LiveHostUrls = typeof LiveHostUrls.Type

/** Canonical live hosts. Painters look this up. They do not invent URLs. */
export const liveHosts: LiveHostUrls = LiveHostUrls.make({
  puzzle: puzzleLiveUrl,
  replicate: replicateLiveUrl,
  grok: grokLiveUrl,
})

/** Public source URL. Always the live Puzzle page, never GitHub. */
export const puzzleSourceUrl = (): typeof puzzleLiveUrl => puzzleLiveUrl

/** Title, sentence, live source, and the three public hosts. */
export const HostSurface = S.Struct({
  title: S.String,
  description: S.String,
  sourceUrl: S.Literal(puzzleLiveUrl),
  live: LiveHostUrls,
})
/** Title, sentence, live source, and the three public hosts. */
export type HostSurface = typeof HostSurface.Type

/**
 * Host id a window uses to look up Program-owned chrome.
 * Windows look up. They do not invent title, description, or URLs.
 */
export const HostId = S.Literals([
  'opentui',
  'react',
  'react-screen',
  'svelte',
  'expo',
  'foldkit',
  'tui',
  'tui-screen',
  'cli',
  'cli-screen',
  'headless',
])
/** Host id a window uses to look up Program-owned chrome. */
export type HostId = typeof HostId.Type

const renderedBy = (host: string): string =>
  `all business logic and sync logic are written in Foldkit; consumed and rendered by ${host}.`

/** Builds Program-owned chrome. Source is always the live Puzzle page. */
export const hostSurface = (title: string, description: string): HostSurface =>
  HostSurface.make({
    title,
    description,
    sourceUrl: puzzleLiveUrl,
    live: liveHosts,
  })

/**
 * Program-owned host chrome. Every painter looks up by host id.
 * Window chrome must not invent these strings.
 */
export const hostSurfaces: Readonly<Record<HostId, HostSurface>> = {
  opentui: hostSurface('Foldkit - OpenTUI Puzzle', renderedBy('OpenTUI')),
  react: hostSurface('Foldkit - React Puzzle', renderedBy('React')),
  'react-screen': hostSurface(
    'Foldkit - React screen Puzzle',
    renderedBy('React'),
  ),
  svelte: hostSurface('Foldkit - Svelte Puzzle', renderedBy('Svelte')),
  expo: hostSurface('Foldkit - Expo Puzzle', renderedBy('Expo')),
  foldkit: hostSurface('Foldkit - Foldkit Puzzle', renderedBy('Foldkit')),
  tui: hostSurface('Foldkit - TUI Puzzle', renderedBy('TUI')),
  'tui-screen': hostSurface('Foldkit - TUI screen Puzzle', renderedBy('TUI')),
  cli: hostSurface('Foldkit - CLI Puzzle', renderedBy('CLI')),
  'cli-screen': hostSurface('Foldkit - CLI screen Puzzle', renderedBy('CLI')),
  headless: hostSurface('Foldkit - Headless Puzzle', renderedBy('Headless')),
}

/** Looks up Program-owned chrome for one host id. */
export const surfaceFor = (id: HostId): HostSurface => hostSurfaces[id]

/** OpenTUI host chrome. */
export const openTuiSurface = surfaceFor('opentui')

/** Bespoke React host chrome. */
export const reactBespokeSurface = surfaceFor('react')

/** React screen-window chrome. */
export const reactScreenSurface = surfaceFor('react-screen')

/** Svelte host chrome. */
export const svelteSurface = surfaceFor('svelte')

/** Expo host chrome. */
export const expoSurface = surfaceFor('expo')

/** Foldkit HTML host chrome. */
export const foldkitSurface = surfaceFor('foldkit')

/** Bespoke TUI host chrome. */
export const tuiBespokeSurface = surfaceFor('tui')

/** TUI screen-window chrome. */
export const tuiScreenSurface = surfaceFor('tui-screen')

/** Classic CLI `show` host chrome. */
export const cliShowSurface = surfaceFor('cli')

/** CLI screen-window chrome. */
export const cliScreenSurface = surfaceFor('cli-screen')

/** Headless printer chrome. */
export const headlessSurface = surfaceFor('headless')

/** Stacks title and sentence. Live hosts live on the Program screen tree. */
export const formatHostChrome = (surface: HostSurface): string =>
  [surface.title, surface.description].join('\n')

/** Stacks the three live hosts for the Foldkit page and tests. */
export const formatLiveHosts = (surface: HostSurface): string =>
  [surface.live.puzzle, surface.live.replicate, surface.live.grok].join('\n')
