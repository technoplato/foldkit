import { describe, expect, it } from 'vitest'

import { Rendered, encodeLine } from './event.js'
import { decodeLines } from './lines.js'

const rendered = Rendered.make({
  at: '2026-10-04T20:00:00.000Z',
  sequence: 1,
  session: 'aaaa0001',
  app: 'books',
  surface: 'terminal-tui',
  painter: 'OpenTui',
  durationMs: 2,
})

const legacyReactStarted =
  '{"_tag":"SessionStarted","at":"2026-10-04T20:00:01.000Z","sequence":1,"session":"9f3c2a71","app":"books","host":"react","programId":"sync:books","programVersion":1}'

const legacyReactRendered =
  '{"_tag":"Rendered","at":"2026-10-04T20:00:02.000Z","sequence":2,"session":"9f3c2a71","painter":"React","durationMs":3.2}'

const legacyCliStarted =
  '{"_tag":"SessionStarted","at":"2026-10-04T20:00:03.000Z","sequence":1,"session":"b0b00002","app":"books","host":"cli","programId":"sync:books","programVersion":1}'

const legacyCliRendered =
  '{"_tag":"Rendered","at":"2026-10-04T20:00:04.000Z","sequence":2,"session":"b0b00002","painter":"Cli","durationMs":1}'

const legacyReactStopped =
  '{"_tag":"SessionStopped","at":"2026-10-04T20:00:05.000Z","sequence":3,"session":"9f3c2a71","app":"books","host":"react","programId":"sync:books","programVersion":1,"durationMs":4000}'

describe('decodeLines', () => {
  it('reads lines that declare their surface as they are', () => {
    expect(decodeLines([encodeLine(rendered)])).toStrictEqual({
      events: [rendered],
      unreadableLineCount: 0,
    })
  })

  it('reads a first-release session as declaring the surface its Host names, on every line', () => {
    const { events, unreadableLineCount } = decodeLines([
      legacyReactStarted,
      legacyCliStarted,
      legacyReactRendered,
      legacyCliRendered,
      legacyReactStopped,
    ])
    expect(unreadableLineCount).toBe(0)
    expect(events).toMatchObject([
      {
        _tag: 'SessionStarted',
        session: '9f3c2a71',
        app: 'books',
        surface: 'web-react',
      },
      {
        _tag: 'SessionStarted',
        session: 'b0b00002',
        app: 'books',
        surface: 'terminal-cli',
      },
      { _tag: 'Rendered', session: '9f3c2a71', surface: 'web-react' },
      { _tag: 'Rendered', session: 'b0b00002', surface: 'terminal-cli' },
      { _tag: 'SessionStopped', session: '9f3c2a71', surface: 'web-react' },
    ])
    events.forEach(event => {
      expect(event).not.toHaveProperty('host')
      expect(encodeLine(event)).toContain('"app":"books","surface":')
    })
  })

  it('counts as unreadable a line it cannot place on a surface', () => {
    const orphan = legacyReactRendered
    const unknownHostStarted = legacyReactStarted
      .replace('"host":"react"', '"host":"desktop"')
      .replaceAll('9f3c2a71', 'd0d00004')
    const unknownHostRendered = legacyReactRendered.replaceAll(
      '9f3c2a71',
      'd0d00004',
    )
    const unknownSurface = encodeLine(rendered).replace(
      '"surface":"terminal-tui"',
      '"surface":"desktop"',
    )
    expect(
      decodeLines([
        orphan,
        unknownHostStarted,
        unknownHostRendered,
        unknownSurface,
        '{"_tag":"Rendered","at":"2026-10-04T20:0',
      ]),
    ).toStrictEqual({ events: [], unreadableLineCount: 5 })
  })
})
