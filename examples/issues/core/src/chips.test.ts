import { Array, Option } from 'effect'
import { type ReferencePart } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueMention,
  RecordingMention,
  RecordingReference,
  UriReference,
} from '@foldkit/instant-tools/issues'

import { chipContextOf, partsOfText } from './chips.js'
import { howLongAgo, localTimeLabel } from './clock.js'
import { LandedBuild, LandedCommit } from './issueLandings.js'

const RECORDING_ID = 'faa684c2-34e4-47e5-8f9b-3b2196da9463'
const SECTION_ID = '8d70b597-a775-41d8-b688-a08f722a87b2'
const WORDS_URL = `https://words.pisspoursoftware.xyz/recording/${RECORDING_ID}/section/${SECTION_ID}?t=14287.00`
const NOW_MS = Date.parse('2026-11-01T14:00:00Z')
const HOUR_MS = 3_600_000
const EASTERN_OFFSET_MINUTES = -300

const issue = (id: string, title: string, status: Issue['status']): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: NOW_MS - 72 * HOUR_MS,
    details: '',
    evidenceLogQueries: [],
    id,
    issueType: Option.some('defect'),
    mentions: [],
    priority: 'P2',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status,
    successCriteria: [],
    title,
    updatedAtMs: NOW_MS - 2 * HOUR_MS,
    viewerURL: Option.none(),
    workLog: [],
  })

const asked = Issue.make({
  ...issue('1400', 'Asked in Recording 208', 'Open'),
  mentions: [
    IssueMention.make({
      capturedAtMs: Option.some(NOW_MS - 24 * HOUR_MS),
      directQuote: Option.some(
        `Recording 208 (${RECORDING_ID}) #2735: the issues project itself is a project`,
      ),
      id: 'mention-1400-1',
      issueId: '1400',
      related: [UriReference.make({ value: WORDS_URL })],
      reporter: Option.none(),
      source: RecordingReference.make({
        recording: RecordingMention.make({
          endMilliseconds: Option.none(),
          recordingId: RECORDING_ID,
          screenshotIds: [],
          startMilliseconds: 14_287_000,
        }),
      }),
    }),
  ],
})

const catalog = [issue('1358', 'issues CLI burns CPU', 'PartiallyDone'), asked]
const context = chipContextOf(catalog, NOW_MS, EASTERN_OFFSET_MINUTES)

const referencesOf = (text: string): ReadonlyArray<ReferencePart> =>
  Array.flatMap(partsOfText(text, context), part =>
    part._tag === 'Reference' ? [part] : [],
  )

describe('how long ago', () => {
  it('reads a time as how long ago it was, and its local time', () => {
    expect(howLongAgo(NOW_MS - 30_000, NOW_MS)).toBe('just now')
    expect(howLongAgo(NOW_MS - 5 * 60_000, NOW_MS)).toBe('5 min ago')
    expect(howLongAgo(NOW_MS - 3 * HOUR_MS, NOW_MS)).toBe('3 h ago')
    expect(howLongAgo(NOW_MS - 50 * HOUR_MS, NOW_MS)).toBe('2 days ago')
    expect(howLongAgo(NOW_MS - 24 * HOUR_MS, NOW_MS)).toBe('1 day ago')
    expect(howLongAgo(NOW_MS - 90 * 24 * HOUR_MS, NOW_MS)).toBe('3 months ago')
    expect(localTimeLabel(NOW_MS, EASTERN_OFFSET_MINUTES)).toBe(
      '2026-11-01 09:00',
    )
  })
})

describe('chips', () => {
  it('shows an Issue number as a chip with its title and state', () => {
    const [chip] = referencesOf('Fixed by #1358.')
    expect(chip).toMatchObject({
      label: '#1358',
      title: 'issues CLI burns CPU',
      state: 'PartiallyDone',
      kind: 'Issue',
      href: '/issues/1358',
    })
    expect(chip?.detail).toContain('P2 defect in Scribe, updated 2 h ago')
  })

  it('leaves a number no Issue holds as plain words', () => {
    expect(referencesOf('Not an Issue: #9999.')).toEqual([])
  })

  it('shows a words link as its Recording, time and words, linked at the exact time', () => {
    const [chip] = referencesOf(`He said it: ${WORDS_URL}`)
    expect(chip).toMatchObject({
      label: 'Recording 208 at 3:58:07',
      kind: 'Segment',
      href: WORDS_URL,
    })
    expect(chip?.detail).toContain('the issues project itself is a project')
  })

  it('links a Recording line to its words when a mention gave its link', () => {
    const [chip] = referencesOf('Said in Recording 208 #2735.')
    expect(chip).toMatchObject({
      label: 'Recording 208 #2735',
      kind: 'Segment',
      href: WORDS_URL,
    })
  })

  it('links a Recording without a known line to its page', () => {
    const [chip] = referencesOf('All of Recording 208.')
    expect(chip).toMatchObject({
      label: 'Recording 208',
      kind: 'Recording',
      href: `/recordings/${RECORDING_ID}`,
    })
  })

  it('shows commits, agents, builds, times, ids and links as chips, never raw', () => {
    const chips = referencesOf(
      'Green 6ff20758d by claude-code/issues-linear-1538@ld for build 218 at 2026-11-01T12:00:00Z; message 82fc7bc4-3fb8-47f9-93de-90ec9d004131; saved ~/Sync/audit/issues-cpu-1358/RESULTS.md; see https://www.instantdb.com/docs/auth.',
    )
    expect(
      Array.map(chips, chip => [chip.kind, chip.label, chip.href ?? '']),
    ).toEqual([
      ['Commit', '6ff20758d', '/commits/6ff20758d'],
      [
        'Agent',
        'issues-linear-1538@ld',
        '/agents/claude-code%2Fissues-linear-1538%40ld',
      ],
      ['Build', 'Build 218', '/builds/218'],
      ['Time', '2 h ago', ''],
      ['Id', '82fc7bc4', ''],
      ['File', 'issues-cpu-1358/RESULTS.md', ''],
      [
        'Link',
        'instantdb.com/docs/auth',
        'https://www.instantdb.com/docs/auth',
      ],
    ])
  })
})

describe('a build or commit chip, from Scribe’s rows', () => {
  const build217 = LandedBuild.make({
    builtAtMs: NOW_MS - 48 * HOUR_MS,
    marketingVersion: '0.1',
    maybeTag: Option.some('app/vakyume/0.1+217'),
    maybeTaggedAtMs: Option.some(NOW_MS - 40 * HOUR_MS),
    maybeTestflightInvite: Option.none(),
    maybeTestflightPage: Option.none(),
    maybeTestflightVersion: Option.some('217.1'),
    number: 217,
    status: 'installed',
  })
  const commit = LandedCommit.make({
    authoredAtMs: NOW_MS - 50 * HOUR_MS,
    builds: [build217],
    repo: 'technoplato/scribe',
    sha: '852f55fe95ec2790e5728c3391743b79bacecb7e',
    subject: 'Merge mic-bleed into main (#625)',
  })
  const context = chipContextOf([], NOW_MS, EASTERN_OFFSET_MINUTES, {
    agents: [],
    builds: [build217],
    commits: [commit],
    features: [],
  })
  const chipsOf = (text: string): ReadonlyArray<ReferencePart> =>
    Array.filter(
      partsOfText(text, context),
      (part): part is ReferencePart => part._tag === 'Reference',
    )

  it('gives a build in text its version, state, when and TestFlight number', () => {
    const [chip] = chipsOf('Landed in build 217 this morning.')
    expect(chip).toMatchObject({
      label: 'Build 217',
      title: 'Scribe 0.1',
      state: 'installed',
      kind: 'Build',
      href: '/builds/217',
    })
    expect(chip?.detail?.join(' ')).toContain('app/vakyume/0.1+217')
    expect(chip?.detail?.join(' ')).toContain('TestFlight 217.1')
  })

  it('reads TestFlight’s number for a build, 217.1 is build 217', () => {
    const [chip] = chipsOf('On build 217.1 now.')
    expect(chip).toMatchObject({ title: 'Scribe 0.1', state: 'installed' })
  })

  it('leaves a build it does not know as its number', () => {
    const [chip] = chipsOf('Next is build 300.')
    expect(chip).toMatchObject({ label: 'Build 300', href: '/builds/300' })
    expect(chip?.title).toBeUndefined()
  })

  it('gives a commit in text its words when the page knows it', () => {
    const [chip] = chipsOf('Landed on main 852f55fe9 today.')
    expect(chip).toMatchObject({
      kind: 'Commit',
      title: 'Merge mic-bleed into main (#625)',
    })
  })
})
