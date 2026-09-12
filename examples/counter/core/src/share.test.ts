import { describe, expect, it } from 'vitest'

import {
  canOccupyNamedShare,
  claimNamedShare,
  grantNamedShare,
  isNamedShareOccupancy,
  isValidShareName,
  namedShareCountId,
  namedShareDeniedCountId,
  namedShareDeniedRoom,
  namedShareNameFromPath,
  namedShareOccupancy,
  namedShareRoom,
  namedShareUri,
} from './share.js'
import { COUNT_UUID, ownedCountId } from './wire.js'

describe('named share', () => {
  it('prints a UUID count row distinct from public and L6 mine', () => {
    expect(namedShareCountId('kitchen')).toMatch(
      /^c0a7c001-0000-4000-8000-[0-9a-f]{12}$/,
    )
    expect(namedShareCountId('kitchen')).not.toBe(COUNT_UUID)
    expect(namedShareCountId('kitchen')).not.toBe(ownedCountId('alice'))
    expect(namedShareCountId('kitchen')).toBe(namedShareCountId('kitchen'))
    expect(namedShareCountId('pantry')).not.toBe(namedShareCountId('kitchen'))
    expect(namedShareDeniedCountId('kitchen', 'carol')).not.toBe(
      namedShareCountId('kitchen'),
    )
  })

  it('names Instant rooms without using mine-', () => {
    expect(namedShareRoom('kitchen')).toBe('share-kitchen')
    expect(namedShareDeniedRoom('kitchen', 'carol')).toBe(
      'share-kitchen-denied-carol',
    )
    expect(namedShareRoom('kitchen')).not.toContain('mine-')
  })

  it('occupies /kitchen, not /counter/kitchen', () => {
    expect(namedShareOccupancy('kitchen')).toBe('kitchen')
    expect(namedShareUri('kitchen')).toBe('/kitchen')
    expect(isNamedShareOccupancy('kitchen')).toBe(true)
    expect(isNamedShareOccupancy('/kitchen')).toBe(true)
    expect(isNamedShareOccupancy('counter')).toBe(false)
    expect(isNamedShareOccupancy('/counter')).toBe(false)
    expect(isNamedShareOccupancy('counter.increment')).toBe(false)
    expect(namedShareNameFromPath('/kitchen')).toBe('kitchen')
  })

  it('accepts kitchen tokens and rejects paths', () => {
    expect(isValidShareName('kitchen')).toBe(true)
    expect(isValidShareName('pantry-2')).toBe(true)
    expect(isValidShareName('')).toBe(false)
    expect(isValidShareName('/kitchen')).toBe(false)
    expect(isValidShareName('counter.increment')).toBe(false)
  })

  it('lets the owner and grantee occupy, not carol', () => {
    const grant = {
      name: 'kitchen',
      owner: 'alice',
      with: ['bob'],
    }
    expect(canOccupyNamedShare(grant, 'alice')).toBe(true)
    expect(canOccupyNamedShare(grant, 'bob')).toBe(true)
    expect(canOccupyNamedShare(grant, 'carol')).toBe(false)
  })

  it('lets alice share kitchen with bob and refuses a second owner', () => {
    const claimed = claimNamedShare(undefined, 'kitchen', 'alice')
    expect(claimed).toEqual({ name: 'kitchen', owner: 'alice', with: [] })
    const granted = grantNamedShare(claimed, 'kitchen', 'alice', 'bob')
    expect(granted).toEqual({
      _tag: 'Ok',
      grant: { name: 'kitchen', owner: 'alice', with: ['bob'] },
    })
    const denied = grantNamedShare(
      granted._tag === 'Ok' ? granted.grant : undefined,
      'kitchen',
      'carol',
      'dave',
    )
    expect(denied._tag).toBe('Denied')
  })
})
