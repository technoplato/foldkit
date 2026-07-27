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
import {
  capabilityForWalletRoute,
  walletClients,
  walletProgramIdentity,
  walletRoutes,
} from './wallet.js'

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

  it('covers both Wallet route modes across every required client', () => {
    expect(walletProgramIdentity).toStrictEqual({
      id: 'wallet',
      version: 1,
      source: 'examples/wallet/core/src/program.ts',
    })
    expect(Array.map(walletRoutes, route => route.mode)).toStrictEqual([
      'StateRoute',
      'ReplayRoute',
    ])
    expect(Array.map(walletClients, client => client.medium)).toStrictEqual([
      'ReactWeb',
      'FoldkitView',
      'RawCli',
      'EffectTerminal',
      'OpenTui',
      'ExpoWeb',
      'ExpoIos',
      'ExpoAndroid',
      'FutureServer',
    ])
    expect(
      Array.every(walletClients, client =>
        Array.every(walletRoutes, route =>
          Option.isSome(capabilityForWalletRoute(client, route.mode)),
        ),
      ),
    ).toBe(true)
  })

  it('keeps the representative Wallet routes exact and explicit', () => {
    const maybeStateRoute = Array.findFirst(
      walletRoutes,
      route => route.mode === 'StateRoute',
    )
    const maybeReplayRoute = Array.findFirst(
      walletRoutes,
      route => route.mode === 'ReplayRoute',
    )

    expect(Option.isSome(maybeStateRoute)).toBe(true)
    expect(Option.isSome(maybeReplayRoute)).toBe(true)
    if (Option.isSome(maybeStateRoute) && Option.isSome(maybeReplayRoute)) {
      const stateUrl = new URL(maybeStateRoute.value.portableRoute, 'https://x')
      const replayUrl = new URL(
        maybeReplayRoute.value.portableRoute,
        'https://x',
      )
      const stateModel = JSON.parse(stateUrl.searchParams.get('model') ?? '')
      const replayTape = JSON.parse(replayUrl.searchParams.get('tape') ?? '')

      expect(stateUrl.pathname).toBe('/wallet/state')
      expect(stateModel.portfolio._tag).toBe('LoadedPortfolio')
      expect(replayUrl.pathname).toBe('/wallet/replay')
      expect(replayUrl.searchParams.get('frame')).toBe('1')
      expect(replayTape).toMatchObject({
        formatVersion: 1,
        programId: 'wallet',
        programVersion: 1,
      })
      expect(replayTape.transitions).toHaveLength(1)
      const maybeTransition = Array.head(replayTape.transitions)
      if (Option.isSome(maybeTransition)) {
        expect(maybeTransition.value).toMatchObject({
          isOperationSettled: true,
          message: { _tag: 'ImportedAddressBookEntries' },
        })
      }
    }
  })

  it('does not overstate Wallet route support', () => {
    const maybeTerminal = Array.findFirst(
      walletClients,
      client => client.medium === 'EffectTerminal',
    )
    const maybeReact = Array.findFirst(
      walletClients,
      client => client.medium === 'ReactWeb',
    )
    const maybeFoldkit = Array.findFirst(
      walletClients,
      client => client.medium === 'FoldkitView',
    )
    const maybeServer = Array.findFirst(
      walletClients,
      client => client.medium === 'FutureServer',
    )

    if (
      Option.isSome(maybeTerminal) &&
      Option.isSome(maybeReact) &&
      Option.isSome(maybeFoldkit) &&
      Option.isSome(maybeServer)
    ) {
      expect(
        Option.map(
          capabilityForWalletRoute(maybeTerminal.value, 'ReplayRoute'),
          capability => capability.support,
        ),
      ).toStrictEqual(Option.some('LiveBranchOnly'))
      expect(
        Array.map(maybeReact.value.capabilities, value => value.support),
      ).toStrictEqual(['Implemented', 'Implemented'])
      expect(
        Array.map(maybeFoldkit.value.capabilities, value => value.support),
      ).toStrictEqual(['Implemented', 'ProgramOnly'])
      expect(
        Array.map(maybeServer.value.capabilities, value => value.support),
      ).toStrictEqual(['Planned', 'Planned'])
      expect(Option.isNone(maybeServer.value.maybeRouteCarrier)).toBe(true)
    }
  })
})
