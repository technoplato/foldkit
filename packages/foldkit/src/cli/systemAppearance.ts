import { type Duration, Effect, Layer, Stream } from 'effect'
import { execFile } from 'node:child_process'

import { SystemAppearance } from '../theme/appearance.js'
import { type Contrast } from '../theme/theme.js'

// CONTRAST

/**
 * The contrast a Mac asks for, from what `defaults` says of its Increase
 * Contrast setting: `1` when it is on. A Mac that never had it on has no
 * value there, and that is the usual contrast too.
 *
 * @example
 * ```typescript
 * contrastOfMacSetting('1\n') // 'More'
 * contrastOfMacSetting('') // 'Standard'
 * ```
 */
export const contrastOfMacSetting = (said: string): Contrast =>
  said.trim() === '1' ? 'More' : 'Standard'

/**
 * Reads the contrast this machine asks for: a Mac's Increase Contrast
 * setting, and the usual contrast on any other system or when the
 * setting cannot be read. It never fails.
 */
export const readSystemContrast: Effect.Effect<Contrast> =
  process.platform === 'darwin'
    ? Effect.callback<Contrast>(resume => {
        execFile(
          'defaults',
          ['read', 'com.apple.universalaccess', 'increaseContrast'],
          { timeout: 2_000 },
          (error, stdout) => {
            resume(
              Effect.succeed(
                error === null ? contrastOfMacSetting(stdout) : 'Standard',
              ),
            )
          },
        )
      })
    : Effect.succeed('Standard')

/**
 * The contrasts a host reports from a setting it can only read: what it
 * read first, then each change, read again every so often. Nothing is
 * reported while it reads the same.
 *
 * @example
 * ```typescript
 * contrastsRead(readSystemContrast, '1 minute')
 * ```
 */
export const contrastsRead = (
  read: Effect.Effect<Contrast>,
  every: Duration.Input,
): Stream.Stream<Contrast> =>
  Stream.changes(Stream.mapEffect(Stream.tick(every), () => read))

/** How often a terminal host reads the system's contrast again. */
const systemContrastReadEvery: Duration.Input = '1 minute'

/**
 * What a terminal host reports of the system's appearance: the contrast
 * it asks for, read from the system now and again each minute. A
 * terminal's ground is never the system's mode, so the mode stays the
 * one a host that knows none reports. `read` replaces the reading, for a
 * made-up system.
 *
 * @example
 * ```typescript
 * Runtime.startHandle({ program, sync, resources: terminalSystemAppearance() })
 * ```
 */
export const terminalSystemAppearance = (
  read: Effect.Effect<Contrast> = readSystemContrast,
): Layer.Layer<never> =>
  Layer.succeed(SystemAppearance, {
    modes: Stream.make('Light'),
    contrasts: contrastsRead(read, systemContrastReadEvery),
  })
