import {
  type ClientId,
  type ScreenMode,
  captureSlugForClient,
  captureSlugForScreenMode,
} from 'client-matrix-core-example'
import { Match as M } from 'effect'

/** Returns the concrete host carrier for one portable Multiple Counters URI. */
export const carrierForClient = (
  clientId: ClientId,
  portableUri: string,
): string =>
  M.value(clientId).pipe(
    M.withReturnType<string>(),
    M.when(
      'ReactWeb',
      () => `https://countersdemo.knophy.com${portableUri}?presenter=a`,
    ),
    M.when('FoldkitView', () => `https://foldkitdemo.knophy.com${portableUri}`),
    M.when('ExpoWeb', () => `https://expodemo.knophy.com${portableUri}`),
    M.when(
      'EffectTerminal',
      () =>
        `pnpm --filter counters-terminal-example terminal -- '${portableUri}'`,
    ),
    M.when(
      'OpenTui',
      () => `pnpm --filter counters-opentui-example dev -- '${portableUri}'`,
    ),
    M.when(
      'RawCli',
      () =>
        `pnpm --filter counters-cli-example counters show --uri '${portableUri}'`,
    ),
    M.when('ExpoIos', () => `foldkit://showcase${portableUri}`),
    M.when('ExpoAndroid', () => `foldkit://showcase${portableUri}`),
    M.exhaustive,
  )

/** Returns the checked-in capture path for one matrix cell. */
export const capturePath = (mode: ScreenMode, clientId: ClientId): string =>
  `/captures/${captureSlugForScreenMode(mode)}/${captureSlugForClient(clientId)}.webp`
