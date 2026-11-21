import { Match as M, Schema as S } from 'effect'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import * as Scene from 'foldkit/scene'
import { evo } from 'foldkit/struct'

import { describe, expect, it } from '@effect/vitest'

import { descriptionId, view } from './index.js'

const Changed = m('Changed', { value: S.String })
const Message = S.Union([Changed])
type Message = typeof Message.Type

type Model = Readonly<{ value: string }>

type UpdateReturn = readonly [Model, ReadonlyArray<never>]

const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      Changed: ({ value }) => [evo(model, { value: () => value }), []],
    }),
  )

const testView =
  ({
    isDisabled = false,
    isInvalid = false,
    isAutofocus = false,
    name,
    includeOnChange = true,
  }: Readonly<{
    isDisabled?: boolean
    isInvalid?: boolean
    isAutofocus?: boolean
    name?: string
    includeOnChange?: boolean
  }> = {}) =>
  (model: Model) => {
    const h = html<Message>()

    return view<Message>({
      id: 'fruit',
      value: model.value,
      ...(includeOnChange ? { onChange: value => Changed({ value }) } : {}),
      isDisabled,
      isInvalid,
      isAutofocus,
      ...(name === undefined ? {} : { name }),
      toView: ({ select, label, description }) =>
        h.div(
          [],
          [
            h.label([...label], ['Favorite fruit']),
            h.select(
              [...select],
              [
                h.option([h.Value('apple')], ['Apple']),
                h.option([h.Value('cherry')], ['Cherry']),
              ],
            ),
            h.p([...description], ['Pick your favorite fruit.']),
          ],
        ),
    })
  }

const select = Scene.selector('#fruit')
const label = Scene.selector('label')
const description = Scene.selector('#fruit-description')

describe('Select view', () => {
  it('derives descriptionId, forwards name/autofocus, links label for and aria-describedby, and dispatches onChange', () => {
    expect(descriptionId('fruit')).toBe('fruit-description')

    Scene.scene(
      {
        update,
        view: testView({ name: 'fruit', isAutofocus: true }),
      },
      Scene.with({ value: 'apple' }),
      Scene.expect(select).toHaveAttr('id', 'fruit'),
      Scene.expect(select).toHaveAttr('name', 'fruit'),
      Scene.expect(select).toHaveAttr('aria-describedby', 'fruit-description'),
      Scene.expect(label).toHaveAttr('htmlFor', 'fruit'),
      Scene.expect(description).toHaveText('Pick your favorite fruit.'),
      Scene.expect(select).toHaveValue('apple'),
      Scene.change(select, 'cherry'),
      Scene.expect(select).toHaveValue('cherry'),
    )
  })

  it('marks aria-disabled, disabled, and data-disabled and suppresses onChange when disabled', () => {
    Scene.scene(
      { update, view: testView({ isDisabled: true }) },
      Scene.with({ value: 'apple' }),
      Scene.expect(select).toBeDisabled(),
      Scene.expect(select).toHaveAttr('aria-disabled', 'true'),
      Scene.expect(select).toHaveAttr('data-disabled', ''),
      Scene.expect(select).not.toHaveHandler('change'),
    )
  })

  it('marks aria-invalid and data-invalid when invalid', () => {
    Scene.scene(
      { update, view: testView({ isInvalid: true }) },
      Scene.with({ value: 'apple' }),
      Scene.expect(select).toHaveAttr('aria-invalid', 'true'),
      Scene.expect(select).toHaveAttr('data-invalid', ''),
    )
  })

  it('renders cleanly without an onChange handler', () => {
    Scene.scene(
      { update, view: testView({ includeOnChange: false }) },
      Scene.with({ value: 'cherry' }),
      Scene.expect(select).toHaveValue('cherry'),
      Scene.expect(select).not.toHaveHandler('change'),
    )
  })
})
