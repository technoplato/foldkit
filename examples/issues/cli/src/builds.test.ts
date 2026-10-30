import { Array, Duration, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { InstantAPIError } from '@instantdb/admin'

import {
  BuildJob,
  FoundBuildJobs,
  UnavailableBuildJobs,
  type UnreadableBuildJob,
  buildJobsJson,
  buildJobsQuery,
  buildJobsSection,
  durationText,
  readBuildJobs,
  shownBuildJobsLimit,
} from './builds.js'

const newYork = 'America/New_York'

const at = (localTime: string): number =>
  Date.parse(`2026-10-30T${localTime}-04:00`)

const nowMs = at('12:20:00')

const run = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect)

const passedOnTheMini = BuildJob.make({
  agent: 'build-sh-1412',
  endedAtMs: at('12:16:30'),
  exitCode: 0,
  heartbeatAtMs: at('12:16:30'),
  id: 'job-measure',
  issueNumber: 1412,
  label: 'measure-1412-cold',
  machine: 'mini',
  queuedAtMs: at('12:06:00'),
  slot: 1,
  startedAtMs: at('12:12:00'),
  state: 'passed',
  warm: true,
})

const runningOnTheLaptop = BuildJob.make({
  agent: 'heat-1395',
  heartbeatAtMs: at('12:19:30'),
  id: 'job-heat',
  issueNumber: 1412,
  label: 'heat1395-rows-red',
  machine: 'laptop',
  queuedAtMs: at('12:00:00'),
  slot: 2,
  startedAtMs: at('12:00:25'),
  state: 'running',
})

const found = (
  jobs: ReadonlyArray<BuildJob>,
  unreadable: ReadonlyArray<UnreadableBuildJob> = [],
) => FoundBuildJobs.make({ jobs, unreadable })

const sectionOf = (job: BuildJob, timeZone = newYork) =>
  buildJobsSection(found([job]), nowMs, timeZone)

describe("an Issue's build jobs", () => {
  it('prints them newest first: queued when, state, where, label, how it ended, how long, and who', () => {
    expect(
      buildJobsSection(
        found([passedOnTheMini, runningOnTheLaptop]),
        nowMs,
        newYork,
      ),
    ).toEqual([
      '',
      "Builds (Scribe's buildJobs, newest first)",
      '  10-30 12:06  passed   mini slot 1 warm  measure-1412-cold  exit 0  ran 4 min, waited 6 min  build-sh-1412',
      '  10-30 12:00  running  laptop slot 2     heat1395-rows-red  running 19 min, waited 25 s      heat-1395',
    ])
  })

  it('says how long a queued job has waited, and how long a cancelled one waited before it ended', () => {
    expect(
      sectionOf(
        BuildJob.make({
          heartbeatAtMs: at('12:18:00'),
          id: 'job-queued',
          label: 'b183-install',
          queuedAtMs: at('12:18:00'),
          state: 'queued',
        }),
      ),
    ).toContain('  10-30 12:18  queued  -  b183-install  waiting 2 min')
    expect(
      sectionOf(
        BuildJob.make({
          agent: 'release-182',
          endedAtMs: at('09:05:00'),
          id: 'job-cancelled',
          label: 'b182-install',
          queuedAtMs: at('09:00:00'),
          state: 'cancelled',
        }),
      ),
    ).toContain(
      '  10-30 09:00  cancelled  -  b182-install  waited 5 min  release-182',
    )
  })

  it('names a cold slot, a job with no exit code, and a machine with no slot', () => {
    expect(
      sectionOf(
        BuildJob.make({
          agent: 'build-sh-1412',
          endedAtMs: at('11:45:00'),
          id: 'job-stalled',
          label: 'scribe-arch-tests',
          machine: 'mini',
          queuedAtMs: at('10:00:00'),
          slot: 1,
          startedAtMs: at('10:00:10'),
          state: 'stalled',
          warm: false,
        }),
      ),
    ).toContain(
      '  10-30 10:00  stalled  mini slot 1 cold  scribe-arch-tests  ran 1.7 h, waited 10 s  build-sh-1412',
    )
    expect(
      sectionOf(
        BuildJob.make({
          agent: 'heat-1395',
          endedAtMs: at('08:00:59'),
          exitCode: 75,
          id: 'job-failed',
          label: 'heat1395-rows-red',
          machine: 'laptop',
          queuedAtMs: at('08:00:00'),
          startedAtMs: at('08:00:00'),
          state: 'failed',
        }),
      ),
    ).toContain(
      '  10-30 08:00  failed  laptop  heat1395-rows-red  exit 75  ran 59 s, waited 0 s  heat-1395',
    )
  })

  it("says when a running job's machine stopped writing: its heartbeat is older than 3 minutes", () => {
    const running = BuildJob.make({
      agent: 'ui-1393',
      heartbeatAtMs: at('12:10:00'),
      id: 'job-silent',
      label: 'ui1393-check9',
      machine: 'mini',
      queuedAtMs: at('11:50:00'),
      slot: 2,
      startedAtMs: at('11:51:30'),
      state: 'running',
      warm: true,
    })

    expect(sectionOf(running)).toContain(
      '  10-30 11:50  running  mini slot 2 warm  ui1393-check9  running 28 min, waited 1 min, last heartbeat 10 min ago  ui-1393',
    )
    expect(
      sectionOf(BuildJob.make({ ...running, heartbeatAtMs: at('12:17:00') })),
    ).toContain(
      '  10-30 11:50  running  mini slot 2 warm  ui1393-check9  running 28 min, waited 1 min  ui-1393',
    )
  })

  it('prints the queued time in the time zone of the Mac it runs on', () => {
    expect(sectionOf(passedOnTheMini, 'UTC')).toContain(
      '  10-30 16:06  passed  mini slot 1 warm  measure-1412-cold  exit 0  ran 4 min, waited 6 min  build-sh-1412',
    )
    expect(
      Array.join(sectionOf(passedOnTheMini, 'Asia/Tokyo'), '\n'),
    ).toContain('  10-31 01:06  passed')
    expect(
      Array.join(sectionOf(passedOnTheMini, 'Etc/Unknown'), '\n'),
    ).toContain('passed  mini slot 1 warm  measure-1412-cold')
  })

  it('counts seconds under 90 s, minutes under 90 min, then hours to one decimal', () => {
    expect(
      Array.map(
        [0, 89_999, 90_000, 5_399_999, 5_400_000, 6_290_000, -2_000],
        durationText,
      ),
    ).toEqual(['0 s', '89 s', '1 min', '89 min', '1.5 h', '1.7 h', '0 s'])
  })

  it('prints nothing when the Issue has no jobs, and one line saying why when Scribe could not be read', () => {
    expect(buildJobsSection(found([]), nowMs, newYork)).toEqual([])
    expect(
      buildJobsSection(
        UnavailableBuildJobs.make({
          reason: "Scribe's Instant app did not answer within 5 seconds.",
        }),
        nowMs,
        newYork,
      ),
    ).toEqual([
      '',
      "Builds not shown: Scribe's Instant app did not answer within 5 seconds.",
    ])
  })

  it('names each row that could not be read, and says when only the newest are shown', () => {
    const lines = buildJobsSection(
      found(
        Array.makeBy(shownBuildJobsLimit - 1, () => passedOnTheMini),
        [{ id: 'job-odd', reason: 'state: Expected "queued", got "claimed"' }],
      ),
      nowMs,
      newYork,
    )

    expect(lines).toContain(
      '  job-odd could not be read: state: Expected "queued", got "claimed"',
    )
    expect(Option.getOrThrow(Array.last(lines))).toBe(
      `  Only the newest ${shownBuildJobsLimit.toString()} are shown.`,
    )
    expect(
      Array.join(
        buildJobsSection(found([passedOnTheMini]), nowMs, newYork),
        '\n',
      ),
    ).not.toContain('Only the newest')
  })

  it('gives --json the rows under builds, or why they are missing', () => {
    expect(buildJobsJson(found([passedOnTheMini]))).toEqual({
      builds: [passedOnTheMini],
    })
    expect(
      buildJobsJson(
        found([], [{ id: 'job-odd', reason: 'state: Expected "queued"' }]),
      ),
    ).toEqual({
      builds: [],
      buildsUnreadable: [{ id: 'job-odd', reason: 'state: Expected "queued"' }],
    })
    expect(
      buildJobsJson(UnavailableBuildJobs.make({ reason: 'no credentials' })),
    ).toEqual({ buildsNotShown: 'no credentials' })
  })
})

describe("reading an Issue's build jobs from Scribe", () => {
  it('asks for the newest 10 jobs of the Issue number, newest first', () => {
    expect(buildJobsQuery(1412)).toEqual({
      buildJobs: {
        $: {
          limit: 10,
          order: { queuedAtMs: 'desc' },
          where: { issueNumber: 1412 },
        },
      },
    })
  })

  it('reads the rows Scribe answers with, keeping the fields it prints', async () => {
    const queries: Array<unknown> = []

    const read = await run(
      readBuildJobs(query => {
        queries.push(query)
        return Promise.resolve({
          buildJobs: [
            {
              ...passedOnTheMini,
              command: 'swift test --filter ArchitectureTests',
              logTail: 'Test run with 12 tests passed',
              ownerUserID: 'owner-1',
            },
            runningOnTheLaptop,
          ],
        })
      }, 1412),
    )

    expect(queries).toEqual([buildJobsQuery(1412)])
    expect(read).toEqual(found([passedOnTheMini, runningOnTheLaptop]))
  })

  it('names a row it cannot read and still reads the others', async () => {
    const read = await run(
      readBuildJobs(
        () =>
          Promise.resolve({
            buildJobs: [
              { ...runningOnTheLaptop, id: 'job-odd', state: 'claimed' },
              passedOnTheMini,
              { label: 'no-id', state: 'queued' },
            ],
          }),
        1412,
      ),
    )

    expect(read._tag).toBe('FoundBuildJobs')
    if (read._tag === 'FoundBuildJobs') {
      expect(read.jobs).toEqual([passedOnTheMini])
      expect(Array.map(read.unreadable, row => row.id)).toEqual([
        'job-odd',
        '(no id)',
      ])
      expect(Option.getOrThrow(Array.head(read.unreadable)).reason).toContain(
        'claimed',
      )
    }
  })

  it('says why when Scribe refuses the query', async () => {
    const read = await run(
      readBuildJobs(
        () =>
          Promise.reject(
            new InstantAPIError({
              status: 400,
              body: {
                type: 'validation-failed',
                message: 'Validation failed for query',
                hint: { 'data-type': 'query', errors: [] },
              },
            }),
          ),
        1412,
      ),
    )

    expect(read._tag).toBe('UnavailableBuildJobs')
    if (read._tag === 'UnavailableBuildJobs') {
      expect(read.reason).toContain('Validation failed for query')
    }
  })

  it('gives up after its bound and abandons the request', async () => {
    const signals: Array<AbortSignal> = []
    const startedAtMs = Date.now()

    const read = await run(
      readBuildJobs(
        (_query, signal) => {
          signals.push(signal)
          return new Promise(() => undefined)
        },
        1412,
        Duration.millis(20),
      ),
    )

    expect(read).toEqual(
      UnavailableBuildJobs.make({
        reason: "Scribe's Instant app did not answer within 0.02 seconds.",
      }),
    )
    expect(Array.map(signals, signal => signal.aborted)).toEqual([true])
    expect(Date.now() - startedAtMs).toBeLessThan(2_000)
  })

  it('says why when the request cannot even be sent', async () => {
    const read = await run(
      readBuildJobs(() => {
        throw new Error('Instant admin needs an app id')
      }, 1412),
    )

    expect(read).toEqual(
      UnavailableBuildJobs.make({
        reason:
          "the buildJobs query to Scribe's Instant app failed: Instant admin needs an app id",
      }),
    )
  })

  it('says so when Scribe answers without a buildJobs list', async () => {
    const read = await run(readBuildJobs(() => Promise.resolve({}), 1412))

    expect(read).toEqual(
      UnavailableBuildJobs.make({
        reason: "Scribe's Instant app answered without a buildJobs list.",
      }),
    )
  })
})
