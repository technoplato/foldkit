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
    type,
    name,
    placeholder,
    includeOnInput = true,
  }: Readonly<{
    isDisabled?: boolean
    isInvalid?: boolean
    type?: string
    name?: string
    placeholder?: string
    includeOnInput?: boolean
  }> = {}) =>
  (model: Model) => {
    const h = html<Message>()

    return view<Message>({
      id: 'email',
      value: model.value,
      ...(includeOnInput ? { onInput: value => Changed({ value }) } : {}),
      isDisabled,
      isInvalid,
      ...(type === undefined ? {} : { type }),
      ...(name === undefined ? {} : { name }),
      ...(placeholder === undefined ? {} : { placeholder }),
      toView: ({ input, label, description }) =>
        h.div(
          [],
          [
            h.label([...label], ['Email']),
            h.input([...input]),
            h.p([...description], ['We will never share your email.']),
          ],
        ),
    })
  }

const input = Scene.role('textbox')
const label = Scene.selector('label')
const description = Scene.selector('#email-description')

describe('Input view', () => {
  it('derives descriptionId, defaults type to text, links label for and aria-describedby, and dispatches onInput', () => {
    expect(descriptionId('email')).toBe('email-description')

    Scene.scene(
      {
        update,
        view: testView({ name: 'email', placeholder: 'you@example.com' }),
      },
      Scene.with({ value: '' }),
      Scene.expect(input).toHaveAttr('id', 'email'),
      Scene.expect(input).toHaveAttr('type', 'text'),
      Scene.expect(input).toHaveAttr('name', 'email'),
      Scene.expect(input).toHaveAttr('placeholder', 'you@example.com'),
      Scene.expect(input).toHaveAttr('aria-describedby', 'email-description'),
      Scene.expect(label).toHaveAttr('htmlFor', 'email'),
      Scene.expect(description).toHaveText('We will never share your email.'),
      Scene.type(input, 'ada@example.com'),
      Scene.expect(input).toHaveValue('ada@example.com'),
    )
  })

  it('forwards explicit input types', () => {
    Scene.scene(
      { update, view: testView({ type: 'email' }) },
      Scene.with({ value: 'ada@example.com' }),
      Scene.expect(input).toHaveAttr('type', 'email'),
      Scene.expect(input).toHaveValue('ada@example.com'),
    )
  })

  it('marks aria-disabled, disabled, and data-disabled and suppresses onInput when disabled', () => {
    Scene.scene(
      { update, view: testView({ isDisabled: true }) },
      Scene.with({ value: 'locked' }),
      Scene.expect(input).toBeDisabled(),
      Scene.expect(input).toHaveAttr('aria-disabled', 'true'),
      Scene.expect(input).toHaveAttr('data-disabled', ''),
      Scene.expect(input).not.toHaveHandler('input'),
    )
  })

  it('marks aria-invalid and data-invalid when invalid', () => {
    Scene.scene(
      { update, view: testView({ isInvalid: true }) },
      Scene.with({ value: 'bad' }),
      Scene.expect(input).toHaveAttr('aria-invalid', 'true'),
      Scene.expect(input).toHaveAttr('data-invalid', ''),
    )
  })

  it('renders cleanly without an onInput handler', () => {
    Scene.scene(
      { update, view: testView({ includeOnInput: false }) },
      Scene.with({ value: 'static' }),
      Scene.expect(input).toHaveValue('static'),
      Scene.expect(input).not.toHaveHandler('input'),
    )
  })
})
