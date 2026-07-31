import { describe, expect, test } from 'vitest'

import {
  headlessSubjectScopeFromEnvironment,
  includesHeadlessSubject,
} from './subjectScope.js'

describe('headless subject scope', () => {
  test('includes every subject when no acceptance allowlist is present', () => {
    const scope = headlessSubjectScopeFromEnvironment({})

    expect(includesHeadlessSubject(scope, 'subject-a')).toBe(true)
    expect(includesHeadlessSubject(scope, 'subject-b')).toBe(true)
  })

  test('includes only explicitly selected acceptance subjects', () => {
    const scope = headlessSubjectScopeFromEnvironment({
      FOLDKIT_INSTANT_COUNTER_SUBJECT_ALLOWLIST: JSON.stringify([
        'subject-a',
        'subject-b',
      ]),
    })

    expect(includesHeadlessSubject(scope, 'subject-a')).toBe(true)
    expect(includesHeadlessSubject(scope, 'subject-b')).toBe(true)
    expect(includesHeadlessSubject(scope, 'subject-c')).toBe(false)
  })

  test('selects no subjects when the acceptance allowlist is empty', () => {
    const scope = headlessSubjectScopeFromEnvironment({
      FOLDKIT_INSTANT_COUNTER_SUBJECT_ALLOWLIST: '[]',
    })

    expect(includesHeadlessSubject(scope, 'subject-a')).toBe(false)
  })

  test('rejects a malformed acceptance allowlist', () => {
    expect(() =>
      headlessSubjectScopeFromEnvironment({
        FOLDKIT_INSTANT_COUNTER_SUBJECT_ALLOWLIST: '[""]',
      }),
    ).toThrow()
  })
})
