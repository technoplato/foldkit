import { Effect } from 'effect'
import {
  GuessedYes,
  demoModel,
  emptyModel,
  makeMemorySnapshotLogTransport,
  update,
  uriOf,
} from 'puzzle-core-example'
import { describe, expect, it } from 'vitest'

import { executeScreenDo, executeScreenShow } from './screenHost.js'

process.env['PUZZLE_TAPE'] = 'memory'

const [afterYes] = update(emptyModel(), GuessedYes())

describe('Puzzle screen-window CLI host', () => {
  it('paints the screen and usage with reset on the demo tape', async () => {
    const execution = await Effect.runPromise(executeScreenShow())

    expect(execution.finalModel).toEqual(demoModel())
    expect(execution.stdout).toContain(uriOf(demoModel()))
    expect(execution.stdout).not.toContain('Foldkit - CLI screen Puzzle')
    expect(execution.stdout).toContain('[reset]')
    expect(execution.stdout).toContain('https://puzzle.knophy.com')
    expect(execution.stdout).toContain('https://replicate.knophy.com')
    expect(execution.stdout).toContain('https://grok.knophy.com')
    expect(execution.stdout).toContain('https://puzzle.knophy.com/replicate.sh')
    expect(execution.stdout).toContain('commands')
    expect(execution.stdout).toContain('Clears the tape')
    expect(execution.stdout).toContain('run: puzzle-screen <command>')
    expect(execution.stdout).not.toContain('[yes]')
    expect(execution.stdout).not.toContain('github.com')
  })

  it('taps reset from argv and paints the empty screen', async () => {
    const execution = await Effect.runPromise(executeScreenDo('reset'))

    expect(execution.finalModel).toEqual(emptyModel())
    expect(execution.stdout).toContain('sent reset')
    expect(execution.stdout).toContain(uriOf(emptyModel()))
    expect(execution.stdout).toContain(
      '[yes] [no] [hint] [operator] [replicate]',
    )
    expect(execution.stdout).not.toContain('[reset]')
  })

  it('grows and shrinks the vocabulary across a shared tape', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())

    const first = await Effect.runPromise(
      executeScreenDo('reset', { snapshot }),
    )
    expect(first.finalModel).toEqual(emptyModel())
    expect(first.stdout).toContain('[yes]')

    const second = await Effect.runPromise(executeScreenDo('yes', { snapshot }))
    expect(second.finalModel).toEqual(afterYes)
    expect(second.stdout).toContain('sent yes')
    expect(second.stdout).toContain('[reset]')
    expect(second.stdout).toContain(uriOf(afterYes))
  })

  it('refuses reset on an empty tape with the hiddenBecause sentence', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    await Effect.runPromise(executeScreenDo('reset', { snapshot }))
    const error = await Effect.runPromise(
      executeScreenDo('reset', { snapshot }).pipe(Effect.flip),
    )

    expect(error.message).toContain('"reset" is hidden: tape is already empty')
    expect(error.message).toContain('commands')
    expect(error.message).not.toContain('  reset')
  })

  it('rejects a token that is not part of the Program', async () => {
    const error = await Effect.runPromise(
      executeScreenDo('explode').pipe(Effect.flip),
    )

    expect(error.message).toContain('Unknown command "explode"')
    expect(error.message).toContain('run: puzzle-screen <command>')
  })
})
