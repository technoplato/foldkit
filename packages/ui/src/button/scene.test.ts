import { Match as M, Schema as S } from 'effect'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import * as Scene from 'foldkit/scene'
import { evo } from 'foldkit/struct'

import { describe, it } from '@effect/vitest'

import { view } from './index.js'

const Clicked = m('Clicked')
const Message = S.Union([Clicked])
type Message = typeof Message.Type

type Model = Readonly<{ count: number }>

type UpdateReturn = readonly [Model, ReadonlyArray<never>]

const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      Clicked: () => [evo(model, { count: count => count + 1 }), []],
    }),
  )

const testView =
  ({
    isDisabled = false,
    type,
    isAutofocus = false,
    includeOnClick = true,
  }: Readonly<{
    isDisabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    isAutofocus?: boolean
    includeOnClick?: boolean
  }> = {}) =>
  (model: Model) => {
    const h = html<Message>()

    return view<Message>({
      ...(includeOnClick ? { onClick: Clicked() } : {}),
      isDisabled,
      ...(type === undefined ? {} : { type }),
      isAutofocus,
      toView: ({ button }) =>
        h.div(
          [],
          [
            h.button([...button], ['Save']),
            h.span([h.Id('count')], [String(model.count)]),
          ],
        ),
    })
  }

const button = Scene.role('button')
const count = Scene.selector('#count')

describe('Button view', () => {
  it('defaults type to button, sets tabindex=0, and dispatches onClick', () => {
    Scene.scene(
      { update, view: testView() },
      Scene.with({ count: 0 }),
      Scene.expect(button).toHaveAttr('type', 'button'),
      Scene.expect(button).toHaveAttr('tabIndex', '0'),
      Scene.expect(count).toHaveText('0'),
      Scene.click(button),
      Scene.expect(count).toHaveText('1'),
    )
  })

  it('forwards explicit submit and reset button types', () => {
    Scene.scene(
      { update, view: testView({ type: 'submit' }) },
      Scene.with({ count: 0 }),
      Scene.expect(button).toHaveAttr('type', 'submit'),
    )

    Scene.scene(
      { update, view: testView({ type: 'reset' }) },
      Scene.with({ count: 0 }),
      Scene.expect(button).toHaveAttr('type', 'reset'),
    )
  })

  it('marks aria-disabled and data-disabled and suppresses click when disabled', () => {
    Scene.scene(
      { update, view: testView({ isDisabled: true }) },
      Scene.with({ count: 0 }),
      Scene.expect(button).toHaveAttr('aria-disabled', 'true'),
      Scene.expect(button).toHaveAttr('data-disabled', ''),
      Scene.expect(button).toBeDisabled(),
      Scene.expect(count).toHaveText('0'),
    )
  })

  it('supports autofocus and buttons without an onClick handler', () => {
    Scene.scene(
      {
        update,
        view: testView({ isAutofocus: true, includeOnClick: false }),
      },
      Scene.with({ count: 0 }),
      Scene.expect(button).toHaveAttr('type', 'button'),
      Scene.expect(button).toHaveAttr('tabIndex', '0'),
      Scene.expect(count).toHaveText('0'),
    )
  })
})
