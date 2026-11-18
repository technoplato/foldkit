import { Array, Option } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import {
  BuildEntity,
  CommitEntity,
  type PageEntity,
  RecordingEntity,
  SegmentEntity,
} from './entityGraph.js'
import { modelForNavigation } from './init.js'
import {
  type PageFacts,
  buildFactsOf,
  commitFactsOf,
  normalizedCommitPrefix,
  recordingFactsOf,
  segmentFactsOf,
} from './issueLandings.js'
import {
  FailedObservePageFacts,
  ObservedIssues,
  ObservedPageFacts,
  TickedClock,
} from './message.js'
import { EntityPage, type Model } from './model.js'
import { issuesScreen } from './program.js'
import { update } from './update.js'

const NOW_MS = Date.parse('2026-11-01T14:00:00Z')
const BUILT_AT_MS = Date.parse('2026-10-30T14:00:00Z')
const COMMIT_SHA = '852f55fe95ec2790e5728c3391743b79bacecb7e'
const INVITE_URL = 'https://testflight.apple.com/join/AbCdEfGh'
const UPLOAD_PAGE_URL =
  'https://appstoreconnect.apple.com/apps/6798081814/testflight/ios/0aa11bb2-3c4d-5e6f-7a8b-9c0d1e2f3a4b'

const blank = (id: string, title: string): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: BUILT_AT_MS,
    details: '',
    evidenceLogQueries: [],
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P1',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'VerificationNeeded',
    successCriteria: [],
    title,
    updatedAtMs: BUILT_AT_MS,
    viewerURL: Option.none(),
    workLog: [],
  })

const catalog = [
  blank('625', 'A microphone final repeats a system-audio final'),
  blank('596', 'A shared picture keeps its location'),
  blank('041', 'Old defect'),
]

const storedBuild = {
  ascBuildURL: UPLOAD_PAGE_URL,
  builtAtMs: BUILT_AT_MS,
  commit: {
    sha: COMMIT_SHA,
    repo: 'technoplato/scribe',
    subject: 'Cut build 217',
    authoredAtMs: BUILT_AT_MS,
  },
  commitSha: COMMIT_SHA,
  edges: [
    {
      predicate: 'shippedIn',
      commit: {
        edges: [
          { predicate: 'implements', issueNumber: 625 },
          { predicate: 'shippedIn' },
        ],
      },
    },
    {
      predicate: 'shippedIn',
      commit: { edges: [{ predicate: 'implements', issueNumber: 625 }] },
    },
    { predicate: 'foundIn', issueNumber: 41 },
  ],
  installs: [
    {
      platform: 'iphone',
      deviceName: 'Michael’s iPhone',
      installedAtMs: BUILT_AT_MS + 1,
    },
  ],
  marketingVersion: '0.1',
  notes: 'Cut known from the tag.',
  number: 217,
  status: 'installed',
  tag: 'app/vakyume/0.1+217',
  taggedAtMs: BUILT_AT_MS + 2,
  testflightJoinURL: INVITE_URL,
  testflightVersion: '217.1',
  whatsNewJSON: JSON.stringify({
    formatVersion: 1,
    number: 217,
    status: 'on main, 2026-10-30',
    stories: [
      {
        text: 'Now when you share a picture from Scribe, it sends a fresh copy.',
        note: '#596',
        issues: [{ number: 596, url: 'https://issues.invalid/issues/596' }],
      },
    ],
  }),
}

const storedCommit = {
  authoredAtMs: BUILT_AT_MS,
  edges: [
    { predicate: 'implements', issueNumber: 625 },
    { predicate: 'implements', issueNumber: 41 },
    {
      predicate: 'shippedIn',
      build: {
        builtAtMs: BUILT_AT_MS,
        marketingVersion: '0.1',
        number: 217,
        status: 'installed',
      },
    },
  ],
  repo: 'technoplato/scribe',
  sha: COMMIT_SHA,
  subject: 'Merge mic-bleed into main (#625)',
}

const pageOf = (entity: PageEntity, facts: PageFacts): Model =>
  [
    ObservedIssues.make({ issues: catalog }),
    TickedClock.make({ nowMs: NOW_MS, timeZone: 'America/New_York' }),
    ObservedPageFacts.make({ entity, facts }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(EntityPage.make({ entity })),
  )

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const chipsOf = (model: Model): ReadonlyArray<ReferencePart> =>
  Array.flatMap(textsOf(issuesScreen(model)), text =>
    Array.filter(
      text.parts ?? [],
      (part): part is ReferencePart => part._tag === 'Reference',
    ),
  )

describe('a build’s page, from Scribe’s rows', () => {
  const entity = BuildEntity.make({ number: '217' })
  const facts = buildFactsOf({ builds: [storedBuild] })

  it('names the build, when, its tag and how to get it', () => {
    const model = pageOf(entity, facts)
    const contents = contentsOf(model)
    expect(contents).toContain('Scribe 0.1 (217)')
    expect(contents).toContainEqual(expect.stringContaining('2026-10-30 10:00'))
    expect(contents).toContainEqual(
      expect.stringContaining('app/vakyume/0.1+217'),
    )
    const chips = chipsOf(model)
    expect(
      chips.some(
        chip => chip.label === 'TestFlight 217.1' && chip.href === INVITE_URL,
      ),
    ).toBe(true)
    expect(
      chips.some(
        chip => chip.label === 'Upload 217.1' && chip.href === UPLOAD_PAGE_URL,
      ),
    ).toBe(true)
  })

  it('lists each Issue that shipped in it once, and those found in it', () => {
    const contents = contentsOf(pageOf(entity, facts))
    expect(contents).toContain('Shipped in this build: 1 Issue')
    expect(contents).toContainEqual(
      expect.stringContaining(
        '#625 A microphone final repeats a system-audio final',
      ),
    )
    expect(contents).toContain('Found in this build: 1 Issue')
    expect(contents).toContainEqual(expect.stringContaining('#041 Old defect'))
  })

  it('shows its What’s New words with their Issues as chips', () => {
    const contents = contentsOf(pageOf(entity, facts))
    expect(contents).toContain('What’s New')
    expect(contents).toContainEqual(
      expect.stringContaining(
        'Now when you share a picture from Scribe, it sends a fresh copy.',
      ),
    )
    expect(contents).toContainEqual(
      expect.stringContaining('#596 A shared picture keeps its location'),
    )
  })

  it('links its cut commit and lists the devices it is on', () => {
    const model = pageOf(entity, facts)
    expect(
      chipsOf(model).some(
        chip =>
          chip.kind === 'Commit' &&
          chip.label === '852f55fe9' &&
          chip.href === `/commits/${COMMIT_SHA}`,
      ),
    ).toBe(true)
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('Michael’s iPhone'),
    )
  })

  it('says when Scribe’s rows hold no such build', () => {
    const model = pageOf(entity, buildFactsOf({ builds: [] }))
    expect(contentsOf(model)).toContain('Scribe’s rows hold no such build.')
  })

  it('says why when the rows could not be read, and keeps the links from text', () => {
    const [failed] = update(
      pageOf(entity, facts),
      FailedObservePageFacts.make({ entity, reason: 'Permission denied' }),
    )
    expect(contentsOf(failed)).toContain(
      'Scribe’s rows could not be read: Permission denied',
    )
    expect(contentsOf(failed)).toContainEqual(
      expect.stringContaining('Build 217'),
    )
  })

  it('ignores the facts of a page no longer open', () => {
    const [ignored] = update(
      modelForNavigation(
        EntityPage.make({ entity: BuildEntity.make({ number: '98' }) }),
      ),
      ObservedPageFacts.make({ entity, facts }),
    )
    expect(ignored.pageFacts._tag).toBe('NotObservingPageFacts')
  })
})

describe('a commit’s page, from Scribe’s rows', () => {
  const entity = CommitEntity.make({ sha: '852f55fe9' })
  const facts = commitFactsOf({ commits: [storedCommit] })

  it('shows its words, the Issues it implements and the builds it shipped in', () => {
    const model = pageOf(entity, facts)
    const contents = contentsOf(model)
    expect(contents).toContain('Merge mic-bleed into main (#625)')
    expect(contents).toContainEqual(
      expect.stringContaining(
        '#625 A microphone final repeats a system-audio final',
      ),
    )
    expect(contents).toContainEqual(expect.stringContaining('#041 Old defect'))
    expect(
      chipsOf(model).some(
        chip =>
          chip.label === 'Scribe 0.1 (217)' && chip.href === '/builds/217',
      ),
    ).toBe(true)
  })
})

describe('a commit prefix', () => {
  it('reads only what can begin a commit id', () => {
    expect(normalizedCommitPrefix('852F55FE9')).toEqual(
      Option.some('852f55fe9'),
    )
    expect(normalizedCommitPrefix('not-a-sha')).toEqual(Option.none())
    expect(normalizedCommitPrefix('abc')).toEqual(Option.none())
  })
})

describe('a Recording’s and a line’s page, from Scribe’s rows', () => {
  const RECORDING_ID = '44b6f249-8e0a-4cb6-b54e-4d1a1100d6b3'
  const SEGMENT_ID = '3b594390-41f9-4dab-ae61-eaa13c30c721'

  it('names a Recording, when it started, how long it ran, and links his words', () => {
    const entity = RecordingEntity.make({ recordingId: RECORDING_ID })
    const model = pageOf(
      entity,
      recordingFactsOf({
        recordings: [
          {
            id: RECORDING_ID,
            title: 'Recording 322',
            startedAtMs: BUILT_AT_MS,
            durationSeconds: 32_243.008,
          },
        ],
      }),
    )
    const contents = contentsOf(model)
    expect(contents).toContain('Recording 322')
    expect(contents).toContainEqual(
      expect.stringContaining('Started 2026-10-30 10:00'),
    )
    expect(contents).toContainEqual(expect.stringContaining('8 h 57 min'))
    expect(
      chipsOf(model).some(
        chip =>
          chip.kind === 'Recording' &&
          chip.href ===
            `https://words.pisspoursoftware.xyz/recording/${RECORDING_ID}`,
      ),
    ).toBe(true)
  })

  it('shows a line’s words and links them at their exact time', () => {
    const entity = SegmentEntity.make({ segmentId: SEGMENT_ID })
    const model = pageOf(
      entity,
      segmentFactsOf({
        transcriptionSegments: [
          {
            id: SEGMENT_ID,
            recordingID: RECORDING_ID,
            segmentIndex: 2_735,
            startTimeSeconds: 6_147.42,
            text: 'the issues project itself is a project',
            wallClockStartedAtMs: BUILT_AT_MS,
          },
        ],
      }),
    )
    const contents = contentsOf(model)
    expect(contents).toContainEqual(
      expect.stringContaining('the issues project itself is a project'),
    )
    expect(contents).toContainEqual(
      expect.stringContaining('Said 2026-10-30 10:00'),
    )
    expect(
      chipsOf(model).some(
        chip =>
          chip.kind === 'Segment' &&
          chip.href ===
            `https://words.pisspoursoftware.xyz/recording/${RECORDING_ID}/section/${SEGMENT_ID}?t=6147.42`,
      ),
    ).toBe(true)
    expect(
      chipsOf(model).some(
        chip =>
          chip.kind === 'Recording' &&
          chip.href === `/recordings/${RECORDING_ID}`,
      ),
    ).toBe(true)
  })

  it('says a line’s words are sealed rather than showing none', () => {
    const entity = SegmentEntity.make({ segmentId: SEGMENT_ID })
    const model = pageOf(
      entity,
      segmentFactsOf({
        transcriptionSegments: [
          {
            id: SEGMENT_ID,
            recordingID: RECORDING_ID,
            segmentIndex: 7,
            startTimeSeconds: 1,
            text: '',
            wallClockStartedAtMs: BUILT_AT_MS,
            wordsSeal: 'voice',
          },
        ],
      }),
    )
    expect(contentsOf(model)).toContain('These words are sealed.')
  })
})
