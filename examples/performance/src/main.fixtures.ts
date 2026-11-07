import { Option, Schema as S } from 'effect'
import { fromString } from 'foldkit/url'

import { BuildDetail, Index } from './data'
import { BuildDetailData, IndexData, type Model } from './model'
import { type Destination, urlToDestination } from './route'

const LEDGER_URL =
  'https://github.com/technoplato/scribe/blob/3ed8df101/docs/PERFORMANCE.md'

const measured = (value: number, minutes: number | null) => ({
  _tag: 'Measured',
  value,
  minutes,
  isFew: minutes !== null && minutes < 5,
  note: null,
  url: null,
})

const notMeasured = (reason: string) => ({ _tag: 'NotMeasured', reason })

const values = (cpuFront: unknown, mainShare: unknown) => ({
  'cpu-front': cpuFront,
  'main-thread-share': mainShare,
  'hitches-notes': notMeasured('measured only in a named run'),
})

const nothing = (reason: string) =>
  values(notMeasured(reason), notMeasured(reason))

const scribeBuild = (
  build: string,
  recording: unknown,
  ledgerNote: string | null,
) => ({
  build,
  date: '2026-11-05T11:31:00-05:00',
  changed: `what build ${build} changed`,
  cutIssues: ['1276'],
  carries: build === '266' ? ['1423'] : [],
  commit: {
    kind: build === '256' ? 'Cut' : 'Source',
    sha: `${build}aaaaaaa`,
    url: `https://github.com/technoplato/scribe/commit/${build}aaaaaaa`,
    note: null,
  },
  release: null,
  library: '1.9.73',
  window: {
    first: '2026-11-05 11:55:00 EST',
    last: '2026-11-05 14:19:00 EST',
    minutes: 400,
    recordingMinutes: 194,
  },
  cannedWindow: null,
  ledgerLine: ledgerNote === null ? 68 : 63,
  ledgerNote,
  scopes: {
    Recording: recording,
    NotRecording: nothing('no minute not recording on this build'),
    CannedAudio: nothing('no canned-audio minute on this build'),
  },
})

/** What the exporter writes, by hand: three metrics, two apps and the library, four issues. */
export const encodedIndex = {
  schemaVersion: 1,
  generatedAt: '2026-11-06T11:51:39-05:00',
  ledger: {
    commit: '3ed8df101aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    url: LEDGER_URL,
    path: 'docs/PERFORMANCE.md',
    newestMinute: '2026-11-06 11:50:00 EST',
    minutes: 6627,
    cannedMinutes: 120,
    problems: [],
  },
  method: 'Every number is one build on one device.',
  metrics: [
    {
      id: 'cpu-front',
      label: 'CPU in front',
      unit: '% of a core',
      digits: 1,
      reads: "the ledger's cpuPercent",
      budgets: {
        Recording: {
          target: 15,
          fail: 25,
          source: 'docs/performance-budget.md',
        },
        NotRecording: null,
        CannedAudio: null,
      },
      line: 33,
      url: `${LEDGER_URL}#L33`,
      command: 'python3 -I scripts/perf/metrics.py <build> --device <device>',
    },
    {
      id: 'main-thread-share',
      label: "Main thread's share of Scribe's CPU",
      unit: '%',
      digits: 0,
      reads: "the ledger's main.busyPercent over its cpuPercent",
      budgets: { Recording: null, NotRecording: null, CannedAudio: null },
      line: 33,
      url: `${LEDGER_URL}#L33`,
      command: 'python3 -I scripts/perf/metrics.py <build> --device <device>',
    },
    {
      id: 'hitches-notes',
      label: 'Stutters in Notes',
      unit: 'a second',
      digits: 1,
      reads: "Scribe's own ui.frames.sample",
      budgets: { Recording: null, NotRecording: null, CannedAudio: null },
      line: null,
      url: null,
      command: 'frames.py',
    },
  ],
  scopes: ['Recording', 'NotRecording', 'CannedAudio'],
  apps: [
    {
      id: 'scribe',
      name: 'Scribe',
      kind: 'App',
      platform: 'iPhone',
      summary: 'The recorder on his iPhone.',
      defaultScope: 'Recording',
      repo: {
        name: 'technoplato/scribe',
        url: 'https://github.com/technoplato/scribe',
      },
      builds: [
        scribeBuild(
          '256',
          nothing('no recording minute on this build'),
          'not measured: 254-256 never reached the phone',
        ),
        scribeBuild('266', values(measured(25.1, 9), measured(64.3, 16)), null),
        scribeBuild('270', values(measured(31.1, 75), measured(67, 183)), null),
      ],
      versions: [],
    },
    {
      id: 'scribe-playback',
      name: 'Scribe Playback',
      kind: 'App',
      platform: 'iPhone and Mac',
      summary: 'The player.',
      defaultScope: 'NotRecording',
      repo: {
        name: 'technoplato/scribe',
        url: 'https://github.com/technoplato/scribe',
      },
      builds: [],
      versions: [],
    },
    {
      id: 'instant-data-swift',
      name: 'instant-data-swift',
      kind: 'Library',
      platform: 'Swift package',
      summary: 'The Instant library.',
      defaultScope: 'Recording',
      repo: {
        name: 'technoplato/instant-data-swift',
        url: 'https://github.com/technoplato/instant-data-swift',
      },
      builds: [],
      versions: [
        {
          version: '1.9.73',
          tag: 'v1.9.73',
          date: '2026-11-05T06:00:00-05:00',
          sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          url: 'https://github.com/technoplato/instant-data-swift/commit/bbbbbbbbb',
          tagUrl:
            'https://github.com/technoplato/instant-data-swift/tree/v1.9.73',
          release: null,
          firstScribeBuild: '268',
          scribeBuilds: ['268', '269', '270'],
          fixes: [
            {
              line: 122,
              url: `${LEDGER_URL}#L122`,
              fix: 'Receive splice, instant-data-swift 1.9.68 and 1.9.73',
              ledgerSoFar: '**Down, not separable.** Receive 44.9 -> 15.7',
            },
          ],
        },
      ],
    },
  ],
  issues: [
    {
      number: '1423',
      title: 'The hidden list re-sends its rows',
      status: 'VerificationNeeded',
      priority: 'P1',
      url: 'https://issues.pisspoursoftware.xyz/issues/1423',
      evidence: {
        _tag: 'Proven',
        devices: ['iPhone'],
        builds: ['266', '269', '270'],
        measurement: 'Instant text received 0.8 -> 0.1 MB a minute quiet',
        command: 'metrics.py --compare 253 269',
        line: 210,
        url: `${LEDGER_URL}#L210`,
      },
      isNamedByTheBrief: true,
      fixes: [
        {
          line: 121,
          url: `${LEDGER_URL}#L121`,
          fix: 'Sealed summary at Stop (#1423)',
          onThePhone: '266',
          ledgerSoFar: '**Yes.** Same scene',
        },
      ],
      hypotheses: [],
    },
    {
      number: '1891',
      title: 'CaptureTelemetryClient.record takes 12.1% of the main thread',
      status: 'Closed',
      priority: 'P1',
      url: 'https://issues.pisspoursoftware.xyz/issues/1891',
      evidence: {
        _tag: 'Disproved',
        devices: ['iPhone', 'iPad'],
        builds: ['270', '284'],
        measurement: 'Three functions share one body',
        command: 'xcrun nm',
        line: 214,
        url: `${LEDGER_URL}#L214`,
      },
      isNamedByTheBrief: true,
      fixes: [],
      hypotheses: [0],
    },
    {
      number: '1878',
      title: "SwiftUI's display link costs 51 ms a second",
      status: 'VerificationNeeded',
      priority: 'P1',
      url: 'https://issues.pisspoursoftware.xyz/issues/1878',
      evidence: {
        _tag: 'Landed',
        builds: ['285'],
        reason:
          "in build 285; no device measurement in the ledger's evidence table yet",
      },
      isNamedByTheBrief: true,
      fixes: [],
      hypotheses: [1],
    },
    {
      number: '1923',
      title: 'The sidebar updates 8 rows per store action',
      status: 'InProgress',
      priority: 'P1',
      url: 'https://issues.pisspoursoftware.xyz/issues/1923',
      evidence: {
        _tag: 'InProgress',
        builds: [],
        reason:
          'no build carries a fix commit for it yet; the tracker says InProgress',
      },
      isNamedByTheBrief: true,
      fixes: [],
      hypotheses: [],
    },
  ],
  hypotheses: [
    {
      hypothesis: 'CaptureTelemetryClient.record costs 25.8 ms/s of main',
      issue: '1891',
      predicted: 'telemetry is 12.1% of the main thread',
      measured: 'three functions share one body',
      verdict: 'Disproved',
      verdictText: 'disproved',
      source: '~/Sync/audit/trace-audit-1797/analysis.md',
      line: 230,
      url: null,
      ledgerUrl: `${LEDGER_URL}#L230`,
    },
    {
      hypothesis: 'Installed For still ticks on 284',
      issue: '1878',
      predicted: 'the display link at least 20% of main in quiet',
      measured: '30.5% of main in quiet',
      verdict: 'Held',
      verdictText: 'held',
      source: 'audits/2026-11-06-ipad-profile-1901.md',
      line: 225,
      url: 'https://github.com/technoplato/scribe/blob/3ed8df101/audits/2026-11-06-ipad-profile-1901.md',
      ledgerUrl: `${LEDGER_URL}#L225`,
    },
  ],
}

export const sampleIndex = S.decodeUnknownSync(Index)(encodedIndex)

export const encodedBuildDetail = {
  ...scribeBuild('270', values(measured(31.1, 75), measured(67, 183)), null),
  app: 'scribe',
  device: 'iPhone',
  conditions: {
    Recording: {
      frontShare: 0.41,
      chargingShare: 1,
      wordsPerMinute: 87,
      finalsPerMinute: 9.2,
      transactionsPerMinute: 72.4,
    },
    NotRecording: null,
    CannedAudio: null,
  },
  ledgerRow: {
    line: 68,
    url: `${LEDGER_URL}#L68`,
    cells: { Build: '270', 'CPU in front': '30.9 (43 min)' },
    traceMainShare: 60.8,
  },
  powerlogNote: null,
  hangsNote: 'hang reports pulled up to 11-04 17:42 only',
}

export const sampleBuildDetail =
  S.decodeUnknownSync(BuildDetail)(encodedBuildDetail)

const destinationOf = (path: string): Destination =>
  urlToDestination(
    Option.getOrThrow(fromString(`https://performance.example${path}`)),
  )

/** The page at a path with the index loaded and nothing open or hovered. */
export const readyModelAt = (path: string): Model => ({
  destination: destinationOf(path),
  index: IndexData.Success({ data: sampleIndex }),
  maybeOpenBuild: Option.none(),
  maybeHover: Option.none(),
})

export const loadingModel: Model = {
  destination: destinationOf('/'),
  index: IndexData.Loading(),
  maybeOpenBuild: Option.none(),
  maybeHover: Option.none(),
}

/** Build 270's page with its own file loaded. */
export const openBuildModel: Model = {
  ...readyModelAt('/apps/scribe/builds/270'),
  maybeOpenBuild: Option.some({
    appId: 'scribe',
    build: '270',
    detail: BuildDetailData.Success({ data: sampleBuildDetail }),
  }),
}
