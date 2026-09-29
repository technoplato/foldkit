import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type KeyPress,
  type ShortcutContext,
  shortcutFor,
  shortcutKeyOf,
} from './keyboard.js'

const everything: ShortcutContext = {
  isPlaybackReady: true,
  isRecordAvailable: true,
  isCapturing: true,
  isAwayFromFollowed: true,
  isRecordingOpen: true,
  isFullScreen: true,
  isSearchAvailable: true,
  isDialogOpen: false,
}

const nothing: ShortcutContext = {
  isPlaybackReady: false,
  isRecordAvailable: false,
  isCapturing: false,
  isAwayFromFollowed: false,
  isRecordingOpen: false,
  isFullScreen: false,
  isSearchAvailable: false,
  isDialogOpen: false,
}

const press = (key: string, overrides: Partial<KeyPress> = {}): KeyPress => ({
  key,
  target: 'Page',
  isModified: false,
  isRepeat: false,
  ...overrides,
})

describe('keyboard shortcuts', () => {
  it('maps each key to its shortcut where the page offers it', () => {
    expect(shortcutFor(everything, press(' '))).toEqual(
      Option.some('TogglePlayback'),
    )
    expect(shortcutFor(everything, press('ArrowLeft'))).toEqual(
      Option.some('SkipBackward'),
    )
    expect(shortcutFor(everything, press('ArrowRight'))).toEqual(
      Option.some('SkipForward'),
    )
    expect(shortcutFor(everything, press('r'))).toEqual(
      Option.some('NewRecording'),
    )
    expect(shortcutFor(everything, press('P'))).toEqual(
      Option.some('TogglePauseRecording'),
    )
    expect(shortcutFor(everything, press('l'))).toEqual(
      Option.some('ReturnToFollowed'),
    )
  })

  it('focuses the search with / where the list shows it', () => {
    expect(shortcutFor(everything, press('/'))).toEqual(
      Option.some('FocusSearch'),
    )
    expect(
      shortcutFor(everything, press('/', { target: 'TextEntry' })),
    ).toEqual(Option.none())
  })

  it('toggles Full Screen with F and leaves it with Escape', () => {
    expect(shortcutFor(everything, press('f'))).toEqual(
      Option.some('ToggleFullScreen'),
    )
    expect(shortcutFor(everything, press('Escape'))).toEqual(
      Option.some('ExitFullScreen'),
    )
    expect(
      shortcutFor(everything, press('Escape', { target: 'Control' })),
    ).toEqual(Option.none())
    expect(
      shortcutFor({ ...everything, isFullScreen: false }, press('Escape')),
    ).toEqual(Option.none())
  })

  it('offers nothing the page cannot do', () => {
    for (const key of [
      ' ',
      'ArrowLeft',
      'ArrowRight',
      'r',
      'p',
      'l',
      'f',
      'Escape',
      '/',
    ]) {
      expect(shortcutFor(nothing, press(key))).toEqual(Option.none())
    }
  })

  it('leaves typing, browser shortcuts, and open dialogs alone', () => {
    expect(
      shortcutFor(everything, press('r', { target: 'TextEntry' })),
    ).toEqual(Option.none())
    expect(
      shortcutFor(everything, press('ArrowLeft', { target: 'TextEntry' })),
    ).toEqual(Option.none())
    expect(shortcutFor(everything, press('r', { isModified: true }))).toEqual(
      Option.none(),
    )
    expect(
      shortcutFor({ ...everything, isDialogOpen: true }, press(' ')),
    ).toEqual(Option.none())
  })

  it('lets Space press a focused button, while arrows still skip', () => {
    expect(shortcutFor(everything, press(' ', { target: 'Control' }))).toEqual(
      Option.none(),
    )
    expect(
      shortcutFor(everything, press('ArrowRight', { target: 'Control' })),
    ).toEqual(Option.some('SkipForward'))
  })

  it('keeps skipping while an arrow is held, and acts once for other keys', () => {
    expect(
      shortcutFor(everything, press('ArrowRight', { isRepeat: true })),
    ).toEqual(Option.some('SkipForward'))
    expect(shortcutFor(everything, press(' ', { isRepeat: true }))).toEqual(
      Option.none(),
    )
    expect(shortcutFor(everything, press('r', { isRepeat: true }))).toEqual(
      Option.none(),
    )
  })

  it('names the key each shortcut answers', () => {
    expect(shortcutKeyOf('TogglePlayback')).toBe('Space')
    expect(shortcutKeyOf('ReturnToFollowed')).toBe('L')
  })
})
