import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make as makeProgram } from '../program/program.js'
import * as Block from './block.js'
import { Device, Synced } from './pace.js'
import * as Part from './part.js'
import * as Progress from './progress.js'
import * as Slot from './slot.js'

const progressProps: Progress.Props = {
  id: 'upload',
  kind: 'Progress',
  min: 0,
  max: 100,
  hasLabel: true,
}

const meterProps: Progress.Props = {
  id: 'battery',
  kind: 'Meter',
  min: 0,
  max: 100,
  low: 25,
  high: 75,
  optimum: 90,
  label: 'Battery level',
}

const fold = (
  messages: ReadonlyArray<Progress.Message>,
  props: Progress.Props = progressProps,
  from: Progress.State = Progress.initial,
): Progress.State =>
  Array.reduce(
    messages,
    from,
    (state, message) => Progress.chart.transition(state, message, props)[0],
  )

describe('core Progress & Meter Part', () => {
  describe('declaration, chart integrity, IDs, sync, and schema round-trip', () => {
    it('passes Part.problemsOf, Block.problemsOf, and Declaration checks', () => {
      expect(Part.problemsOf(Progress.part)).toEqual([])
      expect(Part.problemsOf(Progress.deviceOnly())).toEqual([])
      expect(Part.problemsOf(Progress.make({ sync: 'OwnView' }))).toEqual([])
      expect(
        Block.problemsOf({ name: 'Progress', chart: Progress.chart }),
      ).toEqual([])

      for (const action of Progress.actions) {
        const declared = Catalog.declarationOf(action)
        expect(Declaration.problemsOf(declared)).toEqual([])
        expect(Declaration.clientWordsOf(declared)).toEqual([])
      }
    })

    it('derives element IDs, ARIA role names, and sync tables', () => {
      expect(Progress.rootId('upload')).toBe('upload-root')
      expect(Progress.labelId('upload')).toBe('upload-label')
      expect(Progress.trackId('upload')).toBe('upload-track')
      expect(Progress.rangeId('upload')).toBe('upload-range')
      expect(Progress.valueTextId('upload')).toBe('upload-value-text')

      expect(Progress.ariaRoleOf(progressProps)).toBe('progressbar')
      expect(Progress.ariaRoleOf(meterProps)).toBe('meter')

      expect(Progress.synced.SetProgressValue).toEqual(Synced())
      expect(Progress.synced.SetProgressRange).toEqual(Synced())
      expect(Progress.synced.SetProgressIndeterminate).toEqual(Synced())
      expect(Progress.synced.ResetProgress).toEqual(Synced())
      expect(Progress.deviceSync('OwnView').SetProgressValue).toEqual(
        Device({ because: 'OwnView' }),
      )
    })

    it('round-trips Indeterminate, Determinate, and Complete states through Effect Schema JSON encoding', () => {
      const states: ReadonlyArray<Progress.State> = [
        Progress.initialIndeterminate(0, 100),
        Progress.initialValue(42, 0, 100),
        Progress.initialValue(100, 0, 100),
      ]
      for (const state of states) {
        const encoded = S.encodeUnknownSync(Progress.State)(state)
        const decoded = S.decodeUnknownSync(Progress.State)(encoded)
        expect(decoded).toEqual(state)
      }
    })
  })

  describe('determinate, indeterminate, complete, range clamping, and reset', () => {
    it('transitions across Determinate, Complete, and Indeterminate cleanly', () => {
      const half = fold([Progress.SetProgressValue({ value: 50 })])
      expect(half._tag).toBe('Determinate')
      expect(Progress.dataStateOf(half)).toBe('loading')
      expect(Progress.ratioOf(half)).toEqual(Option.some(0.5))
      expect(Progress.percentOf(half)).toEqual(Option.some(50))
      expect(Progress.valueTextOf(half)).toBe('50%')

      // Values above max clamp to max and enter Complete
      const done = fold([Progress.SetProgressValue({ value: 150 })])
      expect(Progress.isComplete(done)).toBe(true)
      expect(Progress.dataStateOf(done)).toBe('complete')
      expect(Progress.valueOf(done)).toEqual(Option.some(100))
      expect(Progress.percentOf(done)).toEqual(Option.some(100))

      // Progress supports Indeterminate
      const indet = fold(
        [Progress.SetProgressIndeterminate()],
        progressProps,
        done,
      )
      expect(Progress.isIndeterminate(indet)).toBe(true)
      expect(Progress.dataStateOf(indet)).toBe('indeterminate')
      expect(Progress.valueOf(indet)).toEqual(Option.none())
      expect(Progress.ratioOf(indet)).toEqual(Option.none())
      expect(Progress.percentOf(indet)).toEqual(Option.none())
      expect(Progress.valueTextOf(indet)).toBe('Loading')

      // Meter ignores SetProgressIndeterminate
      const meterState = fold(
        [
          Progress.SetProgressValue({ value: 40 }),
          Progress.SetProgressIndeterminate(),
        ],
        meterProps,
      )
      expect(Progress.isIndeterminate(meterState)).toBe(false)
      expect(Progress.valueOf(meterState)).toEqual(Option.some(40))
    })

    it('updates range via SetProgressRange and re-classifies Determinate vs Complete', () => {
      const at50 = fold([Progress.SetProgressValue({ value: 50 })])
      const shrunk = fold(
        [Progress.SetProgressRange({ min: 0, max: 50 })],
        progressProps,
        at50,
      )
      expect(Progress.isComplete(shrunk)).toBe(true)
      expect(Progress.percentOf(shrunk)).toEqual(Option.some(100))

      const expanded = fold(
        [Progress.SetProgressRange({ min: 0, max: 200 })],
        progressProps,
        shrunk,
      )
      expect(expanded._tag).toBe('Determinate')
      expect(Progress.percentOf(expanded)).toEqual(Option.some(25))

      const reset = fold(
        [Progress.ResetProgress()],
        {
          ...progressProps,
          defaultValue: 10,
        },
        expanded,
      )
      expect(Progress.valueOf(reset)).toEqual(Option.some(10))
    })
  })

  describe('Meter zones and circular SVG dash math', () => {
    it('evaluates Optimal, Suboptimal, and Critical across low, middle, and high optimums', () => {
      // High optimum (e.g. battery): high is Optimal, mid is Suboptimal, low is Critical
      const highOpt = { low: 25, high: 75, optimum: 90 }
      expect(Progress.meterZoneOf(Progress.initialValue(85), highOpt)).toBe(
        'Optimal',
      )
      expect(Progress.meterZoneOf(Progress.initialValue(50), highOpt)).toBe(
        'Suboptimal',
      )
      expect(Progress.meterZoneOf(Progress.initialValue(15), highOpt)).toBe(
        'Critical',
      )

      // Low optimum (e.g. CPU temperature / disk pressure): low is Optimal, mid is Suboptimal, high is Critical
      const lowOpt = { low: 30, high: 70, optimum: 10 }
      expect(Progress.meterZoneOf(Progress.initialValue(20), lowOpt)).toBe(
        'Optimal',
      )
      expect(Progress.meterZoneOf(Progress.initialValue(50), lowOpt)).toBe(
        'Suboptimal',
      )
      expect(Progress.meterZoneOf(Progress.initialValue(85), lowOpt)).toBe(
        'Critical',
      )

      // Middle optimum: inside [low, high] is Optimal, outside is Suboptimal
      const midOpt = { low: 30, high: 70, optimum: 50 }
      expect(Progress.meterZoneOf(Progress.initialValue(50), midOpt)).toBe(
        'Optimal',
      )
      expect(Progress.meterZoneOf(Progress.initialValue(15), midOpt)).toBe(
        'Suboptimal',
      )
      expect(Progress.meterZoneOf(Progress.initialValue(90), midOpt)).toBe(
        'Suboptimal',
      )

      // No thresholds -> always Optimal
      expect(Progress.meterZoneOf(Progress.initialValue(10), {})).toBe(
        'Optimal',
      )
    })

    it('computes exact circular circumference and dashOffset', () => {
      const radius = 20
      const expectedCircumference = 2 * Math.PI * radius

      const at0 = Progress.circleDashOf(Progress.initialValue(0), radius)
      expect(at0.circumference).toBeCloseTo(expectedCircumference, 6)
      expect(at0.dashOffset).toBeCloseTo(expectedCircumference, 6)

      const at50 = Progress.circleDashOf(Progress.initialValue(50), radius)
      expect(at50.dashOffset).toBeCloseTo(expectedCircumference * 0.5, 6)

      const at100 = Progress.circleDashOf(Progress.initialValue(100), radius)
      expect(at100.dashOffset).toBeCloseTo(0, 6)

      const indet = Progress.circleDashOf(
        Progress.initialIndeterminate(),
        radius,
      )
      expect(indet.dashOffset).toBeCloseTo(expectedCircumference, 6)
    })
  })

  describe('reference-stable SlotBindings and Part.compose', () => {
    it('projects ARIA min/max/now/text attributes and preserves unchanged slot references', () => {
      const state25 = Progress.initialValue(25)
      const view1 = Part.view(Progress.part, state25, progressProps)
      const view1Again = Part.view(Progress.part, state25, progressProps)
      expect(view1Again).toBe(view1)
      const view1Root = view1.slot('Root')
      const view1Label = view1.slot('Label')

      expect(Slot.ariaOf(view1.slot('Track'))).toMatchObject({
        role: 'status',
        id: 'upload-track',
        'aria-labelledby': 'upload-label',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': '25',
        'aria-valuetext': '25%',
      })

      const indet = Progress.initialIndeterminate()
      const indetView = Part.view(Progress.part, indet, progressProps)
      expect(indetView.slot('Root')).toBe(view1Root)
      expect(indetView.slot('Label')).toBe(view1Label)
      const indetAria = Slot.ariaOf(indetView.slot('Track'))
      expect(indetAria['aria-valuenow']).toBeUndefined()
      expect(indetAria['aria-valuetext']).toBe('Loading')

      const meterView = Part.view(
        Progress.part,
        Progress.initialValue(80),
        meterProps,
      )
      expect(Slot.ariaOf(meterView.slot('Track'))).toMatchObject({
        role: 'region',
        'aria-label': 'Battery level',
        'aria-valuenow': '80',
        'aria-valuetext': '80%',
      })
    })

    it('composes cleanly into a Program with Part.compose', () => {
      const Base = makeProgram({
        id: 'progress-compose-test',
        version: 1,
        Model: S.Struct({ name: S.String }),
        Message: S.TaggedStruct('Renamed', { name: S.String }),
        init: () => [{ name: 'Sync' }, []],
        update: (model, message) => [{ ...model, name: message.name }, []],
      })
      const App = Part.compose({
        of: Base,
        parts: [Part.given(Progress.part, () => progressProps)],
      })
      const [initModel] = App.init()
      const [nextModel] = App.update(
        initModel,
        Progress.SetProgressValue({ value: 100 }),
      )
      expect(Progress.isComplete(nextModel.parts['Progress'])).toBe(true)
    })
  })
})
