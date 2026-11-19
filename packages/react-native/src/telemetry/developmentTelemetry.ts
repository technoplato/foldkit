import { Option } from 'effect'
import { Telemetry } from 'foldkit'

import { watchHostErrors } from './hostErrors.js'

// DEVELOPMENT TELEMETRY

/** What every telemetry line a phone writes to its console starts with. */
export const telemetryLineMark = 'foldkit-telemetry '

/**
 * One telemetry line as a phone's console carries it, marked so the trace
 * can be picked out from everything else the console says.
 *
 * @example
 * ```typescript
 * telemetryLineOf('{"_tag":"Transition", …}') // 'foldkit-telemetry {"_tag":"Transition", …}'
 * ```
 */
export const telemetryLineOf = (line: string): string =>
  `${telemetryLineMark}${line}`

/**
 * How a phone attaches telemetry: the app's name, as every Client of it
 * gives, and, for a test, whether this is a development build and where
 * the lines go.
 */
export type DevelopmentTelemetryOptions = Readonly<{
  app: string
  isDevelopment?: boolean
  write?: (line: string) => void
}>

// NOTE: Fast Refresh runs this module again in the same JavaScript
// runtime, so whether the watch is on is kept on the runtime, not here.
const hostWatchKey = Symbol.for('foldkit.reactNative.hostErrorWatch')

const isDevelopmentBuild = (): boolean =>
  Reflect.get(globalThis, '__DEV__') === true

const writeToConsole = (line: string): void => {
  // NOTE: A development build's console is read on the machine that
  // serves it, in Metro's log and the device's console. It is the one
  // place a phone can put a trace with no file and no page of its own.
  console.log(line)
}

/**
 * Attaches the core's telemetry to a Program running on a phone, in a
 * development build: the Program's transitions with where each came from,
 * its Command spans, its Subscriptions, and the paints the app reports,
 * each written to the console as one marked NDJSON line, the same lines
 * the web and the terminal keep. It also writes a line for any JavaScript
 * failure that reaches the platform uncaught, so what stopped the app is
 * on record before the platform takes it down. A build that is not for development
 * records nothing and gets None.
 *
 * @example
 * ```typescript
 * const telemetry = attachDevelopmentTelemetry(handle, { app: 'books' })
 * ```
 */
export const attachDevelopmentTelemetry = <
  Model,
  Message extends Readonly<{ _tag: string }>,
>(
  handle: Parameters<typeof Telemetry.attach<Model, Message>>[0],
  options: DevelopmentTelemetryOptions,
): Option.Option<Telemetry.TelemetryAttachment> => {
  const write = options.write ?? writeToConsole
  const isOn = options.isDevelopment ?? isDevelopmentBuild()
  if (isOn && Reflect.get(globalThis, hostWatchKey) !== true) {
    Reflect.set(globalThis, hostWatchKey, true)
    watchHostErrors({ write })
  }
  return isOn
    ? Option.some(
        Telemetry.attach(handle, {
          app: options.app,
          sink: Telemetry.lineSink(line => {
            write(telemetryLineOf(line))
          }),
        }),
      )
    : Option.none()
}
