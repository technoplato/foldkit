import { Array, Option } from 'effect'
import { buttonsOf, textsOf } from 'foldkit/renderers'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  type Model,
  failedBadGatewayModel,
  failedInvalidModel,
  failedUnreachableModel,
  readModel,
  readingModel,
  unreadModel,
} from './model.js'
import { GateProgram, gateScreen, gateValid } from './program.js'

const sourceOf = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), 'utf8')

const textContents = (model: Model) =>
  Array.map(textsOf(gateScreen(model)), text => text.content)

const buttonTokens = (model: Model) =>
  Array.map(buttonsOf(gateScreen(model)), button => button.token)

describe('GateProgram', () => {
  it('owns valid and screen on Program.make', () => {
    expect(GateProgram.valid).toBe(gateValid)
    expect(GateProgram.screen).toBe(gateScreen)
  })

  it('hides refresh while Reading and offers it otherwise', () => {
    expect(gateValid(readingModel)).toEqual([
      {
        token: 'refresh',
        keys: ['r'],
        spoken: ['refresh'],
        valid: false,
        hidden: 'origin is already reading',
      },
    ])
    expect(gateValid(readModel)).toEqual([
      {
        token: 'refresh',
        keys: ['r'],
        spoken: ['refresh'],
        valid: true,
      },
    ])
    expect(buttonTokens(readingModel)).toEqual([])
    expect(buttonTokens(readModel)).toEqual(['refresh'])
    expect(buttonTokens(unreadModel)).toEqual(['refresh'])
    expect(buttonTokens(failedBadGatewayModel)).toEqual(['refresh'])
  })

  it('paints every origin leaf without a URL', () => {
    expect(textContents(unreadModel)).toEqual(['Gate', 'Unread'])
    expect(textContents(readingModel)).toEqual(['Gate', 'Reading'])
    expect(textContents(failedBadGatewayModel)).toEqual(['Gate', 'Bad gateway'])
    expect(textContents(failedUnreachableModel)).toEqual([
      'Gate',
      'Unreachable',
    ])
    expect(textContents(failedInvalidModel)).toEqual(['Gate', 'Invalid'])
    expect(textContents(readModel)).toEqual([
      'Gate',
      'Rate remaining 40 of 60 resets 60000',
      'Messages remaining 10 of 20 resets 86400000',
    ])
    expect(
      Array.join(textContents(readModel), '\n').includes('gate.grok.me'),
    ).toBe(false)
  })

  it('wraps the product in Device chrome when a device is given', () => {
    const screen = gateScreen(readModel, { device: 'computer' })
    expect(screen._tag).toBe('DeviceShell')
    if (screen._tag !== 'DeviceShell') {
      return
    }
    expect(screen.device).toBe('computer')
    expect(screen.title).toBe('Gate')
    expect(Option.isSome(Array.head(screen.children))).toBe(true)
  })

  it('does not invent GitHub chrome or host URL lists in the screen modules', () => {
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
    expect(sourceOf('./product.ts')).not.toContain('gate.grok.me')
    expect(sourceOf('./program.ts')).not.toContain('gate.grok.me')
  })
})
