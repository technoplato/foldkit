import {
  type Model,
  MultipleCountersProgram,
  navigationToPath,
} from 'counters-core-example'
import {
  type CountersWindowTape,
  startCountersWindowRuntime,
} from 'counters-instant-example'
import {
  MultipleCountersClient,
  useMultipleCountersActions,
  useMultipleCountersModel,
  useMultipleCountersReplay,
  useMultipleCountersResolutionError,
} from 'counters-react-bindings-example'
import { Array, Option } from 'effect'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { App } from './App.js'
import { installCountersWindowRuntime } from './instantHost.js'
import { useNavigationHistory } from './view.js'

const [initialModel] = MultipleCountersProgram.init()

const missingAppIdError =
  'VITE_INSTANT_APP_ID is missing. Start through the Instant demo wrapper.'

const memoryTape = (start: Model = initialModel): CountersWindowTape => {
  let model = start
  const listeners = new Set<(next: Model) => void>()
  return {
    readModel: () => model,
    send: message => {
      const [next] = MultipleCountersProgram.update(model, message)
      model = next
      listeners.forEach(listener => {
        listener(model)
      })
    },
    stop: () => {
      listeners.clear()
    },
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

let windowRuntime: ReturnType<typeof startCountersWindowRuntime> | undefined

afterEach(() => {
  cleanup()
  windowRuntime?.stop()
  windowRuntime = undefined
  window.history.replaceState({}, '', '/counters')
})

const renderApp = () => {
  render(
    <StrictMode>
      <App initialDestinationUri="/counters" />
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

  it('React-A draws FailedWindow from useModel, not a local modal', async () => {
    windowRuntime = startCountersWindowRuntime({
      openTape: () => Promise.reject(new Error(missingAppIdError)),
      signIn: () =>
        Promise.resolve({
          _tag: 'FailedCountersSession',
          error: missingAppIdError,
        }),
    })
    installCountersWindowRuntime(windowRuntime)
    renderApp()

    expect(await screen.findByText(missingAppIdError)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('React-A | unified modal')).toBeNull()
    expect(screen.queryByText('Starting Instant Multiple Counters…')).toBeNull()
  })

  it('React-B draws Starting then Ready from useModel, not a native dialog', async () => {
    let finishSignIn: (
      session:
        | { readonly _tag: 'SignedInCountersSession'; readonly userId: string }
        | { readonly _tag: 'FailedCountersSession'; readonly error: string },
    ) => void = () => undefined
    windowRuntime = startCountersWindowRuntime({
      openTape: () => Promise.resolve(memoryTape()),
      signIn: () =>
        new Promise(resolve => {
          finishSignIn = resolve
        }),
    })
    installCountersWindowRuntime(windowRuntime)
    renderApp()

    expect(
      await screen.findByText('Starting Instant Multiple Counters…'),
    ).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Delete counter-1?')).toBeNull()

    finishSignIn({
      _tag: 'SignedInCountersSession',
      userId: 'user-1',
    })

    expect(await screen.findByText('Multiple counters')).toBeTruthy()
    expect(screen.getByRole('button', { name: /counter-1/ })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Inspecting')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /counter-1/ }))
    expect(await screen.findByRole('button', { name: '+' })).toBeTruthy()
    expect(screen.queryByText('Multiple counters')).toBeNull()
    expect(screen.getByText('counter-1')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
