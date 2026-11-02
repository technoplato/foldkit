/// <reference types="node" />
import { Array, Effect, Layer, Option } from 'effect'
import * as Program from 'foldkit/program'
import * as Runtime from 'foldkit/program-runtime'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueTracker,
  IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import {
  ObservedIssues,
  ObservedProducts,
  observedIssuesOf,
} from './message.js'
import { type Model } from './model.js'
import { IssueTrackerProgram } from './program.js'
import { StaticIssueTrackerResources, makeMemoryIssueTracker } from './resources.js'
import { pathToNavigation } from './route.js'
import { update } from './update.js'

setFlagsFromString('--expose-gc')
const collectGarbage: () => void = runInNewContext('gc')

const CATALOG_SIZE = 1_500
const WORK_LOG_LENGTH = 10
const LIVE_CHANGES = 50
const NEW_ISSUES = 8
const FASTEST_LIVE_CHANGE_BUDGET_MS = 15
const HEAP_PER_LIVE_CHANGE_BUDGET_MB = 0.25
const HEAP_PER_NEW_ISSUE_BUDGET_MB = 2
const BYTES_PER_MB = 1_048_576
const FIRST_UPDATED_AT_MS = 1_790_000_000_000

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })

const issueNumbered = (number: number): Issue =>
  Issue.make({
    area: Option.some('Recording / audio'),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: FIRST_UPDATED_AT_MS + number,
    details: `What is wrong in #${number.toString()}, as he said it.`,
    id: number.toString().padStart(3, '0'),
    issueType: Option.some('defect'),
    mentions: [],
    priority: 'P2',
    product: scribe,
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title: `Issue ${number.toString()}: the recording keeps going`,
    updatedAtMs: FIRST_UPDATED_AT_MS + number,
    viewerURL: Option.none(),
    workLog: Array.makeBy(WORK_LOG_LENGTH, index =>
      IssueWorkLogEntry.make({
        agentId: Option.some('claude-code/agent@ld'),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: `work-${number.toString()}-progress-${index.toString()}`,
        occurredAtMs: FIRST_UPDATED_AT_MS + number + index,
        state: Option.some('progress'),
        summary: `Step ${index.toString()} of #${number.toString()}.`,
      }),
    ),
  })

const catalog = Array.makeBy(CATALOG_SIZE, index =>
  issueNumbered(CATALOG_SIZE - index),
)

const listModel = (): Model =>
  Array.reduce(
    [
      ObservedIssues.make({ issues: catalog }),
      ObservedProducts.make({ products: [{ product: scribe, updatedAtMs: 1 }] }),
    ],
    modelForNavigation(pathToNavigation('/issues')),
    (model, message) => update(model, message)[0],
  )

const withOneChanged = (
  issues: ReadonlyArray<Issue>,
  change: number,
): ReadonlyArray<Issue> =>
  Array.map(issues, (issue, index) =>
    index === change % issues.length
      ? Issue.make({
          ...issue,
          status: change % 2 === 0 ? 'InProgress' : 'Open',
          updatedAtMs: issue.updatedAtMs + 1,
        })
      : issue,
  )

const heapMb = (): number => {
  collectGarbage()
  collectGarbage()
  return process.memoryUsage().heapUsed / BYTES_PER_MB
}

describe('what a live change costs through the runtime the clients use', () => {
  it(
    'keeps each live change and each new Issue small in time and memory, with every transition kept',
    async () => {
      const tracker = await Effect.runPromise(makeMemoryIssueTracker(catalog))
      const resources = Layer.mergeAll(
        StaticIssueTrackerResources,
        Layer.succeed(IssueTracker, tracker),
      )
      const measured = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const controller = yield* Runtime.makeReplayController({
              program: IssueTrackerProgram,
              resources,
              route: Program.state(listModel()),
            })
            let shown: ReadonlyArray<Issue> = catalog
            const liveChangeMs: Array<number> = []
            const heapBeforeChanges = heapMb()
            for (let change = 0; change < LIVE_CHANGES; change += 1) {
              shown = withOneChanged(shown, change)
              const startedAt = performance.now()
              yield* controller.run(observedIssuesOf(shown))
              liveChangeMs.push(performance.now() - startedAt)
            }
            const heapAfterChanges = heapMb()
            for (let filed = 0; filed < NEW_ISSUES; filed += 1) {
              shown = [issueNumbered(CATALOG_SIZE + filed + 1), ...shown]
              yield* controller.run(observedIssuesOf(shown))
            }
            const heapAfterFiling = heapMb()
            return {
              fastestLiveChangeMs: Math.min(...liveChangeMs),
              frame: controller.read().frame,
              heapPerLiveChangeMb:
                (heapAfterChanges - heapBeforeChanges) / LIVE_CHANGES,
              heapPerNewIssueMb:
                (heapAfterFiling - heapAfterChanges) / NEW_ISSUES,
            }
          }),
        ),
      )

      expect(measured.frame).toBeGreaterThanOrEqual(LIVE_CHANGES + NEW_ISSUES)
      expect(measured.fastestLiveChangeMs).toBeLessThan(
        FASTEST_LIVE_CHANGE_BUDGET_MS,
      )
      expect(measured.heapPerLiveChangeMb).toBeLessThan(
        HEAP_PER_LIVE_CHANGE_BUDGET_MB,
      )
      expect(measured.heapPerNewIssueMb).toBeLessThan(
        HEAP_PER_NEW_ISSUE_BUDGET_MB,
      )
    },
    120_000,
  )
})
