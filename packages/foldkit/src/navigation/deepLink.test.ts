import { describe, expect, it } from 'vitest'

import { uriOfDeepLink } from './deepLink.js'

describe('uriOfDeepLink', () => {
  it.each([
    ['foldkit-counter://counter/session', '/counter/session'],
    ['foldkit-counter://counter/menu?q=re', '/counter/menu?q=re'],
    ['https://counter.example/counter/session', '/counter/session'],
    ['https://counter.example?q=re', '/?q=re'],
    ['https://counter.example', '/'],
    ['/counter', '/counter'],
  ])('reads %s as %s', (url, uri) => {
    expect(uriOfDeepLink(url)).toBe(uri)
  })
})
