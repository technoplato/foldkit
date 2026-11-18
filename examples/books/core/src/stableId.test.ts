import { Array } from 'effect'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { sha256Hex, stableUUID } from './stableId.js'

const companionStableUUID = (name: string): string => {
  const bytes = Buffer.from(
    createHash('sha256').update(name).digest().subarray(0, 16),
  )
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x50, 6)
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8)
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const names = [
  '',
  'abc',
  'media-play|2c1d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f|0f0e0d0c-0b0a-4908-8706-050403020100',
  'books-stretch|audiobook:5d1c0e2a-3b4f-5a6d-8e7f-90a1b2c3d4e5|1792350301500',
  'Nietzsche: Jenseits von Gut und Böse — Vorrede',
  'x'.repeat(55),
  'x'.repeat(56),
  'x'.repeat(64),
  'x'.repeat(1000),
]

describe('stable ids', () => {
  it('hashes a name with SHA-256, as node does, for short, long, and non-ASCII names', () => {
    Array.forEach(names, name => {
      expect(sha256Hex(name)).toBe(
        createHash('sha256').update(name).digest('hex'),
      )
    })
  })

  it('makes the same version-5 UUID as the YouTube companion and Scribe Videos', () => {
    Array.forEach(names, name => {
      expect(stableUUID(name)).toBe(companionStableUUID(name))
    })
    expect(stableUUID('abc')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
