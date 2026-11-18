import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { inAppPath } from './links.js'

const ORIGIN = 'https://issues.pisspoursoftware.xyz'

describe('links inside the tracker', () => {
  it('opens an Issue, a Recording or an agent inside the app, keeping its query', () => {
    expect(inAppPath('/issues/1358', ORIGIN)).toEqual(
      Option.some('/issues/1358'),
    )
    expect(inAppPath(`${ORIGIN}/recordings/208?from=chip`, ORIGIN)).toEqual(
      Option.some('/recordings/208?from=chip'),
    )
    expect(
      inAppPath('/agents/claude-code%2Fissues-linear-1538%40ld', ORIGIN),
    ).toEqual(Option.some('/agents/claude-code%2Fissues-linear-1538%40ld'))
  })

  it('leaves links to other sites, such as his words, to the browser', () => {
    expect(
      inAppPath(
        'https://words.pisspoursoftware.xyz/recording/faa684c2-34e4-47e5-8f9b-3b2196da9463',
        ORIGIN,
      ),
    ).toEqual(Option.none())
    expect(inAppPath('mailto:someone@example.com', ORIGIN)).toEqual(
      Option.none(),
    )
  })
})
