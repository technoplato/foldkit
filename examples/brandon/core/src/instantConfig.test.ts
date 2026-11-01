import { describe, expect, it } from 'vitest'

import { brandonInstantConfig } from './instantConfig.js'

describe("the page's Instant options", () => {
  it("turn Instant's devtool off, so nothing of Instant's is drawn beside the wallet", () => {
    expect(
      brandonInstantConfig('e7c49961-d702-46a1-82c1-fca9a61f6a4d'),
    ).toEqual({ appId: 'e7c49961-d702-46a1-82c1-fca9a61f6a4d', devtool: false })
  })
})
