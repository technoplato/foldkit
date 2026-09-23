import { Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { bindCounter } from '../test/apps/catalogCounter.js'
import {
  paintProgram,
  programCliSurface,
  programUsage,
  runProgramCommand,
} from './program.js'

const countOf = (bound: ReturnType<typeof bindCounter>): number =>
  bound.readModel().count

describe('paintProgram', () => {
  it('paints status, the screen, and every Action with its CLI word', () => {
    const text = paintProgram(bindCounter())
    expect(text).toContain('ready')
    expect(text).toContain('[ + ] [ Reset ]')
    expect(text).toContain('  increment   [+]     Increments the count by one')
    expect(text).toContain(
      '  reset       [r]     Sets the count to 0  (disabled: count is already 0)',
    )
    expect(text).not.toContain('Action menu')
  })

  it('paints the presented menu with its query and highlighted row', () => {
    const bound = bindCounter(2)
    bound.openMenu()
    bound.typeInMenu('res')
    expect(paintProgram(bound)).toContain(
      [
        'Action menu  query "res"  filter focused',
        '  > reset       Sets the count to 0',
      ].join('\n'),
    )
  })
})

describe('runProgramCommand', () => {
  it('runs an Action by its CLI word, bare or after do', () => {
    const bound = bindCounter()
    expect(runProgramCommand(bound, 'counter', ['increment'], {})).toEqual({
      stdout: paintProgram(bound),
      exitCode: 0,
    })
    runProgramCommand(bound, 'counter', ['do', 'increment'], {})
    expect(countOf(bound)).toBe(2)
  })

  it('refuses a Disabled Action with exit code 1 and its sentence', () => {
    const bound = bindCounter()
    const result = runProgramCommand(bound, 'counter', ['reset'], {})
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('reset is disabled: count is already 0.')
  })

  it('rejects an unknown command with exit code 2 and the real ones', () => {
    const result = runProgramCommand(bindCounter(), 'counter', ['explode'], {})
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toBe(
      'Unknown command "explode". Try one of: increment, reset.',
    )
  })

  it('chooses from the menu, which sends the Action and closes the menu', () => {
    const bound = bindCounter(3)
    const result = runProgramCommand(
      bound,
      'counter',
      ['menu', 'choose', 'reset'],
      {},
    )
    expect(result.exitCode).toBe(0)
    expect(countOf(bound)).toBe(0)
    expect(Option.isNone(bound.menu())).toBe(true)
  })

  it('moves menu focus and rejects an unknown menu verb', () => {
    const bound = bindCounter()
    runProgramCommand(bound, 'counter', ['menu', 'open'], {})
    runProgramCommand(bound, 'counter', ['menu', 'next'], {})
    expect(Option.map(bound.menu(), menu => menu.isFilterFocused)).toEqual(
      Option.some(false),
    )
    const result = runProgramCommand(bound, 'counter', ['menu', 'spin'], {})
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toBe('Unknown menu verb "spin".')
  })

  it('presses a raw key with modifier flags', () => {
    const bound = bindCounter()
    runProgramCommand(bound, 'counter', ['key', 'k'], { meta: '1' })
    expect(Option.isSome(bound.menu())).toBe(true)
  })

  it('prints usage derived from the Catalog', () => {
    const bound = bindCounter()
    const help = runProgramCommand(bound, 'counter', ['help'], {})
    expect(help.stdout).toBe(programUsage(bound, 'counter'))
    expect(help.stdout).toContain(
      '  increment          Increments the count by one',
    )
    expect(help.stdout).toContain('  menu choose <cmd>  ')
  })
})

describe('programCliSurface', () => {
  it('splits the daemon token into words', () => {
    const bound = bindCounter()
    const runWords = Option.getOrThrow(
      Option.fromNullishOr(programCliSurface(bound, 'counter').do),
    )
    const result = Effect.runSync(runWords('menu  type  re', {}))
    expect(result.exitCode).toBe(0)
    expect(Option.map(bound.menu(), menu => menu.query)).toEqual(
      Option.some('re'),
    )
  })
})
