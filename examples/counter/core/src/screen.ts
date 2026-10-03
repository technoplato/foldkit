import { Option } from 'effect'
import { Catalog } from 'foldkit'
import { type ActionContext } from 'foldkit/message'
import {
  Column,
  Row,
  Text,
  type UiNode,
  actionButtons,
} from 'foldkit/renderers'
import { wrapDevice } from 'foldkit/renderers/devices'

import { catalog } from './message.js'
import { type Model } from './model.js'
import { maybeCounterUri } from './navigation.js'

// VIEW

/**
 * The screen every painter draws: the count above one button per Action.
 * Buttons come from the Catalog, so a Disabled Reset paints disabled with
 * its sentence. A painter may ask for Device chrome with `context.device`;
 * that choice is local to the painter and never syncs.
 *
 * @example
 * ```typescript
 * counterScreen({ count: 0 })
 * // Column: Text('0', { label: 'count 0', emphasis: 'Display' }),
 * // Row: [+] [-] [Reset (disabled: count is already 0)]
 * ```
 */
export const counterScreen = (
  model: Model,
  context: ActionContext = {},
): UiNode => {
  const count = String(model.count)
  const screen = Column(
    {},
    Text(count, { label: `count ${count}`, emphasis: 'Display' }),
    Row({}, ...actionButtons(Catalog.entries(catalog, model))),
  )
  if (context.device === undefined) {
    return screen
  } else {
    return wrapDevice(
      context.device,
      screen,
      Option.match(maybeCounterUri, {
        onNone: () => ({}),
        onSome: title => ({ title }),
      }),
    )
  }
}
