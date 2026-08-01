import { navigationToPath } from 'counters-core-example'
import {
  MultipleCountersClient,
  useMultipleCountersActions,
  useMultipleCountersModel,
  useMultipleCountersReplay,
  useMultipleCountersResolutionError,
} from 'counters-react-bindings-example'
import { Array, Option } from 'effect'
import { StrictMode } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { App, type Presenter } from './App.js'
import { useNavigationHistory } from './view.js'

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
  render(
    <StrictMode>
      <App initialDestinationUri="/counters" presenter={presenter} />
    </StrictMode>,
  )
}

const CarrierProbe = () => {
  const actions = useMultipleCountersActions()
  const model = useMultipleCountersModel()
  const replay = useMultipleCountersReplay()
  const maybeResolutionError = useMultipleCountersResolutionError()
  useNavigationHistory(model)
  const openedNavigationCount = Array.length(
    Array.filter(
      replay.transitions,
      transition => transition.message._tag === 'OpenedNavigation',
    ),
  )
  return (
    <>
      <output aria-label="Current destination">
        {navigationToPath(model.navigation)}
      </output>
      <output aria-label="Opened navigation count">
        {openedNavigationCount}
      </output>
      <output aria-label="Client resolution error">
        {Option.isSome(maybeResolutionError)
          ? maybeResolutionError.value._tag
          : ''}
      </output>
      <button onClick={() => actions.selectedCounter('counter-1')}>
        Open counter through probe
      </button>
      <button onClick={() => actions.clickedAddCounter()}>
        Attempt unavailable add
      </button>
      <button onClick={() => replay.seek(1)}>Inspect boot frame</button>
    </>
  )
}

const renderCarrier = (initialDestinationUri: string) => {
  window.history.replaceState({}, '', initialDestinationUri)
  render(
    <StrictMode>
      <MultipleCountersClient.Provider
        initialDestinationUri={initialDestinationUri}
      >
        <CarrierProbe />
      </MultipleCountersClient.Provider>
    </StrictMode>,
  )
}

const openFirstCounter = async () => {
  const counterButton = await screen.findByRole('button', {
    name: 'counter-1',
  })
  fireEvent.click(counterButton)
  await screen.findByText('← Back to counters')
}

describe('Multiple Counters React presenters', () => {
  it.each([
    '/counters',
    '/counters/counter-1',
    '/counters/counter-1/fact',
    '/counters/counter-1/delete',
  ])(
    'boots %s from the canonical list with exactly one navigation Message',
    async destinationUri => {
      renderCarrier(destinationUri)

      expect(
        (await screen.findByLabelText('Current destination')).textContent,
      ).toBe(destinationUri)
      expect(screen.getByLabelText('Opened navigation count').textContent).toBe(
        '1',
      )
    },
  )

  it('resolves one browser history carrier into one additional navigation Message', async () => {
    renderCarrier('/counters')
    await screen.findByText('/counters')

    window.history.pushState({}, '', '/counters/counter-1/delete')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(await screen.findByText('/counters/counter-1/delete')).toBeTruthy()
    expect(screen.getByLabelText('Opened navigation count').textContent).toBe(
      '2',
    )
  })

  it('rejects an invalid boot carrier without journaling or rewriting it', async () => {
    renderCarrier('/missing')

    expect(
      (await screen.findByLabelText('Client resolution error')).textContent,
    ).toBe('InvalidNavigationCarrierUriError')
    expect(screen.getByLabelText('Current destination').textContent).toBe(
      '/counters',
    )
    expect(screen.getByLabelText('Opened navigation count').textContent).toBe(
      '0',
    )
    expect(window.location.pathname).toBe('/missing')
  })

  it('rejects an invalid popstate carrier without adding a Message', async () => {
    renderCarrier('/counters')
    await screen.findByText('/counters')

    window.history.pushState({}, '', '/missing')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => {
      expect(screen.getByLabelText('Client resolution error').textContent).toBe(
        'InvalidNavigationCarrierUriError',
      )
    })
    expect(screen.getByLabelText('Opened navigation count').textContent).toBe(
      '1',
    )
    expect(window.location.pathname).toBe('/missing')
  })

  it('projects replay navigation after an unrelated interaction failure', async () => {
    renderCarrier('/counters')
    await screen.findByText('/counters')

    fireEvent.click(
      screen.getByRole('button', { name: 'Open counter through probe' }),
    )
    await screen.findByText('/counters/counter-1')
    expect(window.location.pathname).toBe('/counters/counter-1')

    fireEvent.click(
      screen.getByRole('button', { name: 'Attempt unavailable add' }),
    )
    expect(
      (await screen.findByLabelText('Client resolution error')).textContent,
    ).toBe('MissingMultipleCountersClientActionError')

    fireEvent.click(screen.getByRole('button', { name: 'Inspect boot frame' }))
    await screen.findByText('/counters')
    expect(window.location.pathname).toBe('/counters')
  })

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
