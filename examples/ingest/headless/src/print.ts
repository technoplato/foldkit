import { renderScreen } from 'foldkit/renderers'
import { type Device } from 'foldkit/renderers/devices'
import {
  type Model,
  emptyModel,
  ingestScreen,
  renderChrome,
} from 'ingest-core-example'

/** Paints the Ingest screen tree as plain text. */
export const printIngest = (model: Model = emptyModel()): string =>
  renderScreen(ingestScreen(model))

/** Paints Device chrome via core renderChrome. */
export const printIngestChrome = (
  model: Model = emptyModel(),
  device: Device = 'computer',
): string => renderChrome(model, device)
