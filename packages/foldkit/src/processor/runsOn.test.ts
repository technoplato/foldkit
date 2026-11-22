import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Host from './host.js'
import * as RunsOn from './runsOn.js'

describe('where declared work runs', () => {
  it('runs on every Host unless it says otherwise', () => {
    for (const host of Host.everyHost) {
      expect(RunsOn.runsHere(undefined, Option.some(host))).toBe(true)
      expect(RunsOn.runsHere(RunsOn.everywhere, Option.some(host))).toBe(true)
    }
    expect(RunsOn.runsHere(undefined, Option.none())).toBe(true)
  })

  it('runs server-only work on the Server Host and on no other', () => {
    const hostsThatRunIt = Host.everyHost.filter(host =>
      RunsOn.runsHere(RunsOn.serverOnly, Option.some(host)),
    )
    expect(hostsThatRunIt).toEqual([Host.Server()])
  })

  it('does not run server-only work where the Host is not known', () => {
    expect(RunsOn.runsHere(RunsOn.serverOnly, Option.none())).toBe(false)
  })
})
