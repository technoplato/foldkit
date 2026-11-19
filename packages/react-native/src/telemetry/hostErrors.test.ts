import { describe, expect, it } from 'vitest'

import {
  hostErrorLineMark,
  hostErrorLineOf,
  hostNoteLineMark,
  hostNoteLineOf,
  watchHostErrors,
} from './hostErrors.js'

type Handler = (error: unknown, isFatal?: boolean) => void

const fakeErrors = () => {
  let handler: Handler = () => undefined
  const seen: Array<string> = []
  handler = () => {
    seen.push('the platform’s own handler')
  }
  return {
    errorUtils: {
      getGlobalHandler: () => handler,
      setGlobalHandler: (next: Handler) => {
        handler = next
      },
    },
    raise: (error: unknown, isFatal: boolean) => {
      handler(error, isFatal)
    },
    seen,
  }
}

describe('what a phone writes when its JavaScript fails outside the Program', () => {
  it('writes one marked line with what failed, before the platform handles it', () => {
    const lines: Array<string> = []
    const errors = fakeErrors()
    watchHostErrors({
      errorUtils: errors.errorUtils,
      write: line => lines.push(line),
      now: () => new Date('2026-11-19T14:27:12.000Z'),
    })

    errors.raise(new TypeError('undefined is not a function'), true)

    expect(lines).toHaveLength(1)
    expect(lines[0]?.startsWith(hostErrorLineMark)).toBe(true)
    const said: unknown = JSON.parse(
      (lines[0] ?? '').slice(hostErrorLineMark.length),
    )
    expect(said).toMatchObject({
      at: '2026-11-19T14:27:12.000Z',
      isFatal: true,
      name: 'TypeError',
      message: 'undefined is not a function',
    })
    expect(errors.seen).toEqual(['the platform’s own handler'])
  })

  it('says what it can of a failure that is not an Error', () => {
    expect(
      JSON.parse(
        hostErrorLineOf('boom', false, new Date(0)).slice(
          hostErrorLineMark.length,
        ),
      ),
    ).toMatchObject({ isFatal: false, name: 'string', message: 'boom' })
  })

  it('does nothing where the platform has no such handler', () => {
    expect(() => {
      watchHostErrors({ errorUtils: undefined, write: () => undefined })
    }).not.toThrow()
  })
})

describe('what a phone says about itself when its trace starts', () => {
  it('is one marked line with the time and the facts it was given', () => {
    const line = hostNoteLineOf(
      { reactNativeSchedulerGuard: true },
      new Date('2026-11-19T15:00:00.000Z'),
    )
    expect(line.startsWith(hostNoteLineMark)).toBe(true)
    expect(JSON.parse(line.slice(hostNoteLineMark.length))).toEqual({
      at: '2026-11-19T15:00:00.000Z',
      reactNativeSchedulerGuard: true,
    })
  })
})
