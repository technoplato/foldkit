import { Match as M, Schema as S } from 'effect'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import * as Scene from 'foldkit/scene'
import { evo } from 'foldkit/struct'

import { describe, expect, it } from '@effect/vitest'

import { descriptionId, legendId, view } from './public.js'

const ToggledDisabled = m('ToggledDisabled')
const Message = S.Union([ToggledDisabled])
type Message = typeof Message.Type

type Model = Readonly<{ isDisabled: boolean }>

type UpdateReturn = readonly [Model, ReadonlyArray<never>]

const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      ToggledDisabled: () => [
        evo(model, { isDisabled: current => !current }),
        [],
      ],
    }),
  )

const testView = (model: Model) => {
  const h = html<Message>()

  return view<Message>({
    id: 'shipping',
    isDisabled: model.isDisabled,
    toView: ({ fieldset, legend, description }) =>
      h.fieldset(
        [...fieldset],
        [
          h.legend([...legend], ['Shipping details']),
          h.p([...description], ['Enter the destination address.']),
          h.input([h.Type('text'), h.Name('street')]),
        ],
      ),
  })
}

const fieldset = Scene.selector('fieldset#shipping')
const legend = Scene.selector('#shipping-legend')
const description = Scene.selector('#shipping-description')

describe('Fieldset view', () => {
  it('derives legendId and descriptionId and links fieldset aria-describedby', () => {
    expect(legendId('shipping')).toBe('shipping-legend')
    expect(descriptionId('shipping')).toBe('shipping-description')

    Scene.scene(
      { update, view: testView },
      Scene.with({ isDisabled: false }),
      Scene.expect(fieldset).toHaveAttr('id', 'shipping'),
      Scene.expect(fieldset).toHaveAttr(
        'aria-describedby',
        'shipping-description',
      ),
      Scene.expect(fieldset).not.toBeDisabled(),
      Scene.expect(fieldset).not.toHaveAttr('data-disabled'),
      Scene.expect(legend).toHaveText('Shipping details'),
      Scene.expect(description).toHaveText('Enter the destination address.'),
    )
  })

  it('marks disabled and data-disabled when isDisabled is true', () => {
    Scene.scene(
      { update, view: testView },
      Scene.with({ isDisabled: true }),
      Scene.expect(fieldset).toBeDisabled(),
      Scene.expect(fieldset).toHaveAttr('data-disabled', ''),
    )
  })
})
