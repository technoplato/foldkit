import { Array } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type KeyedRoute,
  type KeyedStack,
  coalescedStack,
} from './keyedStack.js'

const routeAt = (uri: string): KeyedRoute => ({ key: uri, uri })

const recordingStack = () => {
  const resets: Array<ReadonlyArray<string>> = []
  let current: Array.NonEmptyReadonlyArray<KeyedRoute> = [routeAt('/counter')]
  const stack: KeyedStack = {
    routes: () => current,
    reset: next => {
      current = next
      resets.push(Array.map(next, route => route.uri))
    },
    subscribe: () => () => {},
  }
  return { stack, resets }
}

describe('coalescedStack', () => {
  it('lands a burst of resets as one reset to the last routes', () => {
    const { stack, resets } = recordingStack()
    const flushes: Array<() => void> = []
    const coalesced = coalescedStack(stack, flush => {
      flushes.push(flush)
    })
    coalesced.reset([routeAt('/counter')])
    coalesced.reset([routeAt('/counter'), routeAt('/counter/session')])
    expect(Array.map(coalesced.routes(), route => route.uri)).toEqual([
      '/counter',
      '/counter/session',
    ])
    expect(resets).toEqual([])
    expect(flushes).toHaveLength(1)
    Array.forEach(flushes, flush => {
      flush()
    })
    expect(resets).toEqual([['/counter', '/counter/session']])
  })
})
