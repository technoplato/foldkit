import { Layer, Option, Stream } from 'effect'
import { Interaction, Processor, Runtime } from 'foldkit'
import { SystemAppearance } from 'foldkit/theme'
import { describe, expect, it } from 'vitest'

import { madeUpSessionLog, startMadeUpBooks } from './madeUp.js'
import { BooksProgram } from './program.js'
import { longSampleChapters } from './sample.js'
import { bindBooks, whenShelfOpened } from './synced.js'

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
    const title = 'the-lantern-keeper'
    const addressOn = (bound: typeof onPhone): string =>
      Option.match(bound.navigation(), {
        onNone: () => '',
        onSome: plan => plan.uri,
      })
    const modeOn = (bound: typeof onPhone): string => {
      const model = bound.readModel()
      return model._tag === 'Ready' ? model.session.mode : model._tag
    }

    // NOTE: A Program is settled before its shelf has opened, and a title
    // that is not on the shelf yet cannot be opened. Once the shelf is
    // in, a press straight after mirroring is taken at once, with no
    // press repeated until it is.
    await whenShelfOpened(terminal, settleMs)
    await whenShelfOpened(phone, settleMs)
    expect(onTerminal.press('MirrorNavigation')).toBe(true)
    expect(onTerminal.press(`Open:${title}`)).toBe(true)
    await waitUntil(() => addressOn(onPhone) === `/books/${title}`)

    expect(modeOn(onPhone)).toBe('Mirror')
    expect(addressOn(onPhone)).toBe(`/books/${title}`)
    await phone.stop()
    await terminal.stop()
  })

  it('says when its shelf has opened, at once when it already has, and gives up after the time it is given', async () => {
    const handle = await startMadeUpBooks({ host: Processor.Host.Cli() })
    const bound = bindBooks(handle)
    await Interaction.whenSettled(bound, settleMs)
    await whenShelfOpened(handle, settleMs)
    const model = handle.readModel()
    expect(model._tag === 'Ready' ? model.library._tag : model._tag).toBe(
      'ShelfReady',
    )
    expect(bound.press('Open:the-lantern-keeper')).toBe(true)
    const startedAtMs = Date.now()
    await whenShelfOpened(handle, settleMs)
    expect(Date.now() - startedAtMs).toBeLessThan(50)
    await handle.stop()
  })

  it('keeps the session every device shares under a name of its own, never a person’s library', () => {
    expect(madeUpSessionLog).not.toBe(BooksProgram.id)
    expect(madeUpSessionLog).toContain('made-up')
  })

  it('can open a shelf as long as a long-time listener’s: 65 titles, one of them about 16 hours in 134 chapters', async () => {
    const handle = await startMadeUpBooks({
      host: Processor.Host.Cli(),
      shelf: 'Long',
    })
    const bound = bindBooks(handle)
    await Interaction.whenSettled(bound, settleMs)
    const titlesNow = () => {
      const model = handle.readModel()
      return model._tag === 'Ready' && model.library._tag === 'ShelfReady'
        ? model.library.shelf.titles
        : []
    }
    await waitUntil(() => titlesNow().length > 0)
    const titles = titlesNow()
    const hourMs = 3_600_000

    expect(titles).toHaveLength(65)
    expect(new Set(titles.map(title => title.slug)).size).toBe(65)
    expect(Math.max(...titles.map(title => title.durationMs))).toBeGreaterThan(
      15 * hourMs,
    )
    expect(Object.values(longSampleChapters).map(c => c.length)).toContain(134)
    await handle.stop()
  })
})
