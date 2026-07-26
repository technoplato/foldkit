import { CounterList } from 'counters-core-example'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { App, type Presenter } from './App.js'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/counters')
})

const renderPresenter = (presenter: Presenter) => {
  const query = presenter === 'ReactA' ? 'a' : 'b'
  window.history.replaceState({}, '', `/counters?presenter=${query}`)
  render(<App initialNavigation={CounterList.make({})} presenter={presenter} />)
}

const openFirstCounter = async () => {
  const counterButton = await screen.findByRole('button', {
    name: 'counter-1',
  })
  fireEvent.click(counterButton)
  await screen.findByText('← Back to counters')
}

describe('Multiple Counters React presenters', () => {
  it('React-A drives fact and delete through one custom modal shell', async () => {
    renderPresenter('ReactA')
    await openFirstCounter()

    fireEvent.click(screen.getByRole('button', { name: 'Show counter fact' }))
    const factDialog = await screen.findByRole('dialog', {
      name: 'Counter fact',
    })
    expect(factDialog.textContent).toContain('React-A | unified modal')
    await screen.findByText('0 is the current value of this counter.')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete counter' }))
    const deleteDialog = await screen.findByRole('dialog', {
      name: 'Delete counter-1',
    })
    expect(deleteDialog.textContent).toContain('Delete counter-1?')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('React-B derives a native dialog from state and replay removes and restores it', async () => {
    renderPresenter('ReactB')
    await openFirstCounter()

    fireEvent.click(screen.getByRole('button', { name: 'Delete counter' }))
    const deleteDialog = await screen.findByRole('dialog', {
      name: 'Delete counter-1?',
    })
    expect(deleteDialog).toBeInstanceOf(HTMLDialogElement)
    expect(deleteDialog).toHaveProperty('open', true)

    const previousButton = screen.getByRole('button', { name: 'Previous' })
    expect(deleteDialog.contains(previousButton)).toBe(true)
    fireEvent.click(previousButton)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByText('Inspecting')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete counter' }))
    const replayedDeleteDialog = await screen.findByRole('dialog', {
      name: 'Delete counter-1?',
    })
    expect(replayedDeleteDialog).toHaveProperty('open', true)
    expect(screen.getByText('Live')).toBeTruthy()
  })
})
