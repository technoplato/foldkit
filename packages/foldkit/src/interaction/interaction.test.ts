import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Interaction from './interaction.js'

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'The person wants a higher count',
  meta: { label: '+', keys: ['+', '='] },
})

const Reset = Catalog.action('Reset', {
  what: 'Sets the count to 0',
  why: 'The person wants to start over',
  enabled: (model: Model) =>
    model.count === 0
      ? Catalog.Disabled({ because: 'count is already 0' })
      : Catalog.Enabled(),
  meta: { label: 'Reset', keys: ['r'] },
})

const interaction = Interaction.fromCatalog(Catalog.make([Increment, Reset]))

describe('Interaction.fromCatalog', () => {
  it('is always Ready and has no menu', () => {
    expect(interaction.status({ count: 0 })).toEqual(Interaction.Ready())
    expect(interaction.menu({ count: 0 })).toEqual(Option.none())
    expect(interaction.openMenu({ count: 0 })).toEqual([])
  })

  it('presses Enabled Actions and refuses Disabled ones', () => {
    expect(interaction.press({ count: 0 }, 'Increment')).toEqual([Increment()])
    expect(interaction.press({ count: 0 }, 'Reset')).toEqual([])
    expect(interaction.press({ count: 2 }, 'Reset')).toEqual([Reset()])
  })

  it('maps declared keys and ignores chords', () => {
    expect(
      interaction.pressKey({ count: 0 }, Interaction.keyInput('=')),
    ).toEqual([Increment()])
    expect(
      interaction.pressKey(
        { count: 0 },
        Interaction.keyInput('r', { isControl: true }),
      ),
    ).toEqual([])
    expect(
      interaction.pressKey({ count: 0 }, Interaction.keyInput('x')),
    ).toEqual([])
  })
})

describe('Interaction.normalizeKey', () => {
  it('translates terminal names to browser spelling', () => {
    expect(Interaction.normalizeKey('return')).toBe('Enter')
    expect(Interaction.normalizeKey('\r')).toBe('Enter')
    expect(Interaction.normalizeKey('up')).toBe('ArrowUp')
    expect(Interaction.normalizeKey('escape')).toBe('Escape')
    expect(Interaction.normalizeKey('+')).toBe('+')
  })
})

describe('menu opener', () => {
  const menuKeys = [
    Interaction.keyInput('?'),
    Interaction.keyInput('k', { isMeta: true }),
    Interaction.keyInput('k', { isControl: true }),
  ]
  const withMenu = { menuTitle: Option.some('Actions'), menuKeys }

  it('labels the opener with the shortcut each platform uses', () => {
    expect(
      Option.map(Interaction.menuOpenerOf(withMenu, 'Mac'), o => o.label),
    ).toEqual(Option.some('Actions (⌘K)'))
    expect(
      Option.map(Interaction.menuOpenerOf(withMenu, 'Other'), o => o.label),
    ).toEqual(Option.some('Actions (Ctrl+K)'))
    expect(
      Option.map(Interaction.menuOpenerOf(withMenu, 'Touch'), o => o.label),
    ).toEqual(Option.some('Actions'))
    expect(Interaction.menuOpenerOf(interaction, 'Mac')).toEqual(Option.none())
  })

  it('reads the key platform a browser reports', () => {
    expect(
      Interaction.keyPlatformOf({ platform: 'MacIntel', maxTouchPoints: 0 }),
    ).toBe('Mac')
    expect(
      Interaction.keyPlatformOf({ platform: 'Win32', userAgent: 'Windows' }),
    ).toBe('Other')
    expect(
      Interaction.keyPlatformOf({
        platform: 'Linux armv8l',
        userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile',
        maxTouchPoints: 5,
      }),
    ).toBe('Touch')
  })
})

describe('terminalKeyInput', () => {
  const press = (
    sequence: string,
    name: string,
    modifiers: Partial<Readonly<{ isControl: boolean; isShift: boolean }>> = {},
  ) =>
    Interaction.terminalKeyInput({
      sequence,
      name,
      isMeta: false,
      isControl: modifiers.isControl ?? false,
      isShift: modifiers.isShift ?? false,
    }).key

  it('reads the typed character, else the key name', () => {
    expect(press('J', 'j', { isShift: true })).toBe('J')
    expect(press('\u000b', 'k', { isControl: true })).toBe('k')
    expect(press('\u001b[A', 'up')).toBe('ArrowUp')
    expect(press('\r', 'return')).toBe('Enter')
  })
})

describe('hintLineOf', () => {
  it('prints the hints as one terminal line', () => {
    expect(
      Interaction.hintLineOf([
        { keys: ['↑', '↓'], does: 'move' },
        { keys: ['esc'], does: 'close' },
      ]),
    ).toBe('[↑↓] move  [esc] close')
  })
})

describe('isBrowserOwnedChord', () => {
  it('leaves zoom, reload, and tabs to the browser, and takes ⌘K', () => {
    expect(
      Interaction.isBrowserOwnedChord(
        Interaction.keyInput('-', { isMeta: true }),
      ),
    ).toBe(true)
    expect(
      Interaction.isBrowserOwnedChord(
        Interaction.keyInput('=', { isMeta: true }),
      ),
    ).toBe(true)
    expect(
      Interaction.isBrowserOwnedChord(
        Interaction.keyInput('R', { isControl: true }),
      ),
    ).toBe(true)
    expect(
      Interaction.isBrowserOwnedChord(
        Interaction.keyInput('k', { isMeta: true }),
      ),
    ).toBe(false)
    expect(
      Interaction.isBrowserOwnedChord(
        Interaction.keyInput('3', { isMeta: true }),
      ),
    ).toBe(false)
    expect(Interaction.isBrowserOwnedChord(Interaction.keyInput('-'))).toBe(
      false,
    )
  })
})

describe('isHostOwnedKey', () => {
  const command = (key: string) => Interaction.keyInput(key, { isMeta: true })
  const control = (key: string) =>
    Interaction.keyInput(key, { isControl: true })

  it('a browser on a Mac owns ⌘1 to ⌘9, which switch its tabs', () => {
    expect(Interaction.isHostOwnedKey('Browser', 'Mac', command('1'))).toBe(
      true,
    )
    expect(Interaction.isHostOwnedKey('Browser', 'Mac', command('9'))).toBe(
      true,
    )
    expect(Interaction.isHostOwnedKey('Browser', 'Mac', control('2'))).toBe(
      false,
    )
  })

  it('a browser off a Mac owns Ctrl+1 to Ctrl+9', () => {
    expect(Interaction.isHostOwnedKey('Browser', 'Other', control('2'))).toBe(
      true,
    )
  })

  it('a browser owns its own chords, such as reload, and leaves ⌘K and plain keys', () => {
    expect(Interaction.isHostOwnedKey('Browser', 'Mac', command('r'))).toBe(
      true,
    )
    expect(Interaction.isHostOwnedKey('Browser', 'Mac', command('k'))).toBe(
      false,
    )
    expect(
      Interaction.isHostOwnedKey('Browser', 'Mac', Interaction.keyInput('p')),
    ).toBe(false)
    expect(
      Interaction.isHostOwnedKey('Browser', 'Mac', Interaction.keyInput('2')),
    ).toBe(false)
  })

  it('a native window owns nothing', () => {
    expect(Interaction.isHostOwnedKey('Native', 'Mac', command('2'))).toBe(
      false,
    )
    expect(Interaction.isHostOwnedKey('Native', 'Mac', command('r'))).toBe(
      false,
    )
  })

  it('a terminal never passes Command on', () => {
    expect(Interaction.isHostOwnedKey('Terminal', 'Mac', command('k'))).toBe(
      true,
    )
    expect(Interaction.isHostOwnedKey('Terminal', 'Mac', control('k'))).toBe(
      false,
    )
  })
})

describe('pickShortcutOf', () => {
  it('reads a row number with the first chord the host leaves to the Program', () => {
    expect(Interaction.pickShortcutOf(3, 'Mac', 'Native')).toEqual(
      Option.some('⌘3'),
    )
    expect(Interaction.pickShortcutOf(3, 'Mac', 'Browser')).toEqual(
      Option.some('⌃3'),
    )
    expect(Interaction.pickShortcutOf(3, 'Other', 'Native')).toEqual(
      Option.some('Ctrl+3'),
    )
  })

  it('shows no number where the host owns every chord for it, or there are no keys', () => {
    expect(Interaction.pickShortcutOf(3, 'Other', 'Browser')).toEqual(
      Option.none(),
    )
    expect(Interaction.pickShortcutOf(3, 'Touch', 'Browser')).toEqual(
      Option.none(),
    )
  })
})

describe('shortcutsOf', () => {
  it('reads the keys an Action declares as the platform writes them', () => {
    expect(Interaction.shortcutsOf(['p', 'k'], 'Mac', 'Browser')).toEqual([
      'p',
      'k',
    ])
    expect(Interaction.shortcutsOf(['Escape', ' '], 'Mac', 'Browser')).toEqual(
      ['esc', 'space'],
    )
    expect(Interaction.shortcutsOf(['['], 'Other', 'Browser')).toEqual(['['])
  })

  it('shows no keys on a touch screen', () => {
    expect(Interaction.shortcutsOf(['p'], 'Touch', 'Browser')).toEqual([])
  })
})
