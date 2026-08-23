import { Array, Option } from 'effect'
import { buttonsOf, textsOf } from 'foldkit/renderers'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { type Model, emptyModel, loadedModel, loadingModel } from './model.js'
import { productView } from './product.js'
import { SettingsProgram, settingsScreen, settingsValid } from './program.js'

const sourceOf = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')

const textContents = (model: Model) =>
  Array.map(textsOf(settingsScreen(model)), text => text.content)

describe('SettingsProgram', () => {
  it('owns valid and screen on Program.make', () => {
    expect(SettingsProgram.valid).toBe(settingsValid)
    expect(SettingsProgram.screen).toBe(settingsScreen)
    expect(settingsScreen(loadedModel())).toEqual(productView(loadedModel()))
  })

  it('paints Settings, token, apply, and host list', () => {
    const text = textContents(loadedModel())
    expect(text).toContain('Settings')
    expect(text).toContain('Ready')
    expect(text).toContain('Idle')
    expect(text).toContain('ingest.knophy.com')
    expect(text).toContain('counter.knophy.com')
    expect(text).toContain('Public')
    expect(text).toContain('Restricted')
  })

  it('hides refresh while Applying', () => {
    const loading = settingsValid(loadingModel())
    const refresh = loading.find(action => action.token === 'refresh')
    expect(refresh?.valid).toBe(false)
    expect(
      settingsValid(loadedModel()).find(action => action.token === 'refresh')
        ?.valid,
    ).toBe(true)
  })

  it('wraps the product in Device chrome when a device is given', () => {
    const screen = settingsScreen(loadedModel(), { device: 'computer' })
    expect(screen._tag).toBe('DeviceShell')
    if (screen._tag !== 'DeviceShell') {
      return
    }
    expect(screen.device).toBe('computer')
    expect(screen.title).toBe('Settings')
    expect(Option.isSome(Array.head(screen.children))).toBe(true)
  })

  it('does not invent GitHub chrome in the screen modules', () => {
    const sources = [
      sourceOf('./product.ts'),
      sourceOf('./program.ts'),
      sourceOf('./message.ts'),
    ]
    for (const source of sources) {
      expect(source).not.toMatch(/github\.com/i)
      expect(source).not.toContain('HostHeader')
      expect(source).not.toContain('formatHostChrome')
    }
  })

  it('starts empty hosts before load', () => {
    expect(textContents(emptyModel())).toContain('Settings')
    expect(textContents(emptyModel())).toContain('Empty')
  })
})
