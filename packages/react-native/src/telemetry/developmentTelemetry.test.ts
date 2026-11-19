import { Option } from 'effect'
import { Processor } from 'foldkit'
import { describe, expect, it, vi } from 'vitest'

import {
  attachDevelopmentTelemetry,
  telemetryLineMark,
  telemetryLineOf,
} from './developmentTelemetry.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)

const handle = () => {
  let observed = 0
  return {
    host: Processor.Host.ExpoIos(),
    observeRuntime: () => {
      observed += 1
      return () => Promise.resolve()
    },
    observedCount: () => observed,
  }
}

describe('a phone’s telemetry in a development build', () => {
  it('marks each line so the trace can be picked out of the console', () => {
    expect(telemetryLineOf('{"_tag":"Transition"}')).toBe(
      `${telemetryLineMark}{"_tag":"Transition"}`,
    )
  })

  it('attaches to the running Program in a development build', () => {
    const running = handle()
    const attached = attachDevelopmentTelemetry(running, {
      app: 'books',
      isDevelopment: true,
      write: () => undefined,
    })
    expect(Option.isSome(attached)).toBe(true)
    expect(running.observedCount()).toBe(1)
  })

  it('records nothing in a build that is not for development', () => {
    const running = handle()
    const attached = attachDevelopmentTelemetry(running, {
      app: 'books',
      isDevelopment: false,
      write: () => undefined,
    })
    expect(Option.isNone(attached)).toBe(true)
    expect(running.observedCount()).toBe(0)
  })

  it('writes what the phone learns about itself later as lines of its own', () => {
    const lines: Array<string> = []
    const sayings: Array<(note: Readonly<Record<string, unknown>>) => void> = []
    attachDevelopmentTelemetry(handle(), {
      app: 'books',
      isDevelopment: true,
      write: line => {
        lines.push(line)
      },
      laterNotes: say => {
        sayings.push(say)
      },
    })
    sayings.forEach(say => {
      say({ updates: 'none newer' })
    })

    expect(sayings).toHaveLength(1)
    expect(lines.filter(line => line.startsWith('foldkit-host-note '))).toEqual(
      [expect.stringContaining('"updates":"none newer"')],
    )
  })

  it('asks for nothing later in a build that is not for development', () => {
    const asked: Array<unknown> = []
    attachDevelopmentTelemetry(handle(), {
      app: 'books',
      isDevelopment: false,
      write: () => undefined,
      laterNotes: say => {
        asked.push(say)
      },
    })
    expect(asked).toEqual([])
  })
})
