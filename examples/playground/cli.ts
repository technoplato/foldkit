import { Option } from 'effect'
import { renderCli } from 'foldkit/renderers'

import { PlaygroundCliScreen } from './src/cliScreen'
import { initialModel, runBurstSimulation } from './src/state'

const demo = runBurstSimulation(initialModel(), 1_000)

const screen = PlaygroundCliScreen({
  mode: demo.mode,
  displayName: demo.profile.profile.displayName,
  bio: demo.profile.profile.bio,
  formValid: true,
  localEventCount: demo.localEventCount,
  syncedWriteCount: demo.syncedWriteCount,
  sliderValue: demo.parts.slider.values[0] ?? 0,
  ratingValue: Option.getOrElse(demo.parts.ratingGroup.maybeValue, () => 0),
  switchOn: demo.parts.switch._tag === 'On',
  activeTab: Option.getOrElse(demo.parts.tabs.maybeSelectedValue, () => 'core'),
  qrText:
    demo.parts.qrCode._tag === 'Ready'
      ? demo.parts.qrCode.value
      : 'https://foldkit.pisspoursoftware.xyz/playground',
})

process.stdout.write(
  `${renderCli(screen, { width: 72, color: true, ground: 'Dark' })}\n`,
)
