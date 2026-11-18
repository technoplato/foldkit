import { Effect, Layer, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ObservedSystemContrast,
  SystemAppearance,
  contrastOfState,
  initialAppearance,
  systemContrastStream,
  update,
} from './appearance.js'
import { paintContrastOnPage } from './browser.js'
import {
  defaultTheme,
  roleColorsOf,
  themeStylesheet,
  withOwnRoles,
  withRoles,
} from './theme.js'

// A made-up theme whose quiet text and rule are stronger under More Contrast.
const contrasty = withRoles(defaultTheme, {
  QuietText: {
    light: '#6b7280',
    dark: '#9aa1aa',
    lightMore: '#374151',
    darkMore: '#e5e7eb',
  },
  Rule: { light: '#e5e7eb', dark: '#2a302d', lightMore: '#6b7280' },
})

describe('More Contrast, a third dimension of a theme', () => {
  it('gives a role its stronger color under More Contrast, and its usual one where it names none', () => {
    expect(roleColorsOf(contrasty, 'Light', 'More').QuietText).toBe('#374151')
    expect(roleColorsOf(contrasty, 'Dark', 'More').QuietText).toBe('#e5e7eb')
    expect(roleColorsOf(contrasty, 'Dark', 'More').Rule).toBe('#2a302d')
    expect(roleColorsOf(contrasty, 'Light', 'More').Text).toBe(
      defaultTheme.Text.light,
    )
    expect(roleColorsOf(contrasty, 'Light').QuietText).toBe('#6b7280')
    expect(roleColorsOf(contrasty, 'Light', 'Standard').QuietText).toBe(
      '#6b7280',
    )
  })

  it('declares only the roles that change, where the Program says the contrast is More, light and dark apart', () => {
    const sheet = themeStylesheet(
      contrasty,
      withOwnRoles({
        BadgeRecording: {
          light: '#b50012',
          dark: '#ffa198',
          lightMore: '#9e0010',
          darkMore: '#ffbdb6',
        },
      }),
    )
    const lightMore = sheet.slice(
      sheet.indexOf(
        ':where([data-fk-contrast="More"]:not([data-fk-mode="Dark"]))',
      ),
    )
    expect(lightMore).toContain('--fk-quiet-text: #374151;')
    expect(lightMore).toContain('--fk-rule: #6b7280;')
    expect(lightMore).toContain('--fk-own-badge-recording: #9e0010;')
    const darkMore = sheet.slice(
      sheet.indexOf(':where([data-fk-mode="Dark"][data-fk-contrast="More"])'),
    )
    expect(darkMore).toContain('--fk-quiet-text: #e5e7eb;')
    expect(darkMore).toContain('--fk-own-badge-recording: #ffbdb6;')
    expect(darkMore).not.toContain('--fk-rule:')
    expect(darkMore).not.toContain('--fk-text:')
    expect(sheet).not.toContain('prefers-contrast')
  })

  it('writes no contrast rules for a theme that names none', () => {
    const plain = withRoles(
      defaultTheme,
      Object.fromEntries(
        Object.entries(defaultTheme).map(([role, colors]) => [
          role,
          { light: colors.light, dark: colors.dark },
        ]),
      ),
    )
    expect(themeStylesheet(plain)).not.toContain('data-fk-contrast')
  })
})

describe('the contrast a Program is painted in, as state', () => {
  it('is Standard until the host says the system asks for more', () => {
    expect(contrastOfState(initialAppearance)).toBe('Standard')
    const more = update(
      initialAppearance,
      ObservedSystemContrast({ contrast: 'More' }),
    )
    expect(contrastOfState(more)).toBe('More')
    expect(more.appearance).toBe('System')
    expect(
      contrastOfState(
        update(more, ObservedSystemContrast({ contrast: 'Standard' })),
      ),
    ).toBe('Standard')
  })

  it('reads a state saved before contrast was a part of it as Standard', () => {
    expect(contrastOfState({ appearance: 'Dark', systemMode: 'Dark' })).toBe(
      'Standard',
    )
  })

  it('hears the system’s contrast from the host, as facts, and Standard from a host that gives none', async () => {
    const heard = await Effect.runPromise(
      Stream.runCollect(Stream.take(systemContrastStream, 2)).pipe(
        Effect.provide(
          Layer.succeed(SystemAppearance, {
            modes: Stream.make('Light'),
            contrasts: Stream.make('Standard', 'More'),
          }),
        ),
      ),
    )
    expect(Array.from(heard)).toEqual([
      ObservedSystemContrast({ contrast: 'Standard' }),
      ObservedSystemContrast({ contrast: 'More' }),
    ])
    const byDefault = await Effect.runPromise(
      Stream.runCollect(Stream.take(systemContrastStream, 1)),
    )
    expect(Array.from(byDefault)).toEqual([
      ObservedSystemContrast({ contrast: 'Standard' }),
    ])
  })

  it('is told to the page by the edge: the attribute is there for More and gone for Standard', () => {
    const attributes = new Map<string, string>()
    const root = {
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value)
      },
      removeAttribute: (name: string) => {
        attributes.delete(name)
      },
    }
    paintContrastOnPage('More', root)
    expect(attributes.get('data-fk-contrast')).toBe('More')
    paintContrastOnPage('Standard', root)
    expect(attributes.has('data-fk-contrast')).toBe(false)
  })
})
