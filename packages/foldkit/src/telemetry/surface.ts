/**
 * Every telemetry session declares its surface: the kind of place a
 * person meets the Program, such as a terminal TUI or a React page. The
 * surface comes from the Host the Program's handle was started on, never
 * from a string a caller types, so `Processor.Host.Tui()` is always
 * `terminal-tui` and two hosts can never spell one surface two ways.
 *
 * Every telemetry line carries its surface, and its file is named for its
 * session's, so `grep '"surface":"terminal-tui"'` finds every line from
 * the TUI and `books-terminal-tui.ndjson` holds an in-process TUI's
 * session. A client on another Host keeps its surface too: a `books tui`
 * view's keys, which the CLI daemon answers, are lines of the daemon's
 * session in `books-terminal-cli.ndjson` that say `terminal-tui`, because
 * the daemon sends them on behalf of a `Processor.Host.Tui()` client.
 */
import { Match as M, Option, Schema as S } from 'effect'

import { type Host, hostOfFrom, print } from '../processor/host.js'

/**
 * The surfaces a telemetry session can declare, one for each Host. They
 * are written as they appear in a file name and a line, lowercase, so the
 * file for Books on the TUI is `books-terminal-tui.ndjson`.
 */
export const TelemetrySurface = S.Literals([
  'terminal-cli',
  'terminal-tui',
  'terminal-opentui',
  'headless',
  'web-foldkit',
  'web-react',
  'web-svelte',
  'mobile-ios',
  'mobile-android',
])

/** The surface a telemetry session declares. */
export type TelemetrySurface = typeof TelemetrySurface.Type

/**
 * A special job a process does on its surface, beside the surface itself:
 * `daemon` for the long-lived CLI Processor that one-shot `counter` and
 * `books` commands talk to. Add a role here when a process has a job of
 * its own, so every log spells it the same way.
 */
export const TelemetryRole = S.Literals(['daemon'])

/** A special job a process does on its surface. */
export type TelemetryRole = typeof TelemetryRole.Type

/**
 * The surface a Host is. The match is exhaustive, so a new Host does not
 * compile until it names its surface.
 *
 * @example
 * ```typescript
 * surfaceOf(Processor.Host.Tui()) // 'terminal-tui'
 * surfaceOf(Processor.Host.React()) // 'web-react'
 * surfaceOf(Processor.Host.ExpoIos()) // 'mobile-ios'
 * ```
 */
export const surfaceOf = (host: Host): TelemetrySurface =>
  M.value(host).pipe(
    M.withReturnType<TelemetrySurface>(),
    M.tagsExhaustive({
      Cli: () => 'terminal-cli',
      Tui: () => 'terminal-tui',
      OpenTui: () => 'terminal-opentui',
      Headless: () => 'headless',
      Foldkit: () => 'web-foldkit',
      React: () => 'web-react',
      Svelte: () => 'web-svelte',
      ExpoIos: () => 'mobile-ios',
      ExpoAndroid: () => 'mobile-android',
    }),
  )

/**
 * The surface of a Host as telemetry wrote it before surfaces existed,
 * when a session named its Host the way a Processor's `from` does, or None
 * for a word no Host prints.
 *
 * @example
 * ```typescript
 * surfaceOfHostName('react') // Some('web-react')
 * surfaceOfHostName('expo-ios') // Some('mobile-ios')
 * surfaceOfHostName('desktop') // None
 * ```
 */
export const surfaceOfHostName = (
  hostName: string,
): Option.Option<TelemetrySurface> =>
  Option.map(
    Option.filter(hostOfFrom(hostName), host => print(host) === hostName),
    surfaceOf,
  )
