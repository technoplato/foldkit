import { NonEmptyString } from 'foldkit/adt'
import { describe, expect, it } from 'vitest'

import {
  appCoversHost,
  hostsFromAccess,
  parseCaddyHosts,
  planApply,
  visibilityForHost,
} from './access.js'
import {
  Public,
  Restricted,
  defaultRestricted,
  ownerEmail,
  settingsHostName,
} from './model.js'

const ingestBypass = {
  id: 'ingest',
  name: 'ingest.knophy.com public',
  domain: 'ingest.knophy.com',
  kind: 'Bypass' as const,
  emails: [],
}

const counterBypass = {
  id: 'counter',
  name: 'counter.knophy.com public',
  domain: 'counter.knophy.com',
  kind: 'Bypass' as const,
  emails: [],
}

const counterStarBypass = {
  id: 'counter-star',
  name: '*.counter.knophy.com public',
  domain: '*.counter.knophy.com',
  kind: 'Bypass' as const,
  emails: [],
}

describe('parseCaddyHosts', () => {
  it('reads Caddy hosts and always includes settings', () => {
    const hosts = parseCaddyHosts(`
http://ingest.knophy.com {
	import loopback_proxy 5214
}
http://casino.knophy.com {
	import loopback_proxy 5215
}
http:// {
	bind 127.0.0.1
}
`)
    expect(hosts).toContain('ingest.knophy.com')
    expect(hosts).toContain('casino.knophy.com')
    expect(hosts).toContain(settingsHostName)
    expect(hosts).not.toContain('')
  })
})

describe('appCoversHost', () => {
  it('matches exact and one-label wildcards', () => {
    expect(appCoversHost('ingest.knophy.com', 'ingest.knophy.com')).toBe(true)
    expect(
      appCoversHost('*.counter.knophy.com', 'surface.counter.knophy.com'),
    ).toBe(true)
    expect(appCoversHost('*.counter.knophy.com', 'counter.knophy.com')).toBe(
      false,
    )
    expect(appCoversHost('*.knophy.com', 'casino.knophy.com')).toBe(true)
    expect(appCoversHost('*.knophy.com', 'surface.counter.knophy.com')).toBe(
      false,
    )
  })
})

describe('visibilityForHost', () => {
  it('marks ingest and nested counter Public from Bypass apps', () => {
    const apps = [ingestBypass, counterBypass, counterStarBypass]
    expect(visibilityForHost('ingest.knophy.com', apps)._tag).toBe('Public')
    expect(visibilityForHost('counter.knophy.com', apps)._tag).toBe('Public')
    expect(visibilityForHost('surface.counter.knophy.com', apps)._tag).toBe(
      'Public',
    )
    expect(visibilityForHost('casino.knophy.com', apps)).toEqual(
      defaultRestricted(),
    )
    expect(visibilityForHost(settingsHostName, apps)).toEqual(
      defaultRestricted(),
    )
  })
})

describe('planApply', () => {
  it('refuses Public on settings and never plans Bypass for it', () => {
    expect(planApply(settingsHostName, Public(), [])._tag).toBe(
      'RefusePublicSettings',
    )
    const allow = planApply(settingsHostName, defaultRestricted(), [])
    expect(allow).toEqual({
      _tag: 'UpsertAllow',
      domain: settingsHostName,
      emails: [ownerEmail],
    })
  })

  it('deletes Bypass when Restricted is only the default owner', () => {
    expect(
      planApply('ingest.knophy.com', defaultRestricted(), [ingestBypass]),
    ).toEqual({ _tag: 'DeleteBypass', domain: 'ingest.knophy.com' })
  })

  it('creates Bypass for Public and no-ops when already Public', () => {
    expect(planApply('casino.knophy.com', Public(), [])._tag).toBe(
      'CreateBypass',
    )
    expect(planApply('ingest.knophy.com', Public(), [ingestBypass])._tag).toBe(
      'Noop',
    )
  })

  it('upserts Allow when Restricted emails are not only the owner', () => {
    const plan = planApply(
      'casino.knophy.com',
      Restricted.make({
        emails: [
          NonEmptyString.make(ownerEmail),
          NonEmptyString.make('friend@example.com'),
        ],
      }),
      [],
    )
    expect(plan._tag).toBe('UpsertAllow')
  })
})

describe('hostsFromAccess', () => {
  it('keeps ingest Public in the painted host list', () => {
    const hosts = hostsFromAccess(
      ['ingest.knophy.com', 'casino.knophy.com', settingsHostName],
      [ingestBypass],
    )
    expect(hosts[0]?.visibility._tag).toBe('Public')
    expect(hosts[1]?.visibility._tag).toBe('Restricted')
    expect(hosts[2]?.visibility._tag).toBe('Restricted')
  })
})
