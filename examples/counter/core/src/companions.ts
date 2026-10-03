import { Option } from 'effect'
import { Processor, type Session } from 'foldkit'

import { maybeCounterUri } from './navigation.js'
import { CounterProgram } from './program.js'

// COMPANIONS

const packageOf = (folder: string): string =>
  `${CounterProgram.id}-${folder}-example`

const commandOf = (folder: string, script = 'start'): string =>
  `pnpm --filter ${packageOf(folder)} ${script}`

const pageAt = (origin: string): string =>
  `${origin}${Option.getOrElse(maybeCounterUri, () => '/')}`

/**
 * Every app that joins the Counter's session, and how to start it from the
 * repository root. Package names come from the Program's id and web
 * addresses from its root route, so renaming either renames these. The
 * Session page lists them for every painter, copyable.
 *
 * @example
 * ```typescript
 * companions[0] // { host: React, command: 'pnpm --filter counter-react-example start', url: 'http://127.0.0.1:5216/counter' }
 * ```
 */
export const companions: ReadonlyArray<Session.Companion> = [
  {
    host: Processor.Host.React(),
    command: commandOf('react'),
    url: pageAt('http://127.0.0.1:5216'),
  },
  {
    host: Processor.Host.Svelte(),
    command: commandOf('svelte'),
    url: pageAt('http://localhost:5218'),
  },
  {
    host: Processor.Host.Foldkit(),
    command: commandOf('foldkit'),
    url: pageAt('http://localhost:5215'),
  },
  { host: Processor.Host.Tui(), command: commandOf('tui') },
  { host: Processor.Host.OpenTui(), command: commandOf('opentui') },
  { host: Processor.Host.Cli(), command: commandOf('cli') },
  { host: Processor.Host.ExpoIos(), command: commandOf('expo', 'ios') },
  { host: Processor.Host.ExpoAndroid(), command: commandOf('expo', 'android') },
]
