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
 */
export type HostId =
  | 'opentui'
  | 'react'
  | 'react-screen'
  | 'svelte'
  | 'expo'
  | 'foldkit'
  | 'tui'
  | 'tui-screen'
  | 'cli'
  | 'cli-screen'

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
