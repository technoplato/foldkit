import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  clients,
  navigationForScreenMode,
  portableUriForScreenMode,
  screenModes,
  stateForScreenMode,
} from './matrix.js'
import { ClosedLiveClient, OpenedLiveClient } from './message.js'
import { Model, ShowingCaptures, ShowingLiveClient } from './model.js'
import { update } from './update.js'

describe('Client Matrix core', () => {
  it('prints every canonical destination through the shared parser-printer', () => {
    expect(
      Array.map(screenModes, definition =>
        portableUriForScreenMode(definition.mode),
      ),
    ).toStrictEqual([
      '/counters',
      '/counters/counter-1',
      '/counters/counter-1/fact',
      '/counters/counter-1/delete',
    ])
  })

  it('derives every displayed state from the same canonical navigation union', () => {
    const factNavigation = navigationForScreenMode('Fact')
    const factState = stateForScreenMode('Fact')

    expect(factNavigation._tag).toBe('CounterDetail')
    expect(factState.navigation).toStrictEqual(factNavigation)
    if (factNavigation._tag === 'CounterDetail') {
      expect(Option.isSome(factNavigation.maybeMode)).toBe(true)
    }
    expect(clients).toHaveLength(8)
  })

  it('opens exactly one live cell from its selected mode and closes it', () => {
    const initialModel = Model.make({
      liveClientState: ShowingCaptures.make({}),
      orientation: 'ModesAsRows',
      selectedMode: 'DeleteConfirmation',
    })
    const [openedModel] = update(
      initialModel,
      OpenedLiveClient({ medium: 'ReactWeb', mode: 'Detail' }),
    )

    expect(openedModel).toStrictEqual(
      Model.make({
        liveClientState: ShowingLiveClient.make({
          medium: 'ReactWeb',
          mode: 'Detail',
        }),
        orientation: 'ModesAsRows',
        selectedMode: 'Detail',
      }),
    )

    const [closedModel] = update(openedModel, ClosedLiveClient())

    expect(closedModel).toStrictEqual(
      Model.make({
        liveClientState: ShowingCaptures.make({}),
        orientation: 'ModesAsRows',
        selectedMode: 'Detail',
      }),
    )
  })
})
