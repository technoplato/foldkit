import { renderScreen } from 'foldkit/renderers'
import { Device, wrapDevice } from 'foldkit/renderers/devices'

import { type Model, uri } from './model.js'
import { productView } from './product.js'

export { Device }

/** Paints Device chrome as a shell around the product tree. */
export const renderChrome = (model: Model, device: Device): string =>
  renderScreen(wrapDevice(device, productView(model), { title: uri }))
