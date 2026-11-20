import { Host, LongPress, Slot } from 'foldkit/behavior'
import { browserRecognizes } from 'foldkit/renderers'
import { Shelf } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: this is the React painter's driver of the gesture test every
// painter runs. It paints the made-up shelf with the React painter and
// does what a person does with the browser's events. The table of acts
// and the shelf are shared with the HTML and the phone drivers.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 5)
  })

const stage = () => {
  const shelf = Shelf.start()
  const painted = () =>
    paintTree(shelf.tree(), {
      onPress: button => {
        if (button.action !== undefined) {
          shelf.press(button.action)
        }
      },
    })
  const view = render(painted())
  const repaint = (): void => {
    act(() => {
      view.rerender(painted())
    })
  }
  const elementWith = (selector: string): HTMLElement => {
    const maybeElement = view.container.querySelector(selector)
    if (maybeElement instanceof HTMLElement) {
      return maybeElement
    }
    throw new Error(`the painted shelf has no ${selector}`)
  }
  const elapse = async (ms: number): Promise<void> => {
    await shelf.elapse(ms)
    repaint()
    await tick()
    repaint()
  }
  return {
    shelf,
    repaint,
    elapse,
    row: () => elementWith('li.fk-item[data-key="salt-road"]'),
    rowPress: () => elementWith('li.fk-item[data-key="salt-road"] button'),
    pin: () => elementWith('button[data-slot-held]'),
  }
}

type Stage = ReturnType<typeof stage>

const touch = { pointerType: 'touch', clientX: 10, clientY: 10 }

const perform = async (
  staged: Stage,
  target: () => HTMLElement,
  personAct: Host.PersonAct,
): Promise<void> => {
  if (personAct === 'Hold') {
    fireEvent.pointerDown(target(), touch)
    staged.repaint()
    await staged.elapse(LongPress.holdMs)
    fireEvent.pointerUp(target(), touch)
    staged.repaint()
  } else {
    fireEvent.contextMenu(target())
    staged.repaint()
  }
}

describe('the gesture test, on the React painter', () => {
  it('hears every gesture the menu’s row listens for, as any browser painter does', () => {
    expect(
      Host.unheard(Slot.menuAsk('ShowTitleMenu:salt-road'), browserRecognizes),
    ).toEqual([])
  })

  it.each(Host.personActs)(
    '%s on a title’s row opens that title’s menu',
    async personAct => {
      const staged = stage()
      await perform(staged, staged.row, personAct)
      expect(staged.shelf.model().parts['TitleMenu']).toEqual(
        Shelf.OpenOn({ key: 'salt-road' }),
      )
      expect(Shelf.actionsOf(staged.shelf)).toEqual(['ShowTitleMenu'])
    },
  )

  it.each(Host.personActs)(
    '%s on a second part, bound on a button, does that part’s Action, with no painter code naming it',
    async personAct => {
      const staged = stage()
      await perform(staged, staged.pin, personAct)
      expect(staged.shelf.model().parts['Pin']).toEqual(Shelf.Pinned())
      expect(Shelf.actionsOf(staged.shelf)).toEqual(['TogglePin'])
    },
  )

  it('opens nothing when the finger moves off the spot, or lifts early', async () => {
    const staged = stage()
    fireEvent.pointerDown(staged.row(), touch)
    fireEvent.pointerMove(staged.row(), { ...touch, clientX: 60 })
    await staged.elapse(LongPress.holdMs)
    fireEvent.pointerUp(staged.row(), touch)
    fireEvent.pointerDown(staged.row(), touch)
    await staged.elapse(LongPress.holdMs - 100)
    fireEvent.pointerUp(staged.row(), touch)
    await staged.elapse(LongPress.holdMs)
    expect(Shelf.actionsOf(staged.shelf)).toEqual([])
  })

  it('stops the tap that ends a hold, so the row is not also opened, and stops no tap after it', async () => {
    const staged = stage()
    await perform(staged, staged.row, 'Hold')
    fireEvent.click(staged.rowPress())
    staged.repaint()
    expect(Shelf.actionsOf(staged.shelf)).toEqual(['ShowTitleMenu'])
    expect(staged.shelf.model().parts['hold']).toEqual(
      LongPress.Idle({ pressCount: 1 }),
    )
    fireEvent.click(staged.rowPress())
    expect(Shelf.actionsOf(staged.shelf)).toEqual(['ShowTitleMenu', 'Open'])
  })
})
