import { describe, expect, it } from 'vitest'

import { expoLinkingPath, portablePathFromCarrier } from './carrier'

describe('Expo showcase carrier', () => {
  it('extracts the same portable path from Expo Go and native carriers', () => {
    expect(portablePathFromCarrier('exp://192.168.1.20:8081/--/0/5')).toBe(
      '/0/5',
    )
    expect(portablePathFromCarrier('exp://192.168.1.20:8081/--/0/log')).toBe(
      '/0/log',
    )
    expect(portablePathFromCarrier('foldkit://showcase/0/5')).toBe('/0/5')
  })

  it('preserves queries and supplies Expo Linking with a relative path', () => {
    expect(
      portablePathFromCarrier(
        'exp://192.168.1.20:8081/--/counter/state?model=count',
      ),
    ).toBe('/counter/state?model=count')
    expect(expoLinkingPath('/counter/state?model=count')).toBe(
      'counter/state?model=count',
    )
  })
})
