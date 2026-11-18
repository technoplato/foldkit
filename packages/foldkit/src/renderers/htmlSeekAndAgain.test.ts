import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { Seek, TextInput } from './elements.js'
import { paintHtml } from './html.js'
import {
  againEventName,
  seekFieldMount,
  showSeekLanding,
  textAgainMount,
} from './htmlEdge.js'

// Made-up landings: nothing here is from a real recording or book.
const landings = [
  { value: 0, text: '0:00 · The keeper climbed the stairs' },
  { value: 20_000, text: '0:20 · Far out a bell answered' },
  { value: 40_000, text: '0:40 · Then the fog came in' },
]

const seek = Seek({
  label: 'Place',
  action: 'SeekTo',
  value: 5_000,
  max: 60_000,
  step: 1_000,
  valueText: '0:05 of 1:00',
  landings,
})

type Vnode = Readonly<{
  sel?: string
  data?: Readonly<{
    class?: Readonly<Record<string, boolean>>
    on?: Readonly<Record<string, unknown>>
  }>
  children?: ReadonlyArray<Vnode | string>
}>

const treeOf = (node: Parameters<typeof paintHtml>[0]): Vnode =>
  // NOTE: the painter returns the library's own element tree, read here
  // as plain data.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  paintHtml(node, tag => tag) as unknown as Vnode

const until = async (isSo: () => boolean): Promise<void> => {
  const tries = Array.from({ length: 400 })
  for (const _ of tries) {
    if (isSo()) {
      return
    }
    await new Promise(resolve => {
      setTimeout(resolve, 5)
    })
  }
}

const field = () => {
  const wrap = document.createElement('span')
  wrap.className = 'fk-seek-field'
  wrap.setAttribute('data-landings', JSON.stringify(landings))
  const input = document.createElement('input')
  input.type = 'range'
  input.className = 'fk-seek'
  input.min = '0'
  input.max = '60000'
  input.setAttribute('aria-valuetext', '0:05 of 1:00')
  const output = document.createElement('output')
  output.className = 'fk-seek-landing'
  output.hidden = true
  wrap.append(input, output)
  document.body.append(wrap)
  return { wrap, input, output }
}

describe('where a seek drag lands, in the Foldkit HTML painter', () => {
  it('paints a bar with landings beside a place to name them, and a plain bar as before', () => {
    const html = JSON.stringify(paintHtml(seek, tag => tag))
    expect(html).toContain('fk-seek-field')
    expect(html).toContain('fk-seek-landing')
    expect(html).toContain('Far out a bell answered')
    const plain = JSON.stringify(
      paintHtml(
        Seek({
          label: 'Place',
          action: 'SeekTo',
          value: 5_000,
          max: 60_000,
          step: 1_000,
          valueText: '0:05 of 1:00',
        }),
        tag => tag,
      ),
    )
    expect(plain).not.toContain('fk-seek-field')
    expect(plain).toContain('"sel":"input"')
  })

  it('names the landing under a drag, and nothing before the first', () => {
    const { wrap, input, output } = field()
    showSeekLanding(wrap, 25_000)
    expect(output.textContent).toBe('0:20 · Far out a bell answered')
    expect(output.hidden).toBe(false)
    expect(input.getAttribute('aria-valuetext')).toBe(
      '0:20 · Far out a bell answered',
    )
    wrap.setAttribute('data-landings', JSON.stringify(landings.slice(1)))
    showSeekLanding(wrap, 5_000)
    expect(output.hidden).toBe(true)
    wrap.remove()
  })

  it('shows the landing while the bar is dragged and puts it away on release', async () => {
    const { wrap, input, output } = field()
    const fiber = Effect.runFork(
      Stream.runDrain(seekFieldMount<never>().f(wrap)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    input.value = '41000'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await until(() => output.hidden === false)
    expect(output.textContent).toBe('0:40 · Then the fog came in')
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await until(() => output.hidden === true)
    expect(output.hidden).toBe(true)
    expect(input.getAttribute('aria-valuetext')).toBe('0:05 of 1:00')
    await Effect.runPromise(Fiber.interrupt(fiber))
    wrap.remove()
  })
})

describe('Enter again in a text field, in the Foldkit HTML painter', () => {
  const searchField = TextInput({
    value: 'lamp',
    action: 'SearchFor',
    againAction: 'NextMatch',
    label: 'Search the words',
  })

  it('listens for Enter pressed again on a field that has an again action', () => {
    const input = treeOf(searchField)
    expect(typeof input.data?.on?.[againEventName]).toBe('function')
    expect(JSON.stringify(input)).toContain('"data-shown":"lamp"')
    const plain = treeOf(TextInput({ value: 'lamp', action: 'SearchFor' }))
    expect(plain.data?.on?.[againEventName]).toBeUndefined()
  })

  it('says again when Enter is pressed on text that has not changed, and not otherwise', async () => {
    const input = document.createElement('input')
    input.setAttribute('data-shown', 'lamp')
    input.value = 'lamp'
    document.body.append(input)
    const again: Array<string> = []
    input.addEventListener(againEventName, () => again.push('again'))
    const fiber = Effect.runFork(
      Stream.runDrain(textAgainMount<never>().f(input)),
    )
    await new Promise(resolve => {
      setTimeout(resolve, 20)
    })
    const enter = () =>
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    enter()
    expect(again).toEqual(['again'])
    input.value = 'lamps'
    enter()
    expect(again).toEqual(['again'])
    input.value = ' lamp '
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    enter()
    expect(again).toEqual(['again', 'again'])
    await Effect.runPromise(Fiber.interrupt(fiber))
    enter()
    expect(again).toEqual(['again', 'again'])
    input.remove()
  })
})
