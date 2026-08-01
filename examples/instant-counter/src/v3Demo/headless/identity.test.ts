import { describe, expect, it } from 'vitest'

import {
  makeMultipleCountersV3AppSubjectDigest,
  makeMultipleCountersV3EntityId,
  makeMultipleCountersV3SessionIdentity,
} from '../shared/identity.js'

describe('portable Multiple Counters protocol-v3 identity', () => {
  it('pins one derivation shared by browser, Expo, OpenTUI, and authority hosts', () => {
    const identity = makeMultipleCountersV3SessionIdentity({
      instantAppId: 'instant-v3-demo-app',
      sessionEpochSeed: 'first-account-session',
      subjectId: 'authenticated-subject',
    })

    expect(identity).toEqual({
      appSubjectDigest:
        '43f7da3d10b6e35f9229cdaa113d448b256e46f2ec01dc7245d48689aaf26c4d',
      processorRoomId:
        'multiple-counters-v3-room:yT6Dpibt2cvGt-RS-i8rRjnlPJcdOI1gfUdAK4VG-i8',
      sessionEpochId: 'j3exf6RGNi7KODPrp-6JyRhtBmau0SZCSGO5OdCf0iM',
      sessionId:
        'multiple-counters:pv2:ip3:43f7da3d10b6e35f9229cdaa113d448b256e46f2ec01dc7245d48689aaf26c4d:j3exf6RGNi7KODPrp-6JyRhtBmau0SZCSGO5OdCf0iM',
    })
  })

  it('separates subjects, epochs, and immutable entity domains', () => {
    const firstDigest = makeMultipleCountersV3AppSubjectDigest(
      'instant-v3-demo-app',
      'subject-a',
    )
    const secondDigest = makeMultipleCountersV3AppSubjectDigest(
      'instant-v3-demo-app',
      'subject-b',
    )
    const firstEpoch = makeMultipleCountersV3SessionIdentity({
      instantAppId: 'instant-v3-demo-app',
      sessionEpochSeed: 'epoch-a',
      subjectId: 'subject-a',
    })
    const secondEpoch = makeMultipleCountersV3SessionIdentity({
      instantAppId: 'instant-v3-demo-app',
      sessionEpochSeed: 'epoch-b',
      subjectId: 'subject-a',
    })

    expect(firstDigest).not.toBe(secondDigest)
    expect(firstEpoch.sessionId).not.toBe(secondEpoch.sessionId)
    expect(makeMultipleCountersV3EntityId('Session', 'same')).not.toBe(
      makeMultipleCountersV3EntityId('Policy', 'same'),
    )
  })
})
