import { renderScreen } from 'foldkit/renderers'
import { type Device } from 'foldkit/renderers/devices'
import {
  type Model,
  emptyModel,
  renderChrome,
  songbookScreen,
} from 'songbook-core-example'

/** Paints the Songbook screen tree as plain text. */
export const printSongbook = (model: Model = emptyModel()): string =>
  renderScreen(songbookScreen(model))

/** Paints Device chrome via core renderChrome. */
export const printSongbookChrome = (
  model: Model = emptyModel(),
  device: Device = 'computer',
): string => renderChrome(model, device)
