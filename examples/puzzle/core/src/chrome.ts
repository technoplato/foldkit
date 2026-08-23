import { renderScreen } from 'foldkit/renderers'
import { Device } from 'foldkit/renderers/devices'

import { type Model } from './model.js'
import { puzzleScreen } from './program.js'

export { Device }

/** Paints Device chrome as a shell around the Program screen tree. */
export const renderChrome = (model: Model, device: Device): string =>
  renderScreen(puzzleScreen(model, { device }))
