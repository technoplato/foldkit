import { Option, Schema as S } from 'effect'
import { Processor } from 'foldkit'

/** GitHub owner for the exploring-view-agnosticism fork. */
export const githubOwner = 'technoplato'

/** GitHub repository name for this fork. */
export const githubRepo = 'foldkit'

/** Branch that hosts these Counter files. */
export const githubBranch = 'ml/exploring-view-agnosticism'

/** Builds a blob URL for one host file on Michael's GitHub. */
export const counterSourceUrl = (hostFile: string): string =>
  `https://github.com/${githubOwner}/${githubRepo}/blob/${githubBranch}/${hostFile}`

/** Title, sentence, and source URL painted on one host surface. */
export type HostSurface = Readonly<{
  title: string
  description: string
  sourceUrl: string
}>

/**
 * Host id a window uses to look up Program-owned chrome.
 * Windows look up. They do not invent title or description.
 *
 * `show --surface svelte` starts a Svelte Processor. `react-screen`
 * is the React screen window (`?window=screen`), not a second Host.
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
])
/** Host id a window uses to look up Program-owned chrome. */
export type HostId = typeof HostId.Type

/**
 * Tweet write-once painters. L10 live-pokes each one.
 * TUI is the Instant peer. The others are `show --surface`.
 */
export const tweetPainterIds: ReadonlyArray<HostId> = [
  'foldkit',
  'svelte',
  'react',
  'react-screen',
  'expo',
  'cli',
  'tui',
  'opentui',
]

/** Surfaces Dave sends as `show --surface`. TUI is the Instant peer. */
export const tweetShowPainterIds: ReadonlyArray<HostId> = [
  'foldkit',
  'svelte',
  'react',
  'react-screen',
  'expo',
  'cli',
  'opentui',
]

const renderedBy = (host: string): string =>
  `all business logic and sync logic are written in Foldkit; consumed and rendered by ${host}.`

/** Builds Program-owned chrome for one host file on this branch. */
export const hostSurface = (
  title: string,
  hostFile: string,
  description: string,
): HostSurface => ({
  title,
  description,
  sourceUrl: counterSourceUrl(hostFile),
})

/**
 * Program-owned host chrome. Every painter looks up by host id.
 * Window chrome must not invent these strings.
 */
export const hostSurfaces: Readonly<Record<HostId, HostSurface>> = {
  opentui: hostSurface(
    'Foldkit - OpenTUI Counter',
    'examples/counter/opentui/src/entry.ts',
    renderedBy('OpenTUI'),
  ),
  react: hostSurface(
    'Foldkit - React Counter',
    'examples/counter/react/src/App.tsx',
    renderedBy('React'),
  ),
  'react-screen': hostSurface(
    'Foldkit - React screen Counter',
    'examples/counter/react/src/ScreenApp.tsx',
    renderedBy('React'),
  ),
  svelte: hostSurface(
    'Foldkit - Svelte Counter',
    'examples/counter/svelte/src/App.svelte',
    renderedBy('Svelte'),
  ),
  expo: hostSurface(
    'Foldkit - Expo Counter',
    'examples/counter/expo/src/App.tsx',
    renderedBy('Expo'),
  ),
  foldkit: hostSurface(
    'Foldkit - Foldkit Counter',
    'examples/counter/foldkit/src/view.ts',
    renderedBy('Foldkit'),
  ),
  tui: hostSurface(
    'Foldkit - TUI Counter',
    'examples/counter/tui/src/client.ts',
    renderedBy('TUI'),
  ),
  'tui-screen': hostSurface(
    'Foldkit - TUI screen Counter',
    'examples/counter/tui/src/client.ts',
    renderedBy('TUI'),
  ),
  cli: hostSurface(
    'Foldkit - CLI Counter',
    'examples/counter/cli/src/host.ts',
    renderedBy('CLI'),
  ),
  'cli-screen': hostSurface(
    'Foldkit - CLI screen Counter',
    'examples/counter/cli/src/screenHost.ts',
    renderedBy('CLI'),
  ),
}

/** Looks up Program-owned chrome for one host id. */
export const surfaceFor = (id: HostId): HostSurface => hostSurfaces[id]

/** Decodes a `show --surface` token. */
export const parseHostId = (raw: string): Option.Option<HostId> =>
  S.decodeUnknownOption(HostId)(raw)

/**
 * Processor Host for one surface. `react-screen` is Host.React().
 * `expo` is Host.ExpoIos() on Node. Windows do not invent a Host.
 *
 * @example
 * ```typescript
 * startLiveCounter(processorHostFor('svelte'))
 * startLiveCounter(processorHostFor('react-screen'))
 * ```
 */
export const processorHostFor = (id: HostId): Processor.Host.Host => {
  if (id === 'foldkit') {
    return Processor.Host.Foldkit()
  }
  if (id === 'svelte') {
    return Processor.Host.Svelte()
  }
  if (id === 'react' || id === 'react-screen') {
    return Processor.Host.React()
  }
  if (id === 'expo') {
    return Processor.Host.ExpoIos()
  }
  if (id === 'opentui') {
    return Processor.Host.OpenTui()
  }
  if (id === 'tui' || id === 'tui-screen') {
    return Processor.Host.Tui()
  }
  return Processor.Host.Cli()
}

/**
 * True when `show --surface` starts that Host as a one-shot Processor.
 * Bare `show` stays on the CLI daemon. Explicit `--surface cli` starts
 * Host.Cli() so Dave does not depend on a leftover daemon binary.
 * `cli-screen` stays on the screen-window CLI view.
 */
export const usesOwnPainterProcessor = (id: HostId): boolean =>
  id !== 'cli-screen'

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

/** Stacks title, sentence, and source URL for terminal paint. */
export const formatHostChrome = (surface: HostSurface): string =>
  [surface.title, surface.description, surface.sourceUrl].join('\n')
