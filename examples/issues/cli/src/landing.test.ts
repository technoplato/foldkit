import { Effect, Option } from 'effect'
import { IssueLanding, LandedBuild, LandedCommit } from 'issues-core-example'
import { describe, expect, it } from 'vitest'

import {
  FoundLanding,
  UnavailableLanding,
  landingJson,
  landingSection,
  readLanding,
} from './landing.js'

const SHA = '852f55fe95ec2790e5728c3391743b79bacecb7e'
const INVITE = 'https://testflight.apple.com/join/AbCdEfGh'
const UPLOAD_PAGE =
  'https://appstoreconnect.apple.com/apps/6798081814/testflight/ios/0aa11bb2-3c4d-5e6f-7a8b-9c0d1e2f3a4b'
const BUILT_AT_MS = Date.parse('2026-10-11T16:10:00Z')

const build = (
  number: number,
  fields: Partial<LandedBuild> = {},
): LandedBuild =>
  LandedBuild.make({
    builtAtMs: BUILT_AT_MS,
    marketingVersion: '0.1',
    maybeTag: Option.none(),
    maybeTaggedAtMs: Option.none(),
    maybeTestflightInvite: Option.none(),
    maybeTestflightPage: Option.none(),
    maybeTestflightVersion: Option.none(),
    number,
    status: 'installed',
    ...fields,
  })

const landing = IssueLanding.make({
  commits: [
    LandedCommit.make({
      authoredAtMs: BUILT_AT_MS,
      builds: [
        build(98),
        build(217, {
          maybeTag: Option.some('app/vakyume/0.1+217'),
          maybeTestflightInvite: Option.some(INVITE),
          maybeTestflightPage: Option.some(UPLOAD_PAGE),
          maybeTestflightVersion: Option.some('217.1'),
        }),
      ],
      repo: 'technoplato/scribe',
      sha: SHA,
      subject: 'Merge mic-bleed into main (#625)',
    }),
  ],
  foundIn: [build(96)],
})

describe('issues show says where an Issue landed', () => {
  it('prints the first build, how to get it, the build he found it in, and every commit', () => {
    expect(
      landingSection(FoundLanding.make({ landing }), 'America/New_York'),
    ).toEqual([
      '',
      'Landing',
      '  Landed in Scribe 0.1 (98), built 10-11 12:10',
      `  Get it: Scribe 0.1 (217), TestFlight 217.1 ${INVITE}, upload ${UPLOAD_PAGE}`,
      '  Found in Scribe 0.1 (96)',
      '  852f55fe9  technoplato/scribe  10-11 12:10  builds 98, 217  Merge mic-bleed into main (#625)',
    ])
  })

  it('prints nothing when nothing is known', () => {
    expect(
      landingSection(
        FoundLanding.make({
          landing: IssueLanding.make({ commits: [], foundIn: [] }),
        }),
        'America/New_York',
      ),
    ).toEqual([])
  })

  it('says a commit has no build yet', () => {
    expect(
      landingSection(
        FoundLanding.make({
          landing: IssueLanding.make({
            commits: [
              LandedCommit.make({
                authoredAtMs: BUILT_AT_MS,
                builds: [],
                repo: 'technoplato/foldkit',
                sha: SHA,
                subject: 'Work',
              }),
            ],
            foundIn: [],
          }),
        }),
        'America/New_York',
      ),
    ).toEqual([
      '',
      'Landing',
      '  Not in a build yet',
      '  852f55fe9  technoplato/foldkit  10-11 12:10  no build  Work',
    ])
  })

  it('says why when Scribe cannot be read, and the Issue still shows', () => {
    expect(
      landingSection(
        UnavailableLanding.make({
          reason: "Scribe's Instant app did not answer within 5 seconds.",
        }),
        'America/New_York',
      ),
    ).toEqual([
      '',
      "Landing not shown: Scribe's Instant app did not answer within 5 seconds.",
    ])
  })

  it('carries the landing in --json, or why it is not shown', () => {
    expect(landingJson(FoundLanding.make({ landing })).landing).toMatchObject({
      commits: [{ sha: SHA, builds: [{ number: 98 }, { number: 217 }] }],
      foundIn: [{ number: 96 }],
    })
    expect(
      landingJson(UnavailableLanding.make({ reason: 'no credentials' })),
    ).toEqual({ landingNotShown: 'no credentials' })
  })

  it('reads the edges that name the Issue, and answers within the bound', async () => {
    const asked: Array<unknown> = []
    const found = await Effect.runPromise(
      readLanding((query, _signal) => {
        asked.push(query)
        return Promise.resolve({
          edges: [
            {
              predicate: 'foundIn',
              issueNumber: 625,
              build: {
                builtAtMs: BUILT_AT_MS,
                marketingVersion: '0.1',
                number: 96,
                status: 'installed',
              },
            },
          ],
        })
      }, 625),
    )
    expect(asked).toMatchObject([
      { edges: { $: { where: { issueNumber: 625 } } } },
    ])
    expect(found).toMatchObject({
      _tag: 'FoundLanding',
      landing: { foundIn: [{ number: 96 }] },
    })
    const refused = await Effect.runPromise(
      readLanding(() => Promise.reject(new Error('Permission denied')), 625),
    )
    expect(refused).toEqual(
      UnavailableLanding.make({
        reason:
          "the landing query to Scribe's Instant app failed: Permission denied",
      }),
    )
    const unreadable = await Effect.runPromise(
      readLanding(() => Promise.resolve({ edges: 'no' }), 625),
    )
    expect(unreadable._tag).toBe('UnavailableLanding')
  })
})
