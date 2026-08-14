import {
  Decrement,
  Increment,
  type Message,
  type Model,
  Reset,
} from 'counter-core-example'
import { Document, html } from 'foldkit/html'

import { Button } from '@foldkit/ui'

// VIEW

/** Renders the Counter with Foldkit HTML. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  const decrementButton = Button.view<Message>({
    onClick: Decrement(),
    toView: attributes =>
      h.button([...attributes.button, h.Class(buttonStyle)], ['-']),
  })
  const incrementButton = Button.view<Message>({
    onClick: Increment(),
    toView: attributes =>
      h.button([...attributes.button, h.Class(buttonStyle)], ['+']),
  })
  const resetButton = Button.view<Message>({
    onClick: Reset(),
    toView: attributes =>
      h.button([...attributes.button, h.Class(buttonStyle)], ['Reset']),
  })
  const buttons = Reset.valid(model, {})
    ? [decrementButton, resetButton, incrementButton]
    : [decrementButton, incrementButton]

  return {
    title: `Counter: ${model.count}`,
    body: h.div(
      [
        h.Class(
          'min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6',
        ),
      ],
      [
        h.div(
          [h.Class('text-6xl font-bold text-gray-800')],
          [model.count.toString()],
        ),
        h.div([h.Class('flex flex-wrap justify-center gap-4')], buttons),
      ],
    ),
  }
}

// STYLE

const buttonStyle = 'bg-black text-white hover:bg-gray-700 px-4 py-2 transition'
