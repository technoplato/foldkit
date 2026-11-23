import { Model, ShowingCaptures, update } from 'client-matrix-core-example'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { view } from './view.js'

const initialModel = () =>
  Model.make({
    liveClientState: ShowingCaptures.make({}),
    orientation: 'ModesAsRows',
    selectedMode: 'DeleteQuestion',
  })

describe('Client Matrix Foldkit view', () => {
  test('switches axes and inspects one canonical URI', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel()),
      Scene.expect(Scene.text('/counters/1/delete/1')).toExist(),
      Scene.click(Scene.role('button', { name: 'Clients as rows' })),
      Scene.expect(Scene.text('React')).toExist(),
      Scene.expect(Scene.text('OpenTUI')).toExist(),
    )
  })

  test('opens one interactive cell from its selected mode and returns to its capture', () => {
    const liveFrame = Scene.selector('iframe')

    Scene.scene(
      { update, view },
      Scene.with(initialModel()),
      Scene.click(
        Scene.role('button', {
          name: 'Open React live client from Counter page',
        }),
      ),
      Scene.expect(Scene.text('Selected matrix mode: Counter page')).toExist(),
      Scene.expect(liveFrame).toHaveAttr(
        'src',
        'https://counters.pisspoursoftware.xyz/counters/1?engine=memory',
      ),
      Scene.click(Scene.role('button', { name: 'Clients as rows' })),
      Scene.expect(liveFrame).toHaveAttr(
        'src',
        'https://counters.pisspoursoftware.xyz/counters/1?engine=memory',
      ),
      Scene.click(
        Scene.role('button', {
          name: 'Return React Counter page to capture',
        }),
      ),
      Scene.expect(liveFrame).not.toExist(),
      Scene.expect(
        Scene.role('button', {
          name: 'Open React live client from Counter page',
        }),
      ).toExist(),
    )
  })

  test('paints the terminal cells with the Program and names each command', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel()),
      Scene.expect(Scene.label('CLI showing Delete question')).toContainText(
        'at /counters/1/delete/1',
      ),
      Scene.expect(
        Scene.label('Terminal UI showing Counter list'),
      ).toContainText('counters  /counters'),
      Scene.expect(
        Scene.label('OpenTUI showing Delete question'),
      ).toContainText('Delete Counter 1?'),
      Scene.expect(
        Scene.role('link', {
          name: 'Open the live Counters every device shares',
        }),
      ).toHaveAttr('href', 'https://counters.pisspoursoftware.xyz/counters'),
      Scene.expect(Scene.text("counters open '/counters/1'")).toExist(),
      Scene.expect(
        Scene.text("counters open '/counters/1' && counters tui"),
      ).toExist(),
    )
  })

  test('renders Wallet Program identity, route carriers, and explicit gaps', () => {
    Scene.scene(
      { update, view },
      Scene.with(initialModel()),
      Scene.expect(Scene.text('wallet@12')).toExist(),
      Scene.expect(
        Scene.text('/wallet/state?model=<encoded Wallet Model>'),
      ).toExist(),
      Scene.expect(
        Scene.text(
          '/wallet/replay?tape=<encoded wallet@12 ReplayTape>&frame=<frame>',
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
      Scene.expect(Scene.text('BTC | Live')).toExist(),
      Scene.expect(Scene.text('Actual network Unverified')).toExist(),
      Scene.expect(
        Scene.text('Processor descriptor: HostedUnadvertised'),
      ).toExist(),
      Scene.expect(
        Scene.text('/captures/wallet/state/open-tui.webp'),
      ).toExist(),
      Scene.expect(Scene.text('Missing Screenshot')).toExist(),
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
