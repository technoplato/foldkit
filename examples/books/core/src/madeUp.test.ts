import { Layer, Option, Stream } from 'effect'
import { Interaction, Processor, Runtime } from 'foldkit'
import { SystemAppearance } from 'foldkit/theme'
import { describe, expect, it } from 'vitest'

import { madeUpSessionLog, startMadeUpBooks } from './madeUp.js'
import { BooksProgram } from './program.js'
import { sampleTitles } from './sample.js'
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

  it('is one session on every device that shares an engine: while the session mirrors, a title opened in the terminal opens on the phone', async () => {
    const store = Runtime.makeMemoryStore()
    const phone = await startMadeUpBooks({
      host: Processor.Host.ExpoIos(),
      sync: Runtime.Memory({ processor: 'phone', store }),
    })
    const terminal = await startMadeUpBooks({
      host: Processor.Host.Cli(),
      sync: Runtime.Memory({ processor: 'terminal', store }),
    })
    const onPhone = bindBooks(phone)
    const onTerminal = bindBooks(terminal)
    await Interaction.whenSettled(onPhone, settleMs)
    await Interaction.whenSettled(onTerminal, settleMs)
    const title = sampleTitles[0].slug
    const addressOn = (bound: typeof onPhone): string =>
      Option.match(bound.navigation(), {
        onNone: () => '',
        onSome: plan => plan.uri,
      })
    const modeOn = (bound: typeof onPhone): string => {
      const model = bound.readModel()
      return model._tag === 'Ready' ? model.session.mode : model._tag
    }

    onTerminal.press('MirrorNavigation')
    await waitUntil(() => modeOn(onPhone) === 'Mirror')
    await waitUntil(() => onTerminal.press(`Open:${title}`))
    await waitUntil(() => addressOn(onPhone) === `/books/${title}`)

    expect(modeOn(onPhone)).toBe('Mirror')
    expect(addressOn(onPhone)).toBe(`/books/${title}`)
    await phone.stop()
    await terminal.stop()
  })

  it('keeps the session every device shares under a name of its own, never a person’s library', () => {
    expect(madeUpSessionLog).not.toBe(BooksProgram.id)
    expect(madeUpSessionLog).toContain('made-up')
  })
})
