import { pathToNavigationTarget } from 'counters-core-example'
import { Array, Option } from 'effect'
import { StrictMode, useEffect, useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'

import { testRender } from '@opentui/react/test-utils'

import {
  MultipleCountersProvider,
  useMultipleCountersModel,
  useMultipleCountersReplay,
} from './client.js'

describe('Multiple Counters OpenTUI boot gate', () => {
  it('keeps input-capable children mounted after an equivalent target rerender', async () => {
    const observations: Array<
      Readonly<{ navigationTag: string; transitionCount: number }>
    > = []
    let didRequestEquivalentTargetRerender = false
    const Probe = ({
      requestEquivalentTargetRerender,
    }: Readonly<{ requestEquivalentTargetRerender: () => void }>) => {
      const model = useMultipleCountersModel()
      const replay = useMultipleCountersReplay()
      const didRequestRerender = useRef(false)
      observations.push({
        navigationTag: model.navigation._tag,
        transitionCount: replay.transitions.length,
      })
      useEffect(() => {
        if (didRequestRerender.current) {
          return
        }
        didRequestRerender.current = true
        didRequestEquivalentTargetRerender = true
        requestEquivalentTargetRerender()
      }, [requestEquivalentTargetRerender])
      return (
        <text
          content={`${model.navigation._tag} transitions:${replay.transitions.length.toString()}`}
        />
      )
    }
    const Harness = () => {
      const [, setRevision] = useState(0)
      return (
        <MultipleCountersProvider
          fallback={<text content="Starting" />}
          maybeInitialTarget={Option.some(
            pathToNavigationTarget('/counters/counter-1'),
          )}
        >
          <Probe
            requestEquivalentTargetRerender={() =>
              setRevision(revision => revision + 1)
            }
          />
        </MultipleCountersProvider>
      )
    }
    const setup = await testRender(
      <StrictMode>
        <Harness />
      </StrictMode>,
      { height: 8, width: 60 },
    )

    try {
      await setup.waitFor(
        () =>
          didRequestEquivalentTargetRerender &&
          Array.some(
            observations,
            observation =>
              observation.navigationTag === 'CounterDetail' &&
              observation.transitionCount === 1,
          ),
      )
      await setup.flush()

      expect(Array.isReadonlyArrayNonEmpty(observations)).toBe(true)
      expect(
        Array.every(
          observations,
          observation =>
            observation.navigationTag === 'CounterDetail' &&
            observation.transitionCount === 1,
        ),
      ).toBe(true)
      expect(setup.captureCharFrame()).toContain('CounterDetail transitions:1')
    } finally {
      setup.renderer.destroy()
    }
  })
})
