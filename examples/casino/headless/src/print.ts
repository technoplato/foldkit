import {
  type Model,
  casinoScreen,
  emptyModel,
  renderChrome,
} from 'casino-core-example'
import { renderScreen } from 'foldkit/renderers'
import { type Device } from 'foldkit/renderers/devices'

/** Paints the Casino screen tree as plain text. */
export const printCasino = (model: Model = emptyModel()): string =>
  renderScreen(casinoScreen(model))

/** Paints Device chrome via core renderChrome. */
export const printCasinoChrome = (
  model: Model = emptyModel(),
  device: Device = 'computer',
): string => renderChrome(model, device)
