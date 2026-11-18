import { Array, Option } from 'effect'
import { Catalog, Interaction, Navigation } from 'foldkit'
import type { ListItem, UiNode } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { App, type AppMessage, type AppModel } from './app.js'
import { LocalDay } from './calendar.js'
import { ReachedDay, ReceivedBoard, SharedLink } from './message.js'
import { sampleBoard, sampleListIds } from './sample.js'

type Written = Readonly<{ name: string; write: unknown }>

const today = LocalDay.make('2026-10-07')

const groceries = sampleListIds.groceries
const reading = sampleListIds.reading

const oatMilk = '00000000-0000-4000-8003-000000000001'
const oliveOil = '00000000-0000-4000-8003-000000000005'
const plumber = '00000000-0000-4000-8003-00000000000b'
const expenseReport = '00000000-0000-4000-8003-000000000015'
const lanternKeeper = '00000000-0000-4000-8003-00000000001f'

const bindApp = () => {
  const board = sampleBoard(today)
  let model: AppModel = App.update(
    App.update(App.init()[0], ReceivedBoard({ board }))[0],
    ReachedDay({ today }),
  )[0]
  const written: Array<Written> = []
  const handle = {
    readModel: () => model,
    subscribe: () => () => {},
    send: (message: AppMessage) => {
      const [next, commands] = App.update(model, message)
      model = next
      Array.forEach(commands, command => {
        const args: unknown = 'args' in command ? command.args : undefined
        written.push({
          name: command.name,
          write:
            typeof args === 'object' && args !== null && 'write' in args
              ? args.write
              : args,
        })
      })
    },
    stop: () => Promise.resolve(),
  }
  return { bound: Interaction.bind(App, handle), written, send: handle.send }
}

type Bound = ReturnType<typeof bindApp>['bound']

const uriOf = (bound: Bound) => Option.map(bound.navigation(), plan => plan.uri)

const availabilityOf = (bound: Bound, tag: string) =>
  Option.map(
    Array.findFirst(bound.entries(), entry => entry.tag === tag),
    entry => entry.availability._tag,
  )

const screenText = (bound: Bound) =>
  Option.match(Navigation.frameOf(bound), {
    onNone: () => '',
    onSome: frame =>
      JSON.stringify([
        frame.base.view,
        ...Array.map(frame.overlays, layer => layer.view),
      ]),
  })

const writesOf = (written: ReadonlyArray<Written>) =>
  Array.map(written, ({ write }) => write)

const itemsIn = (node: UiNode): ReadonlyArray<ListItem> => {
  if (node._tag === 'List') {
    return node.items
  } else if (
    node._tag === 'Column' ||
    node._tag === 'Row' ||
    node._tag === 'Box' ||
    node._tag === 'DeviceShell'
  ) {
    return Array.flatMap(node.children, itemsIn)
  } else {
    return []
  }
}

const sheetItemsOf = (bound: Bound): ReadonlyArray<ListItem> =>
  Option.match(
    Option.flatMap(Navigation.frameOf(bound), frame =>
      Array.last(frame.overlays),
    ),
    {
      onNone: () => [],
      onSome: layer =>
        layer.view._tag === 'Screen' ? itemsIn(layer.view.node) : [],
    },
  )

const hrefsOf = (bound: Bound): ReadonlyArray<string> =>
  Array.getSomes(
    Array.map(
      Array.fromIterable(screenText(bound).matchAll(/"href":"([^"]+)"/g)),
      match => Array.get(match, 1),
    ),
  )

describe('Reminders', () => {
  it('shows the smart lists with what each holds, and opens a list from its row', () => {
    const { bound } = bindApp()
    expect(screenText(bound)).toContain('4 due by today')
    expect(screenText(bound)).toContain('Groceries')
    bound.press(`OpenList:${groceries}`)
    expect(uriOf(bound)).toEqual(Option.some(`/reminders/lists/${groceries}`))
    expect(screenText(bound)).toContain('Oat milk')
  })

  it('adds a reminder to the open list at its end, from the field’s Enter', () => {
    const { bound, written } = bindApp()
    bound.press(`OpenList:${groceries}`)
    expect(bound.press('AddReminder:  Buy bread  ')).toBe(true)
    expect(writesOf(written)).toEqual([
      {
        _tag: 'InsertReminder',
        listId: groceries,
        title: 'Buy bread',
        position: 5,
        isFlagged: false,
        maybeDue: Option.none(),
      },
    ])
  })

  it('adds a reminder due today on Today, and a flagged one on Flagged', () => {
    const { bound, written } = bindApp()
    bound.press('OpenSmartList:today')
    expect(uriOf(bound)).toEqual(Option.some('/reminders/today'))
    bound.press('AddReminder:Call Ada')
    bound.press('OpenSmartList:flagged')
    bound.press('AddReminder:Renew passport')
    expect(writesOf(written)).toEqual([
      expect.objectContaining({
        title: 'Call Ada',
        isFlagged: false,
        maybeDue: Option.some({ day: today, time: '09:00' }),
      }),
      expect.objectContaining({
        title: 'Renew passport',
        isFlagged: true,
        maybeDue: Option.none(),
      }),
    ])
  })

  it('ticks a reminder done from its row, and opens it over the smart list it came from', () => {
    const { bound, written } = bindApp()
    bound.press('OpenSmartList:today')
    expect(screenText(bound)).toContain('Overdue')
    bound.press(`Complete:${expenseReport}`)
    bound.press(`OpenReminder:${oatMilk}`)
    expect(uriOf(bound)).toEqual(
      Option.some(`/reminders/today/reminder/${oatMilk}`),
    )
    expect(writesOf(written)).toEqual([
      {
        _tag: 'UpdateCompletion',
        reminderId: expenseReport,
        isCompleted: true,
      },
    ])
  })

  it('makes every row a link to its page, and every detail a link to its Sheet', () => {
    const { bound } = bindApp()
    const hrefs = () => hrefsOf(bound)
    expect(hrefs()).toEqual(
      expect.arrayContaining([
        '/reminders/today',
        `/reminders/lists/${groceries}`,
        '/reminders/tags/chores',
      ]),
    )
    bound.press('OpenSmartList:today')
    expect(hrefs()).toContain(`/reminders/today/reminder/${oatMilk}`)
    bound.press(`OpenReminder:${oatMilk}`)
    expect(hrefs()).toEqual(
      expect.arrayContaining([
        `/reminders/today/reminder/${oatMilk}/due`,
        `/reminders/today/reminder/${oatMilk}/priority`,
        `/reminders/today/reminder/${oatMilk}/move`,
        '/reminders/tags/errands',
      ]),
    )
  })

  it('shares a reminder at its own list’s address, wherever it was opened, and says so until the screen changes', () => {
    const { bound, written, send } = bindApp()
    bound.press('OpenSmartList:today')
    bound.press(`OpenReminder:${oatMilk}`)
    expect(bound.pressKey(Interaction.keyInput('c'))).toBe(true)
    expect(written).toEqual([
      {
        name: 'ShareLink',
        write: {
          path: `/reminders/lists/${groceries}/reminder/${oatMilk}`,
          title: 'Oat milk',
        },
      },
    ])
    send(SharedLink({ how: 'Copied' }))
    expect(screenText(bound)).toContain('Link copied')
    bound.pressKey(Interaction.keyInput('d'))
    expect(screenText(bound)).not.toContain('Link copied')
  })

  it('goes between the Lists and Profile tabs, the Profile tab with no Back', () => {
    const { bound } = bindApp()
    expect(screenText(bound)).toContain('"isCurrent":true')
    bound.press('ShowProfile')
    expect(uriOf(bound)).toEqual(Option.some('/reminders/profile'))
    expect(screenText(bound)).toContain('ada@example.com')
    expect(screenText(bound)).not.toContain('"action":"GoBack"')
    bound.press('ShowLists')
    expect(uriOf(bound)).toEqual(Option.some('/reminders'))
  })

  it('moves a reminder only to lists the person may change, its own marked', () => {
    const { bound } = bindApp()
    bound.press(`OpenReminder:${oatMilk}`)
    bound.press('ShowMoveOptions')
    expect(
      Array.map(sheetItemsOf(bound), item => [item.title, item.isCurrent]),
    ).toEqual([
      ['Groceries', true],
      ['Home', false],
      ['Work', false],
    ])
  })

  it('opens a shared link to a reminder, and its keys act on it', () => {
    const { bound, written } = bindApp()
    bound.openUri(
      `/reminders/lists/${groceries}/reminder/${oatMilk}`,
      Navigation.Link(),
    )
    expect(uriOf(bound)).toEqual(
      Option.some(`/reminders/lists/${groceries}/reminder/${oatMilk}`),
    )
    bound.pressKey(Interaction.keyInput('x'))
    bound.pressKey(Interaction.keyInput('f'))
    expect(writesOf(written)).toEqual([
      { _tag: 'UpdateCompletion', reminderId: oatMilk, isCompleted: true },
      { _tag: 'UpdateFlag', reminderId: oatMilk, isFlagged: true },
    ])
  })

  it('closes the due dates as soon as one is chosen', () => {
    const { bound, written } = bindApp()
    bound.press(`OpenReminder:${oatMilk}`)
    bound.pressKey(Interaction.keyInput('d'))
    expect(uriOf(bound)).toEqual(
      Option.some(`/reminders/lists/${groceries}/reminder/${oatMilk}/due`),
    )
    bound.press('SetDue:2026-10-08T09:00')
    expect(uriOf(bound)).toEqual(
      Option.some(`/reminders/lists/${groceries}/reminder/${oatMilk}`),
    )
    bound.pressKey(Interaction.keyInput('d'))
    bound.press('SetDue:2026-12-24 18:30')
    expect(writesOf(written)).toEqual([
      {
        _tag: 'UpdateDue',
        reminderId: oatMilk,
        maybeDue: Option.some({ day: '2026-10-08', time: '09:00' }),
      },
      {
        _tag: 'UpdateDue',
        reminderId: oatMilk,
        maybeDue: Option.some({ day: '2026-12-24', time: '18:30' }),
      },
    ])
    expect(bound.press('SetDue:2026-02-30')).toBe(false)
  })

  it('sets a priority and moves a reminder from their sheets, the list page following it', () => {
    const { bound, written } = bindApp()
    bound.press(`OpenList:${groceries}`)
    bound.press(`OpenReminder:${oatMilk}`)
    bound.pressKey(Interaction.keyInput('p'))
    bound.press('SetPriority:high')
    bound.press('ShowMoveOptions')
    bound.press(`MoveReminder:${sampleListIds.home}`)
    expect(uriOf(bound)).toEqual(
      Option.some(`/reminders/lists/${sampleListIds.home}/reminder/${oatMilk}`),
    )
    expect(writesOf(written)).toEqual([
      {
        _tag: 'UpdatePriority',
        reminderId: oatMilk,
        maybePriority: Option.some('High'),
      },
      {
        _tag: 'RelinkReminder',
        reminderId: oatMilk,
        fromListId: groceries,
        toListId: sampleListIds.home,
        position: 5,
      },
    ])
  })

  it('tags with the tag already there, by its words however they are typed', () => {
    const { bound, written } = bindApp()
    bound.press(`OpenReminder:${plumber}`)
    bound.press('AddTag: #Chores ')
    bound.press('AddTag:Plumbing')
    expect(writesOf(written)).toEqual([
      {
        _tag: 'LinkTag',
        reminderId: plumber,
        title: 'chores',
        maybeTagId: Option.some('00000000-0000-4000-8004-000000000002'),
      },
      {
        _tag: 'LinkTag',
        reminderId: plumber,
        title: 'plumbing',
        maybeTagId: Option.none(),
      },
    ])
  })

  it('keeps a list someone else shares to view read-only', () => {
    const { bound, written } = bindApp()
    bound.press(`OpenList:${reading}`)
    expect(availabilityOf(bound, 'AddReminder')).toEqual(
      Option.some('Disabled'),
    )
    expect(bound.press(`Complete:${lanternKeeper}`)).toBe(false)
    expect(screenText(bound)).toContain('Noor Vale’s list, view only')
    expect(written).toEqual([])
  })

  it('asks before deleting a list, then goes home', () => {
    const { bound, written } = bindApp()
    bound.press(`OpenList:${groceries}`)
    bound.press('DeleteList')
    expect(uriOf(bound)).toEqual(
      Option.some(`/reminders/lists/${groceries}/delete/${groceries}`),
    )
    expect(availabilityOf(bound, 'AddReminder')).toEqual(
      Option.some('Disabled'),
    )
    bound.pressKey(Interaction.keyInput('y'))
    expect(uriOf(bound)).toEqual(Option.some('/reminders'))
    expect(writesOf(written)).toEqual([
      { _tag: 'RemoveList', listId: groceries },
    ])
  })

  it('shows done reminders on request, and clears them after asking', () => {
    const { bound, written } = bindApp()
    bound.press(`OpenList:${groceries}`)
    expect(screenText(bound)).not.toContain('Olive oil')
    bound.press('ShowCompleted')
    expect(screenText(bound)).toContain('Olive oil')
    bound.press('ClearCompleted')
    bound.press(`ConfirmClearCompleted:${groceries}`)
    expect(writesOf(written)).toEqual([
      { _tag: 'RemoveReminders', reminderIds: [oliveOil] },
    ])
  })

  it('searches by words and by tag, at an address that names the search', () => {
    const { bound } = bindApp()
    bound.press('Search:milk')
    expect(uriOf(bound)).toEqual(
      Option.some('/reminders/search?search.query=milk'),
    )
    expect(screenText(bound)).toContain('Oat milk')
    bound.press('Search:#chores')
    expect(screenText(bound)).toContain('Water the plants')
    expect(screenText(bound)).not.toContain('Oat milk')
  })

  it('shares only with someone not already sharing, and changes what they may do', () => {
    const { bound, written } = bindApp()
    bound.press(`OpenList:${groceries}`)
    bound.press('ShowSharing')
    bound.press('ShareWith:Sam@Example.com')
    bound.press('AllowViewingOnly:00000000-0000-4000-8001-000000000002')
    expect(writesOf(written)).toEqual([
      expect.objectContaining({
        _tag: 'UpdateMembershipRole',
        memberId: '00000000-0000-4000-8001-000000000002',
        from: 'Writer',
        to: 'Reader',
      }),
    ])
  })

  it('refuses stacks the screens never allow', () => {
    const { bound } = bindApp()
    bound.openUri(
      `/reminders/lists/${groceries}/reminder/${oatMilk}/due/priority`,
      Navigation.Link(),
    )
    expect(uriOf(bound)).toEqual(
      Option.some(`/reminders/lists/${groceries}/reminder/${oatMilk}/due`),
    )
    bound.openUri('/reminders/profile/reminder/x', Navigation.Link())
    expect(
      Option.map(bound.navigation(), plan =>
        Array.map(plan.entries, entry =>
          Navigation.isNotFound(entry.destination) ? 'NotFound' : 'Screen',
        ),
      ),
    ).toEqual(Option.some(['Screen', 'Screen', 'NotFound']))
  })

  it('names every Action as a CLI command with its words', () => {
    expect(Catalog.commandOf('AddReminder:Buy milk')).toBe(
      'add-reminder Buy milk',
    )
    expect(Catalog.commandOf(`Complete:${oatMilk}`)).toBe(`complete ${oatMilk}`)
    expect(Catalog.commandOf('SetPriority:high')).toBe('set-priority high')
    expect(Catalog.commandOf('OpenSmartList:today')).toBe(
      'open-smart-list today',
    )
  })
})
