import { Array, Option } from 'effect'
import { Catalog, Interaction, Navigation } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { App, type AppModel } from './app.js'
import { CounterId } from './counterId.js'
import { ConfirmDelete } from './message.js'

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

const availabilityOf = (bound: Bound, tag: string): string => {
  const parsed = Catalog.parseChoiceTag(tag)
  const entryTag = Option.match(parsed, {
    onNone: () => tag,
    onSome: choice => choice.tag,
  })
  return Option.match(
    Option.flatMap(
      Array.findFirst(bound.entries(), entry => entry.tag === entryTag),
      entry =>
        Option.match(parsed, {
          onNone: () => Option.some(entry.availability),
          onSome: ({ token }) =>
            Option.flatMap(entry.maybeChoices, choices =>
              Option.map(
                Array.findFirst(
                  choices.choices,
                  choice => choice.token === token,
                ),
                choice => choice.availability,
              ),
            ),
        }),
    ),
    {
      onNone: () => 'absent',
      onSome: availability =>
        Catalog.isEnabled(availability) ? 'Enabled' : 'Disabled',
    },
  )
}

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
    bound.press('Add')
    bound.press('Delete:2')
    bound.press('ConfirmDelete')
    bound.press('Add')
    expect(countsOf(bound)).toEqual([
      [1, 0],
      [3, 0],
    ])
  })

  it('offers each counter Action once, asking which counter second', () => {
    const bound = bindApp()
    bound.press('Add')
    const tags = Array.map(bound.entries(), entry => entry.tag)
    expect(tags).toContain('Increment')
    expect(tags).not.toContain('Increment:1')
    const reset = Option.getOrThrow(
      Array.findFirst(bound.entries(), entry => entry.tag === 'Reset'),
    )
    expect(reset.title).toBe('Reset')
    expect(reset.availability).toEqual(
      Catalog.Disabled({ because: 'count is already 0' }),
    )
    expect(Catalog.commandOf('Increment:2')).toBe('increment 2')
  })
})

describe('a counter page', () => {
  it('opens above the list and counts with the Counter keys', () => {
    const bound = bindApp()
    bound.press('Open:1')
    expect(uriOf(bound)).toBe('/counters/1')
    bound.pressKey(Interaction.keyInput('+'))
    bound.press('Increment')
    expect(countsOf(bound)).toEqual([[1, 2]])
  })

  it('never stacks one counter page on another', () => {
    const bound = bindApp()
    bound.press('Add')
    bound.press('Open:1')
    bound.openMenu()
    bound.chooseFromMenu('Open:2')
    expect(uriOf(bound)).toBe('/counters/2')
  })
})

describe('the delete question', () => {
  it('asks, and Delete removes exactly the counter it names', () => {
    const bound = bindApp()
    bound.press('Add')
    bound.press('Delete:1')
    expect(uriOf(bound)).toBe('/counters/delete/1')
    bound.press('ConfirmDelete')
    expect(countsOf(bound)).toEqual([[2, 0]])
    expect(uriOf(bound)).toBe('/counters')
  })

  it('takes the counter page with it when asked from that page', () => {
    const bound = bindApp()
    bound.press('Open:1')
    bound.pressKey(Interaction.keyInput('d'))
    expect(uriOf(bound)).toBe('/counters/1/delete/1')
    bound.pressKey(Interaction.keyInput('y'))
    expect(uriOf(bound)).toBe('/counters')
    expect(countsOf(bound)).toEqual([])
  })

  it('keeps the counter on Cancel and on Escape', () => {
    const bound = bindApp()
    bound.press('Delete:1')
    bound.press('CancelDelete')
    expect(uriOf(bound)).toBe('/counters')
    bound.press('Delete:1')
    bound.pressKey(Interaction.keyInput('Escape'))
    expect(uriOf(bound)).toBe('/counters')
    expect(countsOf(bound)).toEqual([[1, 0]])
  })

  it('lets nothing beneath it be pressed, from any surface', () => {
    const bound = bindApp()
    bound.press('Add')
    bound.press('Delete:1')
    expect(bound.press('Increment:2')).toBe(false)
    expect(bound.press('Add')).toBe(false)
    expect(bound.press('Delete:2')).toBe(false)
    expect(availabilityOf(bound, 'Increment:2')).toBe('Disabled')
    expect(countsOf(bound)).toEqual([
      [1, 0],
      [2, 0],
    ])
  })

  it('is the one modal: the action menu cannot open over it', () => {
    const bound = bindApp()
    bound.press('Delete:1')
    bound.openMenu()
    expect(Option.isNone(bound.menu())).toBe(true)
    expect(uriOf(bound)).toBe('/counters/delete/1')
  })

  it('cannot be confirmed when no question is open', () => {
    const bound = bindApp()
    expect(availabilityOf(bound, 'ConfirmDelete')).toBe('Disabled')
    expect(bound.press('ConfirmDelete')).toBe(false)
    expect(countsOf(bound)).toEqual([[1, 0]])
  })
})

describe('deleting elsewhere', () => {
  it('closes this device’s page and question for the deleted counter', () => {
    const bound = bindApp()
    bound.press('Open:1')
    bound.press('Delete')
    bound.send(ConfirmDelete({ counterId: CounterId.make(1) }))
    expect(uriOf(bound)).toBe('/counters')
  })

  it('leaves a page for a counter that is gone saying so', () => {
    const bound = bindApp()
    bound.openUri('/counters/9', Navigation.Link())
    expect(uriOf(bound)).toBe('/counters/9')
    expect(bound.windowTitle()).toBe('Counter 9 | Foldkit')
  })
})

describe('the action menu', () => {
  it('lists each Action once and opens the counters to choose from', () => {
    const bound = bindApp()
    bound.press('Add')
    bound.openMenu()
    const titles = Option.map(bound.menu(), menu =>
      menu.rows.map(row => row.title.map(run => run.text).join('')),
    )
    expect(titles).toEqual(
      Option.some([
        'Add counter',
        'Increment',
        'Decrement',
        'Open counter',
        'Delete counter',
        'Keep navigation local',
        'Open session settings',
        'Reset',
        'Confirm delete',
        'Cancel delete',
        'Back',
        'Mirror navigation',
        'Close session settings',
      ]),
    )
    bound.chooseFromMenu('Decrement')
    expect(uriOf(bound)).toBe('/counters/menu?menu.choose=Decrement')
    expect(
      Option.map(bound.menu(), menu => [
        menu.title,
        menu.filterLabel,
        menu.rows.map(row => row.entry.tag),
      ]),
    ).toEqual(
      Option.some([
        'Decrement',
        'Which counter?',
        ['Decrement:1', 'Decrement:2'],
      ]),
    )
    bound.chooseFromMenu('Decrement:2')
    expect(countsOf(bound)).toEqual([
      [1, 0],
      [2, -1],
    ])
    expect(Option.isNone(bound.menu())).toBe(true)
  })

  it('goes back from the choices on Escape, and closes on the next', () => {
    const bound = bindApp()
    bound.openMenu()
    bound.chooseFromMenu('Increment')
    bound.pressKey(Interaction.keyInput('Escape'))
    expect(Option.map(bound.menu(), menu => menu.title)).toEqual(
      Option.some('Actions'),
    )
    bound.pressKey(Interaction.keyInput('Escape'))
    expect(Option.isNone(bound.menu())).toBe(true)
  })

  it('opens the choices from a URI and filters them', () => {
    const bound = bindApp()
    bound.press('Add')
    bound.openUri('/counters/menu?menu.choose=Reset', Navigation.Link())
    bound.typeInMenu('2')
    expect(
      Option.map(bound.menu(), menu => menu.rows.map(row => row.entry.tag)),
    ).toEqual(Option.some(['Reset:2']))
  })
})
