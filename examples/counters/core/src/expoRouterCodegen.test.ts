import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { expoRouterFileFor, expoRouterFiles } from './expoRouterCodegen.js'
import {
  CounterDetailTarget,
  CounterFactTarget,
  CounterListTarget,
  DeleteCounterTarget,
} from './message.js'
import { navigationTargetToPath } from './route.js'

describe('expoRouterFiles', () => {
  it('generates byte-identical output across runs', () => {
    expect(expoRouterFiles()).toEqual(expoRouterFiles())
    expect(expoRouterFiles().map(file => file.path)).toEqual([
      'app/routerRuntime.helpers.ts',
      'app/index.tsx',
      'app/counters/index.tsx',
      'app/counters/[counterId].tsx',
      'app/counters/[counterId]/fact.tsx',
      'app/counters/[counterId]/delete.tsx',
    ])
  })

  it('keeps one generated file per printed destination shape', () => {
    const listPath = navigationTargetToPath(CounterListTarget.make({}))
    expect(listPath).toBe('/counters')
    expect(
      Option.getOrNull(expoRouterFileFor('app/counters/index.tsx')),
    ).toMatchObject({ path: 'app/counters/index.tsx' })

    const detailPath = navigationTargetToPath(
      CounterDetailTarget.make({ counterId: 'counter-x1' }),
    )
    expect(detailPath).toBe('/counters/counter-x1')
    expect(
      Option.getOrNull(expoRouterFileFor('app/counters/[counterId].tsx')),
    ).toBeDefined()

    const factPath = navigationTargetToPath(
      CounterFactTarget.make({ counterId: 'counter-x1' }),
    )
    expect(factPath).toBe('/counters/counter-x1/fact')
    expect(
      Option.getOrNull(expoRouterFileFor('app/counters/[counterId]/fact.tsx')),
    ).toBeDefined()

    const deletePath = navigationTargetToPath(
      DeleteCounterTarget.make({ counterId: 'counter-x1' }),
    )
    expect(deletePath).toBe('/counters/counter-x1/delete')
    expect(
      Option.getOrNull(
        expoRouterFileFor('app/counters/[counterId]/delete.tsx'),
      ),
    ).toBeDefined()
  })

  it('presents fact and delete routes as modals', () => {
    const fact = Option.getOrThrow(
      expoRouterFileFor('app/counters/[counterId]/fact.tsx'),
    )
    expect(fact.content).toContain('presentation="modal"')
    expect(fact.content).toContain('factPathFromProps')

    const remove = Option.getOrThrow(
      expoRouterFileFor('app/counters/[counterId]/delete.tsx'),
    )
    expect(remove.content).toContain('presentation="modal"')
    expect(remove.content).toContain('deletePathFromProps')
  })

  it('pushes the detail route without modal presentation', () => {
    const detail = Option.getOrThrow(
      expoRouterFileFor('app/counters/[counterId].tsx'),
    )
    expect(detail.content).not.toContain('presentation')
    expect(detail.content).toContain('counterPathFromProps')
  })

  it('derives helper paths from params only', () => {
    const helpers = Option.getOrThrow(
      expoRouterFileFor('app/routerRuntime.helpers.ts'),
    )
    expect(helpers.content).toContain('/counters/')
    expect(helpers.content).toContain('?? MISSING_COUNTER_ID')
  })
})
