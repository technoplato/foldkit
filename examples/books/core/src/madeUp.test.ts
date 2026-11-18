import { Layer, Stream } from 'effect'
import { Interaction, Processor } from 'foldkit'
import { SystemAppearance } from 'foldkit/theme'
import { describe, expect, it } from 'vitest'

import { startMadeUpBooks } from './madeUp.js'
import { bindBooks } from './synced.js'

const settleMs = 3_000

const waitUntil = async (isSo: () => boolean): Promise<void> => {
  const deadline = Date.now() + settleMs
  while (!isSo() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

describe('the made-up library on a host', () => {
  it("takes the host's own services beside the made-up ones, such as its report of the system's appearance", async () => {
    const handle = await startMadeUpBooks({
      host: Processor.Host.ExpoIos(),
      resources: Layer.succeed(SystemAppearance, {
        modes: Stream.make('Dark'),
        contrasts: Stream.make('More'),
      }),
    })
    const bound = bindBooks(handle)
    await Interaction.whenSettled(bound, settleMs)
    const appearanceNow = () => {
      const model = handle.readModel()
      return model._tag === 'Ready' ? model.appearance : undefined
    }
    await waitUntil(() => appearanceNow()?.systemMode === 'Dark')
    expect(appearanceNow()?.systemMode).toBe('Dark')
    expect(appearanceNow()?.systemContrast).toBe('More')
    await handle.stop()
  })

  it('still starts with no services of the host', async () => {
    const handle = await startMadeUpBooks({ host: Processor.Host.Cli() })
    const bound = bindBooks(handle)
    await Interaction.whenSettled(bound, settleMs)
    const model = handle.readModel()
    expect(model._tag).toBe('Ready')
    expect(model._tag === 'Ready' ? model.appearance.systemMode : '').toBe(
      'Light',
    )
    await handle.stop()
  })
})
