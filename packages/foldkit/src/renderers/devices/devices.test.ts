import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { Text } from '../elements.js'
import { buttonsOf } from '../query.js'
import {
  Computer,
  Device,
  Phone,
  Tablet,
  Tv,
  Watch,
  wrapDevice,
} from './devices.js'

describe('Device', () => {
  it('is watch, phone, tablet, computer, or tv', () => {
    expect(
      S.decodeUnknownSync(S.Array(Device))([
        'watch',
        'phone',
        'tablet',
        'computer',
        'tv',
      ]),
    ).toEqual(['watch', 'phone', 'tablet', 'computer', 'tv'])
  })

  it('rejects laptop, cli, and other hosts', () => {
    expect(S.decodeUnknownExit(Device)('laptop')._tag).toBe('Failure')
    expect(S.decodeUnknownExit(Device)('cli')._tag).toBe('Failure')
    expect(S.decodeUnknownExit(Device)('tui')._tag).toBe('Failure')
    expect(S.decodeUnknownExit(Device)('headless')._tag).toBe('Failure')
  })
})

describe('wrapDevice', () => {
  it('keeps the product tree as the only source of buttons', () => {
    const product = Text('count')
    const shells = [
      wrapDevice('watch', product),
      wrapDevice('phone', product),
      wrapDevice('tablet', product),
      wrapDevice('computer', product),
      wrapDevice('tv', product),
    ]

    expect(buttonsOf(Watch(product))).toEqual([])
    expect(buttonsOf(Phone(product))).toEqual([])
    expect(buttonsOf(Tablet(product))).toEqual([])
    expect(buttonsOf(Computer(product))).toEqual([])
    expect(buttonsOf(Tv(product))).toEqual([])
    expect(shells.map(shell => buttonsOf(shell).length)).toEqual([
      0, 0, 0, 0, 0,
    ])
  })
})
