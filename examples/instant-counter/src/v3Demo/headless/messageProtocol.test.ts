import {
  ClickedAddCounter,
  MultipleCountersAdmissionClaim,
  MultipleCountersProgram,
  NavigationCarrierInvocation,
} from 'counters-core-example'
import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { MultipleCountersV3MessageProtocol } from './messageProtocol.js'

describe('Multiple Counters protocol-v3 wire boundary', () => {
  it('uses the Program-owned event identity for every canonical Message', () => {
    const message = ClickedAddCounter({ counterId: 'counter-3' })

    expect(MultipleCountersV3MessageProtocol.eventMetadata(message)).toEqual({
      eventId: 'MultipleCounters.ClickedAddCounter',
      eventVersion: 1,
    })
    expect(
      Option.isSome(
        S.decodeUnknownOption(MultipleCountersProgram.Message)(message),
      ),
    ).toBe(true)
  })

  it('admits semantic claims and excludes raw Program Messages at intake', () => {
    const rawMessage = ClickedAddCounter({ counterId: 'counter-3' })
    const claim = NavigationCarrierInvocation.make({
      destinationUri: '/counters',
      occurrenceId: 'occurrence-1',
    })

    expect(
      Option.isNone(
        S.decodeUnknownOption(MultipleCountersAdmissionClaim)(rawMessage),
      ),
    ).toBe(true)
    expect(
      Option.isSome(
        S.decodeUnknownOption(MultipleCountersAdmissionClaim)(claim),
      ),
    ).toBe(true)
  })
})
