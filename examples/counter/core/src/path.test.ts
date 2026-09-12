import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  Path,
  canonicalShowPath,
  homeOccupancy,
  pathRouter,
  printDestination,
} from './path.js'

describe('Counter Path', () => {
  it('prints /counter from the Path printer', () => {
    expect(pathRouter()).toBe('/counter')
    expect(pathRouter(Path())).toBe('/counter')
  })

  it('canonicalizes CLI --path into occupancy', () => {
    expect(canonicalShowPath(undefined)).toEqual(Option.none())
    expect(canonicalShowPath('')).toEqual(Option.none())
    expect(canonicalShowPath('counter')).toEqual(Option.some(homeOccupancy))
    expect(canonicalShowPath('/counter')).toEqual(Option.some(homeOccupancy))
    expect(canonicalShowPath('counter.increment')).toEqual(
      Option.some('counter.increment'),
    )
    expect(canonicalShowPath('/counter/increment')).toEqual(
      Option.some('counter.increment'),
    )
  })

  it('prints occupied destinations', () => {
    expect(printDestination(undefined)).toBe('/counter')
    expect(printDestination('counter')).toBe('/counter')
    expect(printDestination('/counter')).toBe('/counter')
    expect(printDestination('counter.increment')).toBe('/counter/increment')
  })
})
