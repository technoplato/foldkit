import { Model, ShowingCaptures, update } from 'client-matrix-core-example'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { view } from './view.js'

const initialModel = () =>
  Model.make({
    liveClientState: ShowingCaptures.make({}),
    orientation: 'ModesAsRows',
    selectedMode: 'DeleteConfirmation',
  })

describe('Client Matrix Foldkit view', () => {
  test('switches axes and inspects one canonical URI', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel()),
      Scene.expect(Scene.text('/counters/counter-1/delete')).toExist(),
      Scene.click(Scene.role('button', { name: 'Clients as rows' })),
      Scene.expect(Scene.text('React')).toExist(),
      Scene.expect(Scene.text('Expo Android')).toExist(),
    )
  })

  test('opens one interactive cell from its selected mode and returns to its capture', () => {
    const liveFrame = Scene.selector('iframe')

    Scene.scene(
      { update, view },
      Scene.with(initialModel()),
      Scene.click(
        Scene.role('button', {
          name: 'Open React live client from Counter detail',
        }),
      ),
      Scene.expect(
        Scene.text('Selected matrix mode: Counter detail'),
      ).toExist(),
      Scene.expect(liveFrame).toHaveAttr(
        'src',
        'https://countersdemo.knophy.com/counters/counter-1?presenter=a',
      ),
      Scene.click(Scene.role('button', { name: 'Clients as rows' })),
      Scene.expect(liveFrame).toHaveAttr(
        'src',
        'https://countersdemo.knophy.com/counters/counter-1?presenter=a',
      ),
      Scene.click(
        Scene.role('button', {
          name: 'Return React Counter detail to capture',
        }),
      ),
      Scene.expect(liveFrame).not.toExist(),
      Scene.expect(
        Scene.role('button', {
          name: 'Open React live client from Counter detail',
        }),
      ).toExist(),
    )
  })

  test('links browser and native captures to their exact mode carriers', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel()),
      Scene.expect(
        Scene.role('link', {
          name: 'Open Expo Web for Fact presentation',
        }),
      ).toHaveAttr(
        'href',
        'https://expodemo.knophy.com/counters/counter-1/fact',
      ),
      Scene.expect(
        Scene.role('link', {
          name: 'Open Expo iOS for Delete confirmation',
        }),
      ).toHaveAttr('href', 'foldkit://showcase/counters/counter-1/delete'),
      Scene.expect(
        Scene.role('link', {
          name: 'Open Expo Android for Counter list',
        }),
      ).toHaveAttr('href', 'foldkit://showcase/counters'),
      Scene.expect(
        Scene.role('link', {
          name: 'Open Effect Terminal for Counter detail',
        }),
      ).not.toExist(),
    )
  })

  test('renders Wallet Program identity, route carriers, and explicit gaps', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel()),
      Scene.expect(Scene.text('wallet@7')).toExist(),
      Scene.expect(
        Scene.text('/wallet/state?model=<encoded Wallet Model>'),
      ).toExist(),
      Scene.expect(
        Scene.text(
          '/wallet/replay?tape=<encoded wallet@7 ReplayTape>&frame=<frame>',
        ),
      ).toExist(),
      Scene.expect(
        Scene.text(
          "pnpm --filter wallet-cli-example wallet show --uri '<portable-wallet-route>' --verbose",
        ),
      ).toExist(),
      Scene.expect(Scene.text('Live branch only')).toExist(),
      Scene.expect(Scene.text('No route carrier is wired.')).toExist(),
      Scene.expect(Scene.text('No host evidence')).toExist(),
      Scene.expect(Scene.text('Send money from any client')).toExist(),
      Scene.expect(Scene.text('ETH | Testnet')).toExist(),
      Scene.expect(
        Scene.text(
          'foldkit://showcase/wallet/intent/send?mode=Testnet&chain=ethereum&network=ethereum%3Asepolia&account=simulated-ethereum-account',
          { exact: false },
        ),
      ).toExist(),
      Scene.expect(Scene.text('Active')).toExist(),
    )
  })
})
