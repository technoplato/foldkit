import { Array, Option } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  type ChartPoint,
  type ChartSize,
  budgetStatus,
  chartGeometry,
  newestMeasured,
  niceCeiling,
} from './chart'

const size: ChartSize = {
  width: 300,
  height: 120,
  top: 10,
  right: 40,
  bottom: 20,
  left: 10,
}

const cpuBudget = Option.some({
  target: 15,
  fail: 25,
  source: 'docs/performance-budget.md',
})

const point = (build: string, value?: number): ChartPoint => ({
  build,
  maybeValue: Option.fromNullishOr(value),
  isFew: false,
})

describe('niceCeiling', () => {
  test.each([
    [27.3, 30],
    [25, 25],
    [0.42, 0.5],
    [101, 120],
    [0, 1],
  ])('%d rounds up to %d', (value, expected) => {
    expect(niceCeiling(value)).toBe(expected)
  })
})

describe('chartGeometry', () => {
  test('every build has a column, measured or not, evenly along x', () => {
    const geometry = chartGeometry(
      [point('248', 26.6), point('256'), point('270', 31.1)],
      cpuBudget,
      size,
    )
    expect(Array.map(geometry.columns, column => column.build)).toStrictEqual([
      '248',
      '256',
      '270',
    ])
    const columnWidth = 250 / 3
    Array.forEach(geometry.columns, (column, index) => {
      expect(column.x).toBeCloseTo(10 + (index + 0.5) * columnWidth)
    })
    expect(
      Option.flatMap(Array.get(geometry.columns, 1), column => column.maybeY),
    ).toStrictEqual(Option.none())
  })

  test('a line never crosses a build nobody measured', () => {
    const geometry = chartGeometry(
      [
        point('245', 25.3),
        point('246', 26.9),
        point('252'),
        point('266', 25.1),
      ],
      cpuBudget,
      size,
    )
    expect(
      Array.map(geometry.segments, run =>
        Array.map(run, column => column.build),
      ),
    ).toStrictEqual([['245', '246']])
  })

  test('the axis reaches above the budget even when every value is under it', () => {
    const geometry = chartGeometry([point('284', 5)], cpuBudget, size)
    expect(geometry.yMax).toBe(30)
    expect(Option.getOrThrow(geometry.maybeFailY)).toBeCloseTo(
      100 - (25 / 30) * 90,
    )
  })

  test('zero sits on the baseline', () => {
    const geometry = chartGeometry([point('249', 0)], Option.none(), size)
    expect(
      Option.flatMap(Array.head(geometry.columns), column => column.maybeY),
    ).toStrictEqual(Option.some(100))
  })
})

describe('newestMeasured and budgetStatus', () => {
  test('the newest measured build is the one labeled', () => {
    expect(
      newestMeasured([point('270', 31.1), point('284', 36.3), point('286')]),
    ).toStrictEqual(Option.some({ build: '284', value: 36.3 }))
  })

  test('a value is within, over the target, or over the fail line', () => {
    expect(budgetStatus(12, cpuBudget)).toBe('Within')
    expect(budgetStatus(20, cpuBudget)).toBe('OverTarget')
    expect(budgetStatus(31.1, cpuBudget)).toBe('OverFail')
    expect(budgetStatus(31.1, Option.none())).toBe('NoBudget')
  })

  test('any serious heat fails a budget of zero', () => {
    const heatBudget = Option.some({ target: 0, fail: 0, source: '' })
    expect(budgetStatus(0, heatBudget)).toBe('Within')
    expect(budgetStatus(0.2, heatBudget)).toBe('OverFail')
  })
})
