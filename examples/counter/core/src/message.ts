import { Catalog } from 'foldkit'

import { type Model, initialCount } from './model.js'

// MESSAGE

/** Raises the count by one. `+` and `=` press it. */
export const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'The person wants a higher count',
  meta: { label: '+', keys: ['+', '='] },
})

/** Lowers the count by one. `-` presses it. */
export const Decrement = Catalog.action('Decrement', {
  what: 'Decrements the count by one',
  why: 'The person wants a lower count',
  meta: { label: '-', keys: ['-'] },
})

/** Sets the count back to 0. Disabled while the count is already 0. */
export const Reset = Catalog.action('Reset', {
  what: 'Sets the count to 0',
  why: 'The person wants to start over',
  enabled: (model: Model) =>
    model.count === initialCount
      ? Catalog.Disabled({ because: 'count is already 0' })
      : Catalog.Enabled(),
  meta: { label: 'Reset', keys: ['r'] },
})

/**
 * Every Counter Action in the order surfaces list them. Buttons, the action
 * menu, keyboard shortcuts, and CLI commands all derive from this value.
 */
export const catalog = Catalog.make([Increment, Decrement, Reset])

/** Every Message the Counter Program accepts. */
export const Message = catalog.Message
/** A Counter Message value. */
export type Message = typeof Message.Type
