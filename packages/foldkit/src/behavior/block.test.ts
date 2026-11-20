import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { define, otherwise, to } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import * as Shelf from '../test/shelf.js'
import { problemsOf } from './block.js'
import * as LongPress from './longPress.js'

// A made-up lamp: nothing here is a real part.

const Off = ts('Off')
const On = ts('On')
const Broken = ts('Broken')
const LampState = S.Union([Off, On, Broken])

const Flipped = m('Flipped')
const LampMessage = S.Union([Flipped])

describe('what is wrong with a block’s chart', () => {
  it('is nothing for the hold, and nothing for the charts of the shelf’s two parts', () => {
    expect(problemsOf(LongPress.block)).toEqual([])
    expect(problemsOf(Shelf.TitleMenu)).toEqual([])
    expect(problemsOf(Shelf.Pin)).toEqual([])
  })

  it('names a state nothing leads to', () => {
    const chart = define({ state: LampState, message: LampMessage })({
      initial: Off(),
      states: {
        Off: { on: { Flipped: to('On', () => On()) } },
        On: { on: { Flipped: to('Off', () => Off()) } },
      },
    })
    expect(problemsOf({ name: 'Lamp', chart })).toEqual([
      'Lamp: nothing leads to the state Broken',
    ])
  })

  it('names an edge that can never fire', () => {
    const chart = define({ state: LampState, message: LampMessage })({
      initial: Off(),
      states: {
        Off: {
          on: {
            Flipped: [
              otherwise(to('On', () => On())),
              otherwise(to('Broken', () => Broken())),
            ],
          },
        },
        On: { on: { Flipped: to('Broken', () => Broken()) } },
        Broken: { on: { Flipped: to('Off', () => Off()) } },
      },
    })
    expect(problemsOf({ name: 'Lamp', chart })).toEqual([
      'Lamp: Flipped in Off can never fire (ShadowedByOtherwise)',
    ])
  })
})
