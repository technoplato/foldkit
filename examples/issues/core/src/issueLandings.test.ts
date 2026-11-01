import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  buildLabel,
  firstLandedBuild,
  firstTestflightBuild,
  issueLandingOf,
} from './issueLandings.js'

const COMMIT_SHA = '852f55fe95ec2790e5728c3391743b79bacecb7e'
const JOIN_URL = 'https://testflight.apple.com/join/AbCdEfGh'
const PAGE_URL =
  'https://appstoreconnect.apple.com/apps/6798081814/testflight/ios/0aa11bb2-3c4d-5e6f-7a8b-9c0d1e2f3a4b'

const storedBuild = (number: number, fields: object = {}) => ({
  id: `build-${number.toString()}`,
  number,
  marketingVersion: '0.1',
  builtAtMs: 1_791_727_856_000 + number,
  status: 'installed',
  ...fields,
})

const stored = {
  edges: [
    {
      predicate: 'implements',
      issueNumber: 625,
      commit: {
        sha: COMMIT_SHA,
        repo: 'technoplato/scribe',
        subject: 'Merge mic-bleed into main (#625)',
        authoredAtMs: 1_791_711_809_000,
        edges: [
          { predicate: 'shippedIn', build: storedBuild(98) },
          {
            predicate: 'shippedIn',
            build: storedBuild(201, {
              tag: 'app/vakyume/0.1+201',
              taggedAtMs: 1_793_000_000_000,
              testflightVersion: '201',
              ascBuildURL: PAGE_URL,
              testflightJoinURL: JOIN_URL,
            }),
          },
          { predicate: 'implements' },
        ],
      },
    },
    {
      predicate: 'foundIn',
      issueNumber: 625,
      build: storedBuild(96),
    },
    { predicate: 'relatesTo', issueNumber: 625 },
  ],
}

describe('where an Issue landed, read from Scribe’s rows', () => {
  it('reads its commits, the builds each shipped in, and the build he found it in', () => {
    const landing = issueLandingOf(stored)
    expect(landing.commits.map(commit => commit.sha)).toEqual([COMMIT_SHA])
    expect(
      landing.commits.flatMap(commit =>
        commit.builds.map(build => build.number),
      ),
    ).toEqual([98, 201])
    expect(landing.foundIn.map(build => build.number)).toEqual([96])
  })

  it('names the first build it landed in and the first TestFlight build', () => {
    const landing = issueLandingOf(stored)
    expect(Option.map(firstLandedBuild(landing), buildLabel)).toEqual(
      Option.some('Scribe 0.1 (98)'),
    )
    const maybeTestflight = firstTestflightBuild(landing)
    expect(Option.map(maybeTestflight, build => build.number)).toEqual(
      Option.some(201),
    )
    expect(
      Option.flatMap(maybeTestflight, build => build.maybeTestflightInvite),
    ).toEqual(Option.some(JOIN_URL))
    expect(
      Option.flatMap(maybeTestflight, build => build.maybeTestflightPage),
    ).toEqual(Option.some(PAGE_URL))
  })

  it('reads a link Instant returns as one row or as a list of one', () => {
    const asLists = {
      edges: [
        {
          predicate: 'foundIn',
          issueNumber: 625,
          build: [storedBuild(96)],
        },
        {
          predicate: 'implements',
          issueNumber: 625,
          commit: [
            {
              sha: COMMIT_SHA,
              repo: 'technoplato/scribe',
              subject: 'Merge mic-bleed into main (#625)',
              authoredAtMs: 1_791_711_809_000,
              edges: [{ predicate: 'shippedIn', build: [storedBuild(98)] }],
            },
          ],
        },
      ],
    }
    const landing = issueLandingOf(asLists)
    expect(landing.foundIn.map(build => build.number)).toEqual([96])
    expect(landing.commits[0]?.builds.map(build => build.number)).toEqual([98])
  })

  it('keeps each commit and build once, oldest commit first and lowest build first', () => {
    const repeated = {
      edges: [
        {
          predicate: 'implements',
          issueNumber: 625,
          commit: {
            sha: 'b'.repeat(40),
            repo: 'technoplato/scribe',
            subject: 'second',
            authoredAtMs: 2,
            edges: [
              { predicate: 'shippedIn', build: storedBuild(201) },
              { predicate: 'shippedIn', build: storedBuild(98) },
              { predicate: 'shippedIn', build: storedBuild(98) },
            ],
          },
        },
        {
          predicate: 'implements',
          issueNumber: 625,
          commit: {
            sha: 'a'.repeat(40),
            repo: 'technoplato/scribe',
            subject: 'first',
            authoredAtMs: 1,
            edges: [],
          },
        },
        {
          predicate: 'implements',
          issueNumber: 625,
          commit: {
            sha: 'a'.repeat(40),
            repo: 'technoplato/scribe',
            subject: 'first',
            authoredAtMs: 1,
            edges: [],
          },
        },
      ],
    }
    const landing = issueLandingOf(repeated)
    expect(landing.commits.map(commit => commit.subject)).toEqual([
      'first',
      'second',
    ])
    expect(landing.commits[1]?.builds.map(build => build.number)).toEqual([
      98, 201,
    ])
  })

  it('has no first build while no commit shipped, and no TestFlight build before one', () => {
    const notShipped = issueLandingOf({
      edges: [
        {
          predicate: 'implements',
          issueNumber: 1538,
          commit: {
            sha: COMMIT_SHA,
            repo: 'technoplato/foldkit',
            subject: 'Work in progress',
            authoredAtMs: 1,
            edges: [],
          },
        },
      ],
    })
    expect(Option.isNone(firstLandedBuild(notShipped))).toBe(true)
    expect(Option.isNone(firstTestflightBuild(notShipped))).toBe(true)
    const deviceOnly = issueLandingOf({
      edges: [
        {
          predicate: 'implements',
          issueNumber: 625,
          commit: {
            sha: COMMIT_SHA,
            repo: 'technoplato/scribe',
            subject: 'Merge',
            authoredAtMs: 1,
            edges: [{ predicate: 'shippedIn', build: storedBuild(98) }],
          },
        },
      ],
    })
    expect(Option.isNone(firstTestflightBuild(deviceOnly))).toBe(true)
  })
})
