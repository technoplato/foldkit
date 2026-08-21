import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { md } from '../message/public.js'
import { buttonsOf } from '../renderers/query.js'
import { compose } from './compose.js'
import { make } from './program.js'

const Increment = md('Increment', {
  what: 'Adds one',
  why: 'Test',
  keys: ['+'],
  tokens: ['increment'],
  valid: () => true,
})
const Reset = md('Reset', {
  what: 'Sets zero',
  why: 'Test',
  keys: ['r'],
  tokens: ['reset'],
  valid: (model: { readonly count: number }) => model.count !== 0,
  hiddenBecause: (model: { readonly count: number }) =>
    model.count === 0 ? 'count is already 0' : undefined,
})
const CounterMessage = S.Union([Increment, Reset])
type CounterMessage = typeof CounterMessage.Type

const CounterModel = S.Struct({ count: S.Number })
type CounterModel = typeof CounterModel.Type

const actions = [Increment, Reset] as const

const actionByToken = (
  token: string,
): typeof Increment | typeof Reset | undefined => {
  if (token === 'increment') {
    return Increment
  }
  if (token === 'reset') {
    return Reset
  }
  return undefined
}

const Counter = Object.assign(
  make({
    id: 'test-counter',
    version: 1,
    Model: CounterModel,
    Message: CounterMessage,
    init: () => [{ count: 0 }, []],
    update: (model, message) => {
      if (message._tag === 'Increment') {
        return [{ count: model.count + 1 }, []]
      }
      if (message._tag === 'Reset') {
        return [{ count: 0 }, []]
      }
      return [model, []]
    },
    valid: (model: CounterModel) =>
      actions.map(action => ({
        token: action.tokens?.[0] ?? '',
        keys: action.keys ?? [],
        spoken: [],
        valid: action.valid(model, {}),
        ...(action.hiddenBecause === undefined
          ? {}
          : { hidden: action.hiddenBecause(model) }),
      })),
    screen: (model: CounterModel) => ({
      _tag: 'Text' as const,
      content: model.count.toString(),
    }),
  }),
  { actionByToken },
)

describe('Program.compose.actionMenu', () => {
  const App = compose.actionMenu({ of: Counter })

  it('inits Closed and opens on ActionMenuCommandTriggered', () => {
    const [model] = App.init()
    expect(model.product.count).toBe(0)
    expect(model.actionMenu).toEqual({ _tag: 'Closed' })

    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    expect(open.actionMenu).toEqual({
      _tag: 'Open',
      focus: 0,
      maybeQuery: Option.none(),
    })
    expect(open.product.count).toBe(0)
  })

  it('toggles Closed and Open on ActionMenuCommandTriggered', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    expect(open.actionMenu._tag).toBe('Open')
    const [closed] = App.update(open, App.ActionMenuCommandTriggered())
    expect(closed.actionMenu).toEqual({ _tag: 'Closed' })
    expect(closed.product.count).toBe(0)
  })

  it('filters reset and names Empty when nothing matches', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const [resetQuery] = App.update(
      open,
      App.ActionMenuQueryChanged({ query: 'reset' }),
    )
    expect(resetQuery.actionMenu._tag).toBe('Open')
    if (resetQuery.actionMenu._tag === 'Open') {
      expect(resetQuery.actionMenu.maybeQuery).toEqual(Option.some('reset'))
      expect(resetQuery.actionMenu.focus).toBe(0)
    }
    const resetButtons = buttonsOf(
      App.screen?.(resetQuery) ?? { _tag: 'Text', content: '' },
    )
    expect(resetButtons.map(button => button.token)).toContain(
      'action-menu:reset',
    )
    expect(resetButtons.map(button => button.token)).not.toContain(
      'action-menu:increment',
    )

    const [emptyQuery] = App.update(
      resetQuery,
      App.ActionMenuQueryChanged({ query: 'zzz' }),
    )
    const emptyScreen = App.screen?.(emptyQuery) ?? {
      _tag: 'Text' as const,
      content: '',
    }
    const emptyButtons = buttonsOf(emptyScreen)
    expect(emptyButtons.map(button => button.token)).toEqual([
      'action-menu-dismiss',
    ])
    expect(JSON.stringify(emptyScreen)).toContain('Empty')
    expect(JSON.stringify(emptyScreen)).not.toContain('> ')

    const [stillOpen] = App.update(emptyQuery, App.ActionMenuDismissed())
    expect(stillOpen.actionMenu).toEqual({ _tag: 'Closed' })
  })

  it('closes on ActionMenuDismissed', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const [closed] = App.update(open, App.ActionMenuDismissed())
    expect(closed.actionMenu).toEqual({ _tag: 'Closed' })
    expect(closed.product.count).toBe(0)
  })

  it('moves focus and wraps', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const [down] = App.update(
      open,
      App.ActionMenuFocusMoved({ direction: 'Down' }),
    )
    expect(down.actionMenu._tag).toBe('Open')
    if (down.actionMenu._tag === 'Open') {
      expect(down.actionMenu.focus).toBe(1)
    }
    const [wrapped] = App.update(
      down,
      App.ActionMenuFocusMoved({ direction: 'Down' }),
    )
    if (wrapped.actionMenu._tag === 'Open') {
      expect(wrapped.actionMenu.focus).toBe(0)
    }
  })

  it('applies Increment while Open and dismisses the menu', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const [after] = App.update(open, Increment())
    expect(after.product.count).toBe(1)
    expect(after.actionMenu._tag).toBe('Closed')
  })

  it('keeps Open when hidden Reset is selected', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const [ignored] = App.update(
      open,
      App.ActionCommandMenuSelectionMade({ token: 'reset' }),
    )
    expect(ignored.product.count).toBe(0)
    expect(ignored.actionMenu._tag).toBe('Open')
  })

  it('moves focus to a remaining row when the filter drops the focused row', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const [onReset] = App.update(
      open,
      App.ActionMenuFocusMoved({ direction: 'Down' }),
    )
    expect(onReset.actionMenu._tag).toBe('Open')
    if (onReset.actionMenu._tag === 'Open') {
      expect(onReset.actionMenu.focus).toBe(1)
    }
    const [filtered] = App.update(
      onReset,
      App.ActionMenuQueryChanged({ query: 'inc' }),
    )
    expect(filtered.actionMenu._tag).toBe('Open')
    if (filtered.actionMenu._tag === 'Open') {
      expect(filtered.actionMenu.focus).toBe(0)
      expect(filtered.actionMenu.maybeQuery).toEqual(Option.some('inc'))
    }
    const filteredButtons = buttonsOf(
      App.screen?.(filtered) ?? { _tag: 'Text', content: '' },
    )
    expect(filteredButtons.map(button => button.token)).toEqual([
      'action-menu:increment',
      'action-menu-dismiss',
    ])
    const increment = filteredButtons.find(
      button => button.token === 'action-menu:increment',
    )
    expect(increment?.label).toContain('> ')
  })

  it('selects Increment, applies the inner Action, and closes', () => {
    const [model] = App.init()
    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const [after] = App.update(
      open,
      App.ActionCommandMenuSelectionMade({ token: 'increment' }),
    )
    expect(after.product.count).toBe(1)
    expect(after.actionMenu).toEqual({ _tag: 'Closed' })
  })

  it('keeps reset gated at 0 and tappable after Increment', () => {
    const [model] = App.init()
    const rowsAtZero = App.valid?.(model) ?? []
    const resetAtZero = rowsAtZero.find(row => row.token === 'reset')
    expect(resetAtZero?.valid).toBe(false)
    expect(resetAtZero?.hidden).toBe('count is already 0')

    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const [ignored] = App.update(
      open,
      App.ActionCommandMenuSelectionMade({ token: 'reset' }),
    )
    expect(ignored.product.count).toBe(0)
    expect(ignored.actionMenu._tag).toBe('Open')

    const [afterInc] = App.update(ignored, Increment())
    expect(afterInc.actionMenu._tag).toBe('Closed')
    const rowsAfter = App.valid?.(afterInc) ?? []
    const resetAfter = rowsAfter.find(row => row.token === 'reset')
    expect(resetAfter?.valid).toBe(true)
    expect(resetAfter?.hidden).toBeUndefined()
  })

  it('paints gated rows on the screen tree when Open and omits them from product', () => {
    const [model] = App.init()
    const closedButtons = buttonsOf(
      App.screen?.(model) ?? { _tag: 'Text', content: '' },
    )
    expect(closedButtons.map(button => button.token)).toEqual([])

    const [open] = App.update(model, App.ActionMenuCommandTriggered())
    const openButtons = buttonsOf(
      App.screen?.(open) ?? { _tag: 'Text', content: '' },
    )
    const tokens = openButtons.map(button => button.token)
    expect(tokens).toContain('action-menu:increment')
    expect(tokens).toContain('action-menu:reset')
    const reset = openButtons.find(
      button => button.token === 'action-menu:reset',
    )
    expect(reset?.disabled).toBe(true)
    expect(reset?.label).toContain('[ r ] reset: count is already 0')
    const increment = openButtons.find(
      button => button.token === 'action-menu:increment',
    )
    expect(increment?.label).toContain('[ + ] increment')
  })
})
