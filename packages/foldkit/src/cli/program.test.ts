import { Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { Cli } from '../processor/host.js'
import { bindCounter } from '../test/apps/catalogCounter.js'
import { bindApp, uriOf } from '../test/apps/navigableCounter.js'
import { terminalWidth } from './layout.js'
import {
  paintCommands,
  paintProgram,
  programUsage,
  runProgramCommand,
} from './program.js'
import { programCliSurface } from './surface.js'

const countOf = (bound: ReturnType<typeof bindCounter>): number =>
  bound.readModel().count

describe('paintProgram', () => {
  it('paints status, the screen, and every Action with its CLI word', () => {
    const text = paintProgram(bindCounter())
    expect(text).toContain('ready')
    expect(text).toContain('[ + ] [ Reset ]')
    expect(text).toMatch(/^ {2}increment +\+ +Increments the count by one$/m)
    expect(text).toMatch(/^ {2}reset +r +Sets the count to 0$/m)
    expect(text).toMatch(/^ +Unavailable: count is already 0$/m)
    expect(text).not.toContain('Search actions')
    expect(text).not.toContain('$ counter')
    expect(text.split('\n').every(line => line.length <= terminalWidth)).toBe(
      true,
    )
  })

  it('shows how to run each Action when it knows the CLI name', () => {
    const text = paintProgram(bindCounter(), 'counter')
    expect(text).toMatch(/^ +\$ counter increment$/m)
    expect(text).toMatch(/^ +\$ counter reset$/m)
  })

  it('paints the presented menu with its query and highlighted row', () => {
    const bound = bindCounter(2)
    bound.openMenu()
    bound.typeInMenu('res')
    const painted = paintProgram(bound)
    expect(painted).toContain('Actions  Search actions: "res"')
    expect(painted).toMatch(/ {2}> Reset +r +Sets the count to 0/)
    expect(painted).toContain('[↑↓] move  [↵] run  [esc] close')
  })
})

describe('runProgramCommand', () => {
  it('runs an Action by its CLI word, bare or after do', () => {
    const bound = bindCounter()
    expect(runProgramCommand(bound, 'counter', ['increment'], {})).toEqual({
      stdout: paintProgram(bound, 'counter'),
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
    expect(help.stdout).toMatch(
      /^ {2}increment +\+ +Increments the count by one$/m,
    )
    expect(help.stdout).toMatch(/^ {2}menu choose <cmd> +Choose one Action/m)
    expect(help.stdout).toMatch(/^ +\$ counter menu choose increment$/m)
    expect(
      help.stdout.split('\n').every(line => line.length <= terminalWidth),
    ).toBe(true)
  })
})

describe('paintCommands', () => {
  it('lists the presses that run now, then the host commands, one per line', () => {
    expect(
      paintCommands(
        bindCounter(),
        'counter',
        ['Increment', 'Reset', 'Explode'],
        [{ command: 'tui', what: 'Opens the count in this terminal' }],
      ),
    ).toEqual([
      '  counter increment  Increments the count by one',
      '  counter tui        Opens the count in this terminal',
    ])
  })

  it('puts what a long command does on the next line, under the column', () => {
    expect(
      paintCommands(
        bindCounter(),
        'counter',
        ['Increment'],
        [{ command: 'listen-to-twenty-one-lessons', what: 'Plays it' }],
      ),
    ).toEqual([
      '  counter increment             Increments the count by one',
      '  counter listen-to-twenty-one-lessons',
      '                                Plays it',
    ])
  })
})

describe('programCliSurface', () => {
  it('splits the daemon token into words', () => {
    const bound = bindCounter()
    const runWords = Option.getOrThrow(
      Option.fromNullishOr(programCliSurface(bound, 'counter').do),
    )
    const result = Effect.runSync(runWords('menu  type  re', {}, Cli()))
    expect(result.exitCode).toBe(0)
    expect(Option.map(bound.menu(), menu => menu.query)).toEqual(
      Option.some('re'),
    )
  })
})

describe('navigation commands', () => {
  it('paints where the Program is and the screen there', () => {
    const bound = bindApp()
    const opened = runProgramCommand(
      bound,
      'counter',
      ['open', '/counter/session'],
      {},
    )
    expect(opened.exitCode).toBe(0)
    expect(opened.stdout).toContain('at /counter/session')
    expect(opened.stdout).toContain('Every device shows the same screen.')
  })

  it('paints the menu over the screen beneath it', () => {
    const bound = bindApp()
    runProgramCommand(bound, 'counter', ['open', '/counter/menu?menu.q=re'], {})
    const text = paintProgram(bound)
    expect(text).toContain('at /counter/menu?menu.q=re')
    expect(text).toMatch(/ {2}> Reset +r +Sets the count to 0/)
    expect(text.indexOf('Search actions')).toBeLessThan(
      text.lastIndexOf('Actions'),
    )
  })

  it('goes back one screen and refuses at the first', () => {
    const bound = bindApp()
    runProgramCommand(bound, 'counter', ['open', '/counter/session'], {})
    expect(runProgramCommand(bound, 'counter', ['back'], {}).exitCode).toBe(0)
    expect(uriOf(bound)).toBe('/counter')
    const refused = runProgramCommand(bound, 'counter', ['back'], {})
    expect(refused.exitCode).toBe(1)
    expect(refused.stderr).toBe('Already at the first screen.')
  })

  it('refuses open without a URI', () => {
    const refused = runProgramCommand(bindApp(), 'counter', ['open'], {})
    expect(refused.exitCode).toBe(2)
    expect(refused.stderr).toBe('open needs a URI.')
  })

  it('prints the current URI', () => {
    const bound = bindApp()
    bound.press('OpenSessionSettings')
    expect(runProgramCommand(bound, 'counter', ['where'], {}).stdout).toBe(
      '/counter/session',
    )
  })
})
