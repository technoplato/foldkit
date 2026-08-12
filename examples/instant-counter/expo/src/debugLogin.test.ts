import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  multipleCountersV3NativeDebugLoginUrl,
  resolveMultipleCountersV3NativeDebugLoginHost,
} from './debugLogin.js'

describe('native Multiple Counters v3 debug login URL', () => {
  it('uses an explicit origin override when the operator supplies one', () => {
    expect(
      multipleCountersV3NativeDebugLoginUrl({
        maybeMetroHost: Option.some('192.168.1.20:8081'),
        originOverride: Option.some('http://192.168.1.20:18788'),
        platform: 'ios',
      }),
    ).toBe('http://192.168.1.20:18788/magic-code')
  })

  it('derives the minting host from Metro so a physical device can reach the laptop', () => {
    expect(
      resolveMultipleCountersV3NativeDebugLoginHost({
        maybeMetroHost: Option.some('192.168.1.20:8081'),
        platform: 'ios',
      }),
    ).toBe('192.168.1.20')
    expect(
      multipleCountersV3NativeDebugLoginUrl({
        maybeMetroHost: Option.some('192.168.1.20:8081'),
        originOverride: Option.none(),
        platform: 'android',
      }),
    ).toBe('http://192.168.1.20:18788/magic-code')
  })

  it('rewrites loopback to the Android emulator alias', () => {
    expect(
      resolveMultipleCountersV3NativeDebugLoginHost({
        maybeMetroHost: Option.some('127.0.0.1:8081'),
        platform: 'android',
      }),
    ).toBe('10.0.2.2')
    expect(
      resolveMultipleCountersV3NativeDebugLoginHost({
        maybeMetroHost: Option.some('localhost:8081'),
        platform: 'ios',
      }),
    ).toBe('127.0.0.1')
  })
})
