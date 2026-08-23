import { Effect } from 'effect'
import { SettingsOriginTest } from 'settings-core-example'
import { describe, expect, it } from 'vitest'

import { refreshSettings, showSettings } from './host.js'

describe('Settings CLI host', () => {
  it('shows Settings and Public ingest after init', async () => {
    const painting = await Effect.runPromise(showSettings(SettingsOriginTest))

    expect(painting.screen).toContain('Settings')
    expect(painting.screen).toContain('ingest.knophy.com')
    expect(painting.screen).toContain('Public')
    expect(painting.screen).toContain('[refresh]')
  })

  it('refresh re-reads the origin and paints settingsScreen', async () => {
    const painting = await Effect.runPromise(
      refreshSettings(SettingsOriginTest),
    )

    expect(painting.screen).toContain('Settings')
    expect(painting.commands.map(command => command.token)).toContain('refresh')
  })
})
