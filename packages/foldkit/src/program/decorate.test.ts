import { describe, expect, it, vi } from 'vitest'

import { decorate, type ProgramDecorator } from './decorate.js'
import { mapCommands } from './decorate.js'
import { onUpdate } from './decorate.js'
import { renamed } from './decorate.js'
import { Program, type ProgramCommand } from './program.js'

// FIXTURE

interface TestModel {
  readonly count: number
}

type TestMessage =
  | Readonly<{ _tag: 'Add'; readonly amount: number }>
  | Readonly<{ _tag: 'Reset' }>

const makeProgram = (): Program<TestModel, TestMessage> => ({
  id: 'test-counter',
  version: 1,
  Model: {} as Program<TestModel, TestMessage>['Model'],
  Message: {} as Program<TestModel, TestMessage>['Message'],
  init: () => [{ count: 0 }, []],
  update: (model, message) => {
    if (message._tag === 'Add') {
      return [{ count: model.count + message.amount }, []]
    }
    return [{ count: 0 }, []]
  },
})

// DECORATION LAWS

describe('renamed', () => {
  it('changes identity and nothing else', () => {
    const original = makeProgram()
    const decorated = renamed<TestModel, TestMessage>('hosted-instance-7')(original)
    expect(decorated.id).toBe('hosted-instance-7')
    expect(decorated.version).toBe(original.version)
    // Identity-only decoration preserves the update reference:
    // Behavior is untouched:
    expect(decorated.update({ count: 2 }, { _tag: 'Add', amount: 3 })).toEqual([
      { count: 5 },
      [],
    ])
  })
})

describe('onUpdate', () => {
  it('observes each transition with before, message, and after', () => {
    const transitions: Array<{
      readonly from: number
      readonly tag: string
      readonly to: number
    }> = []
    const program = onUpdate<TestModel, TestMessage>(
      ({ model, message, nextModel }) => {
        transitions.push({
          from: model.count,
          tag: message._tag,
          to: nextModel.count,
        })
      },
    )(makeProgram())

    program.update({ count: 4 }, { _tag: 'Add', amount: 1 })

    expect(transitions).toEqual([{ from: 4, tag: 'Add', to: 5 }])
  })

  it('never changes the transition result', () => {
    const observer = vi.fn()
    const decorated = onUpdate<TestModel, TestMessage>(observer)(makeProgram())
    expect(decorated.update({ count: 1 }, { _tag: 'Reset' })).toEqual([
      { count: 0 },
      [],
    ])
    expect(observer).toHaveBeenCalledTimes(1)
  })
})

describe('mapCommands', () => {
  it('adjusts commands while leaving the Model transition alone', () => {
    const command: ProgramCommand<TestMessage> = {
      name: 'log',
      effect: undefined as never,
    }
    const decorated = mapCommands<TestModel, TestMessage>((commands: ReadonlyArray<ProgramCommand<TestMessage>>) => [
      ...commands,
      command,
    ])(makeProgram())

    const [, commands] = decorated.update({ count: 9 }, { _tag: 'Reset' })
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('log')
  })
})

describe('decorate', () => {
  it('applies decorators left to right', () => {
    const calls: Array<string> = []
    const track =
      (name: string): ProgramDecorator<TestModel, TestMessage> =>
      program => {
        calls.push(name)
        return program
      }

    const decorated = decorate(makeProgram(), track('first'), track('second'))
    expect(calls).toEqual(['first', 'second'])
    expect(decorated.id).toBe('test-counter')
  })

  it('composes observation over renaming coherently', () => {
    const seen: Array<string> = []
    const decorated = decorate(
      makeProgram(),
      renamed('multi:counter-a'),
      onUpdate(({ message }) => seen.push(message._tag)),
    )

    decorated.update({ count: 0 }, { _tag: 'Reset' })
    expect(seen).toEqual(['Reset'])
    expect(decorated.id).toBe('multi:counter-a')
  })
})
