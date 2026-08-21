import { Model, makeMemorySnapshotLogTransport } from 'counter-core-example'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { executeScreenDo, executeScreenShow } from './screenHost.js'

process.env['COUNTER_TAPE'] = 'memory'

describe('Counter screen-window CLI host', () => {
  it('paints the screen and usage without reset at 0', async () => {
    const execution = await Effect.runPromise(executeScreenShow())

    expect(execution.finalModel).toEqual(Model.make({ count: 0 }))
    expect(execution.stdout).toContain('Foldkit - CLI screen Counter')
    expect(execution.stdout).toContain(
      'all business logic and sync logic are written in Foldkit; consumed and rendered by CLI.',
    )
    expect(execution.stdout).toContain('0\n[increment] [decrement]')
    expect(execution.stdout).toContain('commands')
    expect(execution.stdout).toContain('Increments the count by one')
    expect(execution.stdout).toContain('run: counter-screen <command>')
    expect(execution.stdout).not.toContain('reset')
  })

  it('taps increment from argv and paints the next screen', async () => {
    const execution = await Effect.runPromise(executeScreenDo('increment'))

    expect(execution.finalModel).toEqual(Model.make({ count: 1 }))
    expect(execution.stdout).toContain('sent increment')
    expect(execution.stdout).toContain('1\n[increment] [decrement] [reset]')
    expect(execution.stdout).toContain('Sets the count to 0')
  })

  it('grows and shrinks the vocabulary across a shared tape', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())

    const first = await Effect.runPromise(
      executeScreenDo('increment', { snapshot }),
    )
    expect(first.finalModel).toEqual(Model.make({ count: 1 }))
    expect(first.stdout).toContain('[reset]')

    const second = await Effect.runPromise(
      executeScreenDo('reset', { snapshot }),
    )
    expect(second.finalModel).toEqual(Model.make({ count: 0 }))
    expect(second.stdout).toContain('sent reset')
    expect(second.stdout).toContain('0\n[increment] [decrement]')
    expect(second.stdout).not.toContain('[reset]')
  })

  it('refuses reset at 0 with the hiddenBecause sentence', async () => {
    const error = await Effect.runPromise(
      executeScreenDo('reset').pipe(Effect.flip),
    )

    expect(error.message).toContain('"reset" is hidden: count is already 0')
    expect(error.message).toContain('commands')
    expect(error.message).not.toContain('  reset')
  })

  it('rejects a token that is not part of the Program', async () => {
    const error = await Effect.runPromise(
      executeScreenDo('explode').pipe(Effect.flip),
    )

    expect(error.message).toContain('Unknown command "explode"')
    expect(error.message).toContain('run: counter-screen <command>')
  })
})
