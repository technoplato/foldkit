import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import {
  ClickedClearWarnings,
  ClickedRunPatchWork,
  ClickedRunSubscriptionDependenciesWork,
  ClickedRunUpdateWork,
  ClickedRunViewWork,
  type Model,
  RecordedSlowWarning,
  update,
} from './main'

const initialModel: Model = {
  activeWorkload: 'Idle',
  nextWarningId: 1,
  warnings: [],
  patchRows: 0,
  patchRun: 0,
}

describe('update', () => {
  test('ClickedRunUpdateWork records update workload state', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedRunUpdateWork()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.activeWorkload).toBe('Update')
      }),
    )
  })

  test('ClickedRunViewWork records view workload state', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedRunViewWork()),
      Story.model(model => {
        expect(model.activeWorkload).toBe('View')
      }),
    )
  })

  test('ClickedRunPatchWork mounts a large patch surface', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedRunPatchWork()),
      Story.model(model => {
        expect(model.activeWorkload).toBe('Patch')
        expect(model.patchRows).toBeGreaterThan(0)
        expect(model.patchRun).toBe(1)
      }),
    )
  })

  test('ClickedRunSubscriptionDependenciesWork records subscription dependency workload state', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(ClickedRunSubscriptionDependenciesWork()),
      Story.model(model => {
        expect(model.activeWorkload).toBe('SubscriptionDependencies')
      }),
    )
  })

  test('RecordedSlowWarning stores the warning and clears active workload', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(
        RecordedSlowWarning({
          report: {
            phase: 'Update',
            durationMs: 12,
            thresholdMs: 4,
            trigger: 'ClickedRunUpdateWork',
            details: 'Update work exceeded the threshold.',
          },
        }),
      ),
      Story.model(model => {
        expect(model.activeWorkload).toBe('Idle')
        expect(model.nextWarningId).toBe(2)
        expect(model.warnings).toEqual([
          {
            id: 1,
            phase: 'Update',
            durationMs: 12,
            thresholdMs: 4,
            trigger: 'ClickedRunUpdateWork',
            details: 'Update work exceeded the threshold.',
          },
        ])
      }),
    )
  })

  test('ClickedClearWarnings clears warnings without resetting the patch surface', () => {
    Story.story(
      update,
      Story.with({
        ...initialModel,
        patchRows: 4000,
        warnings: [
          {
            id: 1,
            phase: 'Patch',
            durationMs: 16,
            thresholdMs: 8,
            trigger: 'ClickedRunPatchWork',
            details: 'Patch work exceeded the threshold.',
          },
        ],
      }),
      Story.message(ClickedClearWarnings()),
      Story.model(model => {
        expect(model.warnings).toEqual([])
        expect(model.patchRows).toBe(4000)
      }),
    )
  })
})
