import { Array, Option } from 'effect'
import { Catalog, Interaction, Navigation } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { App, type AppModel } from './app.js'
import { CounterId } from './counterId.js'
import { ConfirmDeleteCounter } from './message.js'

const handleAt = (start: AppModel) => {
  let model = start
  const listeners = new Set<() => void>()
  return {
    readModel: () => model,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send: (message: typeof App.Message.Type) => {
      model = App.update(model, message)[0]
      listeners.forEach(listener => {
        listener()
      })
    },
    stop: () => Promise.resolve(),
  }
}

const bindApp = (start: AppModel = App.init()[0]) =>
  Interaction.bind(App, handleAt(start))

type Bound = ReturnType<typeof bindApp>

const countsOf = (bound: Bound): ReadonlyArray<readonly [number, number]> =>
  Array.map(bound.readModel().counters, row => [
    row.counterId,
    row.counter.count,
  ])

const uriOf = (bound: Bound): string =>
  Option.getOrElse(
    Option.map(bound.navigation(), plan => plan.uri),
    () => 'no plan',
  )

const availabilityOf = (bound: Bound, tag: string): string =>
  Option.match(
    Array.findFirst(bound.entries(), entry => entry.tag === tag),
    {
      onNone: () => 'absent',
      onSome: entry =>
        Catalog.isEnabled(entry.availability) ? 'Enabled' : 'Disabled',
    },
  )

describe('the list', () => {
  it('starts with Counter 1 at 0, its Reset Disabled like the Counter', () => {
    const bound = bindApp()
    expect(countsOf(bound)).toEqual([[1, 0]])
    expect(availabilityOf(bound, 'Reset:1')).toBe('Disabled')
    expect(bound.press('Increment:1')).toBe(true)
    expect(countsOf(bound)).toEqual([[1, 1]])
    expect(availabilityOf(bound, 'Reset:1')).toBe('Enabled')
  })

  it('appends a counter at 0 and never hands a counterId out twice', () => {
    const bound = bindApp()
    bound.press('AddCounter')
    bound.press('DeleteCounter:2')
    bound.press('ConfirmDeleteCounter')
    bound.press('AddCounter')
    expect(countsOf(bound)).toEqual([
      [1, 0],
      [3, 0],
    ])
  })

  it('titles and words each row Action for its counter', () => {
    const bound = bindApp()
    const increment = Option.getOrThrow(
      Array.findFirst(bound.entries(), entry => entry.tag === 'Increment:1'),
    )
    expect(increment.title).toBe('Increment counter 1')
    expect(Catalog.commandOf(increment.tag)).toBe('increment 1')
  })
})

describe('a counter page', () => {
  it('opens above the list and counts with the Counter keys', () => {
    const bound = bindApp()
    bound.press('OpenCounter:1')
    expect(uriOf(bound)).toBe('/counters/1')
    bound.pressKey(Interaction.keyInput('+'))
    bound.press('Increment')
    expect(countsOf(bound)).toEqual([[1, 2]])
  })

  it('never stacks one counter page on another', () => {
    const bound = bindApp()
    bound.press('AddCounter')
    bound.press('OpenCounter:1')
    bound.openMenu()
    bound.chooseFromMenu('OpenCounter:2')
    expect(uriOf(bound)).toBe('/counters/2')
  })
})

describe('the delete question', () => {
  it('asks, and Delete removes exactly the counter it names', () => {
    const bound = bindApp()
    bound.press('AddCounter')
    bound.press('DeleteCounter:1')
    expect(uriOf(bound)).toBe('/counters/delete/1')
    bound.press('ConfirmDeleteCounter')
    expect(countsOf(bound)).toEqual([[2, 0]])
    expect(uriOf(bound)).toBe('/counters')
  })

  it('takes the counter page with it when asked from that page', () => {
    const bound = bindApp()
    bound.press('OpenCounter:1')
    bound.pressKey(Interaction.keyInput('d'))
    expect(uriOf(bound)).toBe('/counters/1/delete/1')
    bound.pressKey(Interaction.keyInput('y'))
    expect(uriOf(bound)).toBe('/counters')
    expect(countsOf(bound)).toEqual([])
  })

  it('keeps the counter on Cancel and on Escape', () => {
    const bound = bindApp()
    bound.press('DeleteCounter:1')
    bound.press('CancelDeleteCounter')
    expect(uriOf(bound)).toBe('/counters')
    bound.press('DeleteCounter:1')
    bound.pressKey(Interaction.keyInput('Escape'))
    expect(uriOf(bound)).toBe('/counters')
    expect(countsOf(bound)).toEqual([[1, 0]])
  })

  it('lets nothing beneath it be pressed, from any surface', () => {
    const bound = bindApp()
    bound.press('AddCounter')
    bound.press('DeleteCounter:1')
    expect(bound.press('Increment:2')).toBe(false)
    expect(bound.press('AddCounter')).toBe(false)
    expect(bound.press('DeleteCounter:2')).toBe(false)
    expect(availabilityOf(bound, 'Increment:2')).toBe('Disabled')
    expect(countsOf(bound)).toEqual([
      [1, 0],
      [2, 0],
    ])
  })

  it('is the one modal: the action menu cannot open over it', () => {
    const bound = bindApp()
    bound.press('DeleteCounter:1')
    bound.openMenu()
    expect(Option.isNone(bound.menu())).toBe(true)
    expect(uriOf(bound)).toBe('/counters/delete/1')
  })

  it('cannot be confirmed when no question is open', () => {
    const bound = bindApp()
    expect(availabilityOf(bound, 'ConfirmDeleteCounter')).toBe('Disabled')
    expect(bound.press('ConfirmDeleteCounter')).toBe(false)
    expect(countsOf(bound)).toEqual([[1, 0]])
  })
})

describe('deleting elsewhere', () => {
  it('closes this device’s page and question for the deleted counter', () => {
    const bound = bindApp()
    bound.press('OpenCounter:1')
    bound.press('DeleteCounter')
    bound.send(ConfirmDeleteCounter({ counterId: CounterId.make(1) }))
    expect(uriOf(bound)).toBe('/counters')
  })

  it('leaves a page for a counter that is gone saying so', () => {
    const bound = bindApp()
    bound.openUri('/counters/9', Navigation.Link())
    expect(uriOf(bound)).toBe('/counters/9')
    expect(bound.windowTitle()).toBe('Counter 9 | Foldkit')
  })
})
