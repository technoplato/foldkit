import { Option } from 'effect'
import { Navigation, Processor, type Session } from 'foldkit'

import { navigation } from './navigation.js'
import { CountersProgram } from './program.js'

// COMPANIONS

const packageOf = (folder: string): string =>
  `${CountersProgram.id}-${folder}-example`

const commandOf = (folder: string, script = 'start'): string =>
  `pnpm --filter ${packageOf(folder)} ${script}`

const pageAt = (origin: string): string =>
  `${origin}${Option.getOrElse(Navigation.defaultUri(navigation), () => '/')}`

/**
 * Every app that shows the Multiple Counters, and how to start it from the
 * repository root. Package names come from the Program's id and web
 * addresses from its root route. The Session page lists them, copyable.
 *
 * @example
 * ```typescript
 * companions[2] // { host: CLI, command: 'pnpm --filter multiple-counters-cli-example start' }
 * ```
 */
export const companions: ReadonlyArray<Session.Companion> = [
  {
    host: Processor.Host.React(),
    command: commandOf('react'),
    url: pageAt('http://127.0.0.1:5217'),
  },
  {
    host: Processor.Host.Svelte(),
    command: commandOf('svelte'),
    url: pageAt('http://localhost:5219'),
  },
  { host: Processor.Host.Cli(), command: commandOf('cli') },
  { host: Processor.Host.Tui(), command: commandOf('cli', 'tui') },
  { host: Processor.Host.OpenTui(), command: commandOf('opentui') },
]
