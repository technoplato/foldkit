import { Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  MultipleCountersV3DebugLoginRequest,
  MultipleCountersV3DebugSubject,
  decodeMultipleCountersV3DebugLoginRequest,
  multipleCountersV3DebugLoginMarkup,
  multipleCountersV3DebugLoginSubjects,
  multipleCountersV3DebugSubjectLabel,
  parseMultipleCountersV3DebugSubjectToken,
} from './debugLogin.js'

describe('Multiple Counters v3 debug login', () => {
  it('names only Alice and Bob as local debug subjects', () => {
    expect(multipleCountersV3DebugLoginSubjects).toEqual([
      { email: 'alice@fake.com', label: 'Alice' },
      { email: 'bob@fake.com', label: 'Bob' },
    ])
    expect(multipleCountersV3DebugSubjectLabel('alice@fake.com')).toBe('Alice')
    expect(multipleCountersV3DebugSubjectLabel('bob@fake.com')).toBe('Bob')
  })

  it('accepts only the allowlisted debug emails', () => {
    expect(
      decodeMultipleCountersV3DebugLoginRequest({ email: 'alice@fake.com' }),
    ).toEqual(
      Result.succeed(
        MultipleCountersV3DebugLoginRequest.make({
          email: 'alice@fake.com',
        }),
      ),
    )
    expect(
      Result.isFailure(
        decodeMultipleCountersV3DebugLoginRequest({
          email: 'eve@example.com',
        }),
      ),
    ).toBe(true)
  })

  it('parses Alice and Bob from CLI tokens and emails', () => {
    expect(parseMultipleCountersV3DebugSubjectToken('alice')).toEqual(
      Result.succeed(
        MultipleCountersV3DebugSubject.make({
          email: 'alice@fake.com',
          label: 'Alice',
        }),
      ),
    )
    expect(parseMultipleCountersV3DebugSubjectToken('Bob@fake.com')).toEqual(
      Result.succeed(
        MultipleCountersV3DebugSubject.make({
          email: 'bob@fake.com',
          label: 'Bob',
        }),
      ),
    )
    expect(Result.isFailure(parseMultipleCountersV3DebugSubjectToken('eve'))).toBe(
      true,
    )
  })

  it('renders Alice and Bob buttons and the issued code without Program state', () => {
    const idle = multipleCountersV3DebugLoginMarkup(Option.none())
    expect(idle).toContain('id="v3-debug-alice"')
    expect(idle).toContain('id="v3-debug-bob"')
    expect(idle).toContain('alice@fake.com')
    expect(idle).not.toContain('Current Alice code')

    const issued = multipleCountersV3DebugLoginMarkup(
      Option.some({
        code: '246801',
        email: 'alice@fake.com',
        label: 'Alice',
      }),
    )
    expect(issued).toContain('Current Alice code')
    expect(issued).toContain('246801')
    expect(issued).not.toContain('INSTANT_APP_ADMIN_TOKEN')
  })
})
