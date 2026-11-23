import {
  type ClientId,
  type ScreenMode,
  captureSlugForClient,
  captureSlugForScreenMode,
  countersCommandName,
} from 'client-matrix-core-example'
import { Match as M } from 'effect'

import openTuiDelete from './captures/open-tui/delete.txt?raw'
import openTuiDetail from './captures/open-tui/detail.txt?raw'
import openTuiList from './captures/open-tui/list.txt?raw'

/** Where the Multiple Counters web app is served. */
export const countersOrigin = 'https://counters.pisspoursoftware.xyz'

/**
 * The address ending that keeps a window's counters to itself, so a cell
 * always finds Counter 1 whatever the shared log holds today.
 */
export const windowOnlyQuery = '?engine=memory'

/**
 * Returns how one client is started at one Multiple Counters URI: an
 * address for the hosted React app, a command for the terminal. Svelte and
 * OpenTUI take no URI yet, so theirs is the command that starts them on
 * the list.
 *
 * @example
 * ```typescript
 * carrierForClient('ReactWeb', '/counters/1')
 * // 'https://counters.pisspoursoftware.xyz/counters/1?engine=memory'
 * carrierForClient('Cli', '/counters/1') // "counters open '/counters/1'"
 * ```
 */
export const carrierForClient = (
  clientId: ClientId,
  portableUri: string,
): string =>
  M.value(clientId).pipe(
    M.withReturnType<string>(),
    M.when(
      'ReactWeb',
      () => `${countersOrigin}${portableUri}${windowOnlyQuery}`,
    ),
    M.when(
      'SvelteWeb',
      () => 'pnpm --filter multiple-counters-svelte-example start',
    ),
    M.when(
      'OpenTui',
      () => 'pnpm --filter multiple-counters-opentui-example start',
    ),
    M.when(
      'TerminalUi',
      () =>
        `${countersCommandName} open '${portableUri}' && ${countersCommandName} tui`,
    ),
    M.when('Cli', () => `${countersCommandName} open '${portableUri}'`),
    M.exhaustive,
  )

/** Returns the checked-in screenshot path for one web cell. */
export const capturePath = (mode: ScreenMode, clientId: ClientId): string =>
  `/captures/${captureSlugForScreenMode(mode)}/${captureSlugForClient(clientId)}.webp`

/**
 * Returns the checked-in frame OpenTUI painted at one mode, 80 columns by
 * 24 rows. `examples/multiple-counters/opentui/scripts/capture.ts` writes
 * these files.
 */
export const openTuiCapture = (mode: ScreenMode): string =>
  M.value(mode).pipe(
    M.withReturnType<string>(),
    M.when('List', () => openTuiList),
    M.when('Detail', () => openTuiDetail),
    M.when('DeleteQuestion', () => openTuiDelete),
    M.exhaustive,
  )
