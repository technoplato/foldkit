import { Array, Option } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  ConversationReference,
  Issue,
  IssueMention,
  IssueWorkInProgress,
  IssueWorkLogEntry,
  RecordingMention,
  RecordingReference,
  UriReference,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { IssueLanding, LandedBuild, LandedCommit } from './issueLandings.js'
import {
  FailedObserveIssueLanding,
  ObservedIssue,
  ObservedIssueLanding,
  ObservedIssues,
  TickedClock,
} from './message.js'
import { IssueDetail, type Model } from './model.js'
import { issuesScreen } from './program.js'
import { timelineOf } from './timeline.js'
import { update } from './update.js'

const RECORDING_ID = '9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f'
const SECTION_ID = '1bbe1ef8-2c3d-4e5f-8a9b-0c1d2e3f4a5b'
const WORDS_URL = `https://words.pisspoursoftware.xyz/recording/${RECORDING_ID}/section/${SECTION_ID}?t=3247.50`
const MINUTE_MS = 60_000
const SAID_AT_MS = Date.parse('2026-10-30T12:57:27Z')
const NOW_MS = Date.parse('2026-11-01T14:00:00Z')

const blank = (id: string, title: string): Issue =>
  Issue.make({
    area: Option.some('Issues CLI / performance'),
    attachments: [],
    claimantId: Option.some('claude-code/heat-1395@max'),
    complexity: Option.none(),
    createdAtMs: SAID_AT_MS + 3 * MINUTE_MS,
    details: '',
    evidenceLogQueries: [],
    id,
    issueType: Option.some('defect'),
    mentions: [],
    priority: 'P1',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'VerificationNeeded',
    successCriteria: [],
    title,
    updatedAtMs: NOW_MS - 2 * 60 * MINUTE_MS,
    viewerURL: Option.none(),
    workLog: [],
  })

const entry = (
  minutesAfterSaid: number,
  state: string,
  summary: string,
): IssueWorkLogEntry =>
  IssueWorkLogEntry.make({
    agentId: Option.some('claude-code/heat-1395@max'),
    commitSha: Option.none(),
    durationSeconds: Option.none(),
    id: `work-1395-${state}-${minutesAfterSaid.toString()}`,
    occurredAtMs: SAID_AT_MS + minutesAfterSaid * MINUTE_MS,
    state: Option.some(state),
    summary,
  })

const asked = Issue.make({
  ...blank('1395', 'The phone runs hot while recording'),
  details: 'Measured after #1358 shipped: the phone heats while it records.',
  mentions: [
    IssueMention.make({
      capturedAtMs: Option.some(SAID_AT_MS),
      directQuote: Option.some(
        `Recording 326 (${RECORDING_ID}) #102: my phone is getting hot again while it records`,
      ),
      id: 'mention-1395-1',
      issueId: '1395',
      related: [UriReference.make({ value: WORDS_URL })],
      reporter: Option.none(),
      source: RecordingReference.make({
        recording: RecordingMention.make({
          endMilliseconds: Option.none(),
          recordingId: RECORDING_ID,
          screenshotIds: [],
          startMilliseconds: 3_247_500,
        }),
      }),
    }),
    IssueMention.make({
      capturedAtMs: Option.some(SAID_AT_MS + 600 * MINUTE_MS),
      directQuote: Option.some('Still hot after the fix'),
      id: 'mention-1395-2',
      issueId: '1395',
      related: [],
      reporter: Option.none(),
      source: ConversationReference.make({
        conversation: {
          harness: 'claude-code',
          note: 'Typed in the Claude chat.',
          sessionId: 'c863fc6a-1b2c-4d3e-8f9a-0b1c2d3e4f5a',
          typedAtMs: SAID_AT_MS + 600 * MINUTE_MS,
        },
      }),
    }),
  ],
  workLog: [
    entry(3, 'filed', 'Filed from Recording 326 #102.'),
    entry(4, 'claimed', 'Claimed by claude-code/heat-1395@max.'),
    entry(64, 'progress', 'Red 718e55ec5: the heat probe fails at 41 C.'),
    entry(
      130,
      'progress',
      'Green 9be70b4a8: recording keeps the phone under 38 C.',
    ),
    entry(
      250,
      'landed',
      'Landed on main 8fc12c548 for build 214 (red 718e55ec5, green 9be70b4a8).',
    ),
    entry(400, 'progress', 'Shipped in build 214; installed on his iPhone.'),
  ],
  workInProgress: Option.some(
    IssueWorkInProgress.make({
      activity: { _tag: 'Active' },
      agentId: Option.some('claude-code/heat-1395@max'),
      branch: Option.some('agent/claude/heat-1395'),
      commitSha: Option.some('8fc12c548'),
      landingState: 'Shipped',
      lastStep: Option.some('Shipped in build 214'),
      repository: Option.some('realtime-voice'),
      targetBuild: Option.some('214'),
      updatedAtMs: SAID_AT_MS + 400 * MINUTE_MS,
      worktree: Option.none(),
    }),
  ),
})

const pointing = Issue.make({
  ...blank('1400', 'Heat budget for long recordings'),
  details: 'Follows #1395.',
})

const catalog = [blank('1358', 'issues CLI burns CPU'), asked, pointing]

const pageOf = (issue: Issue): Model =>
  [
    ObservedIssues.make({ issues: catalog }),
    ObservedIssue.make({ issue: Option.some(issue), issueId: issue.id }),
    TickedClock.make({ nowMs: NOW_MS, offsetMinutes: -300 }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(IssueDetail.make({ issueId: issue.id })),
  )

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

describe('an ask’s timeline', () => {
  it('reads each step from the mentions and the work log, with the time each took', () => {
    expect(
      Array.map(timelineOf(asked), step => [
        step.name,
        Option.getOrElse(step.maybeTookLabel, () => ''),
      ]),
    ).toEqual([
      ['Asked', ''],
      ['Filed', '3 min'],
      ['Claimed', '1 min'],
      ['Red', '1 h'],
      ['Green', '1 h 6 min'],
      ['Merged', '2 h'],
      ['Built', '2 h 30 min'],
    ])
  })

  it('reads one step from each work-log entry: a plan landed on main is planned, not merged', () => {
    const planned = Issue.make({
      ...blank('1538', 'The issues site as usable as Linear'),
      workLog: [
        entry(
          20,
          'progress',
          'model=claude-opus-5-5 Plan landed on Scribe main 2a2fe8741 (plan commit 307ce29b8).',
        ),
      ],
    })
    expect(Array.map(timelineOf(planned), step => step.name)).toEqual([
      'Filed',
      'Planned',
    ])
  })

  it('starts at filing when no one said or typed it', () => {
    expect(Array.map(timelineOf(pointing), step => step.name)).toEqual([
      'Filed',
    ])
  })
})

const COMMIT_SHA = '852f55fe95ec2790e5728c3391743b79bacecb7e'
const INVITE_URL = 'https://testflight.apple.com/join/AbCdEfGh'
const UPLOAD_PAGE_URL =
  'https://appstoreconnect.apple.com/apps/6798081814/testflight/ios/0aa11bb2-3c4d-5e6f-7a8b-9c0d1e2f3a4b'

const landedBuild = (
  number: number,
  fields: Partial<LandedBuild> = {},
): LandedBuild =>
  LandedBuild.make({
    builtAtMs: SAID_AT_MS + number * 60 * MINUTE_MS,
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
      authoredAtMs: SAID_AT_MS + 200 * MINUTE_MS,
      builds: [
        landedBuild(214),
        landedBuild(217, {
          maybeTag: Option.some('app/vakyume/0.1+217'),
          maybeTaggedAtMs: Option.some(SAID_AT_MS + 900 * MINUTE_MS),
          maybeTestflightInvite: Option.some(INVITE_URL),
          maybeTestflightPage: Option.some(UPLOAD_PAGE_URL),
          maybeTestflightVersion: Option.some('217.1'),
        }),
      ],
      repo: 'technoplato/scribe',
      sha: COMMIT_SHA,
      subject: 'Merge heat-1395 into main (#1395)',
    }),
  ],
  foundIn: [landedBuild(212)],
})

const pageWithLanding = (): Model => {
  const [withLanding] = update(
    pageOf(asked),
    ObservedIssueLanding.make({ issueId: '1395', landing }),
  )
  return withLanding
}

const chipsOf = (model: Model): ReadonlyArray<ReferencePart> =>
  Array.flatMap(textsOf(issuesScreen(model)), text =>
    Array.filter(
      text.parts ?? [],
      (part): part is ReferencePart => part._tag === 'Reference',
    ),
  )

describe('where an Issue landed, on its page', () => {
  it('says which build it landed in, when, and links the build', () => {
    const chips = chipsOf(pageWithLanding())
    expect(
      chips.some(
        chip =>
          chip.kind === 'Build' &&
          chip.label === 'Scribe 0.1 (214)' &&
          chip.href === '/builds/214',
      ),
    ).toBe(true)
    expect(contentsOf(pageWithLanding())).toContainEqual(
      expect.stringContaining('Landed in Scribe 0.1 (214)'),
    )
  })

  it('says how to get that build: the TestFlight invite and the upload’s page', () => {
    const chips = chipsOf(pageWithLanding())
    expect(
      chips.some(
        chip =>
          chip.kind === 'TestFlight' &&
          chip.label === 'TestFlight 217.1' &&
          chip.href === INVITE_URL,
      ),
    ).toBe(true)
    expect(
      chips.some(
        chip => chip.label === 'Upload 217.1' && chip.href === UPLOAD_PAGE_URL,
      ),
    ).toBe(true)
  })

  it('says the build he found it in', () => {
    const chips = chipsOf(pageWithLanding())
    expect(
      chips.some(chip => chip.kind === 'Build' && chip.href === '/builds/212'),
    ).toBe(true)
    expect(contentsOf(pageWithLanding())).toContainEqual(
      expect.stringContaining('Found in Scribe 0.1 (212)'),
    )
  })

  it('lists every commit that implements it, as a chip with its words', () => {
    const chips = chipsOf(pageWithLanding())
    expect(
      chips.some(
        chip =>
          chip.kind === 'Commit' &&
          chip.label === '852f55fe9' &&
          chip.title === 'Merge heat-1395 into main (#1395)' &&
          chip.href === `/commits/${COMMIT_SHA}`,
      ),
    ).toBe(true)
  })

  it('adds the build and TestFlight steps to the timeline, read from the rows', () => {
    const steps = timelineOf(asked, landing)
    expect(
      Array.map(
        Array.filter(
          steps,
          step => step.name === 'Built' || step.name === 'OnTestFlight',
        ),
        step => [step.name, step.atMs],
      ),
    ).toEqual([
      ['Built', SAID_AT_MS + 214 * 60 * MINUTE_MS],
      ['OnTestFlight', SAID_AT_MS + 900 * MINUTE_MS],
    ])
  })

  it('says why when the rows could not be read, and keeps the page', () => {
    const [failed] = update(
      pageOf(asked),
      FailedObserveIssueLanding.make({
        issueId: '1395',
        reason: 'Permission denied',
      }),
    )
    const contents = contentsOf(failed)
    expect(contents).toContain(
      'Where this Issue landed could not be read: Permission denied',
    )
    expect(contents).toContain('The phone runs hot while recording')
  })

  it('ignores the landing of an Issue no longer open', () => {
    const [ignored] = update(
      pageOf(asked),
      ObservedIssueLanding.make({ issueId: '1', landing }),
    )
    expect(ignored.issueLanding._tag).toBe('NotObservingIssueLanding')
  })
})

describe('the Issue page at a glance', () => {
  it('says who asked, in which words, when, and links the line at its time', () => {
    const contents = contentsOf(pageOf(asked))
    expect(contents).toContain('my phone is getting hot again while it records')
    expect(contents).toContainEqual(
      expect.stringContaining('Michael said it in Recording 326 #102'),
    )
    expect(contents).toContainEqual(expect.stringContaining('2026-10-30 07:57'))
    expect(contents).toContainEqual(expect.stringContaining('and 1 more time'))
  })

  it('says which app, where the work landed, and the build', () => {
    const contents = contentsOf(pageOf(asked))
    expect(contents).toContainEqual(expect.stringContaining('Scribe'))
    expect(contents).toContainEqual(
      expect.stringContaining('Shipped for build 214  at 8fc12c548'),
    )
    expect(contents).toContainEqual(
      expect.stringContaining('Asked → Filed 3 min → Claimed 1 min → Red 1 h'),
    )
  })

  it('shows Issue numbers in its text as chips and lists the Issues pointing at it', () => {
    const contents = contentsOf(pageOf(asked))
    expect(contents).toContainEqual(
      expect.stringContaining(
        '#1358 issues CLI burns CPU [VerificationNeeded]',
      ),
    )
    expect(contents).toContain('Pointed at by')
    expect(contents).toContainEqual(
      expect.stringContaining('#1400 Heat budget for long recordings'),
    )
  })
})

describe('an unchanged Issue keeps its timeline', () => {
  it('reads the work log once while the Issue and its landing stay the same', () => {
    const issue = Issue.make({
      area: Option.none(),
      attachments: [],
      claimantId: Option.none(),
      complexity: Option.none(),
      createdAtMs: 1_000,
      details: '',
      id: '700',
      issueType: Option.none(),
      mentions: [],
      priority: 'P2',
      product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
      projectId: Option.none(),
      reportedDate: Option.none(),
      sourceDocument: Option.none(),
      status: 'Open',
      successCriteria: [],
      title: 'A timeline',
      updatedAtMs: 1_000,
      viewerURL: Option.none(),
      workLog: [],
    })
    expect(timelineOf(issue)).toBe(timelineOf(issue))
  })
})

