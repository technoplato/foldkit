import { Program } from 'foldkit'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { cleanup, fireEvent, render } from '@testing-library/react'

import {
  type ProgramHandle,
  bindProgram,
  resetBoundPrograms,
} from '../programHandle/index.js'
import { ProgramKeyBindings } from './keyBindings.js'

type CountModel = Readonly<{ count: number }>
type Increment = Readonly<{ _tag: 'Increment' }>

declare module '../programHandle/programHandle.js' {
  interface BoundPrograms {
    readonly Keys: {
      readonly model: CountModel
      readonly message: Increment
      readonly actions: Readonly<{ incrementButtonTapped: () => void }>
    }
  }
}

const KeysPath = (): { readonly _tag: 'Keys' } => ({ _tag: 'Keys' })

const createFakeHandle = (): ProgramHandle<CountModel, Increment> & {
  sent: Array<Increment>
} => {
  const listeners = new Set<() => void>()
  let count = 0
  let snapshot: Program.SyncedModel<CountModel, Increment> = {
    _tag: 'Ready',
    count,
  }
  const sent: Array<Increment> = []
  return {
    sent,
    readModel: () => snapshot,
    send: message => {
      sent.push(message)
      count += 1
      snapshot = { _tag: 'Ready', count }
      for (const listener of listeners) {
        listener()
      }
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

afterEach(() => {
  resetBoundPrograms()
  cleanup()
})

describe('ProgramKeyBindings', () => {
  it('sends the bound key Message from one document listener', () => {
    const handle = createFakeHandle()
    bindProgram(KeysPath(), {
      createHandle: () => handle,
      toActions: () => ({
        incrementButtonTapped: () => {
          handle.send({ _tag: 'Increment' })
        },
      }),
      toScreen: () => ({ _tag: 'Text', content: '0' }),
      keyToMessage: input => {
        if (input.key === '+') {
          return { _tag: 'Increment' }
        }
        return undefined
      },
    })
    render(
      <ProgramKeyBindings path={KeysPath()}>
        <div>counter</div>
      </ProgramKeyBindings>,
    )
    fireEvent.keyDown(document, { key: '+' })
    expect(handle.sent).toEqual([{ _tag: 'Increment' }])
  })

  it('does not attach document keys on React Native', () => {
    const add = vi.spyOn(document, 'addEventListener')
    Object.defineProperty(navigator, 'product', {
      configurable: true,
      value: 'ReactNative',
    })
    const handle = createFakeHandle()
    bindProgram(KeysPath(), {
      createHandle: () => handle,
      toActions: () => ({
        incrementButtonTapped: () => undefined,
      }),
      toScreen: () => ({ _tag: 'Text', content: '0' }),
      keyToMessage: () => ({ _tag: 'Increment' }),
    })
    render(<ProgramKeyBindings path={KeysPath()} />)
    expect(add).not.toHaveBeenCalledWith('keydown', expect.any(Function))
    add.mockRestore()
    Object.defineProperty(navigator, 'product', {
      configurable: true,
      value: 'Gecko',
    })
  })
})
