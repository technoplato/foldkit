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
    rows,
    placeholder,
    includeOnInput = true,
  }: Readonly<{
    isDisabled?: boolean
    isInvalid?: boolean
    isAutofocus?: boolean
    name?: string
    rows?: number
    placeholder?: string
    includeOnInput?: boolean
  }> = {}) =>
  (model: Model) => {
    const h = html<Message>()

    return view<Message>({
      id: 'bio',
      value: model.value,
      ...(includeOnInput ? { onInput: value => Changed({ value }) } : {}),
      isDisabled,
      isInvalid,
      isAutofocus,
      ...(name === undefined ? {} : { name }),
      ...(rows === undefined ? {} : { rows }),
      ...(placeholder === undefined ? {} : { placeholder }),
      toView: ({ textarea, label, description }) =>
        h.div(
          [],
          [
            h.label([...label], ['Bio']),
            h.textarea([...textarea], []),
            h.p([...description], ['Tell us about yourself.']),
          ],
        ),
    })
  }

const textarea = Scene.role('textbox')
const label = Scene.selector('label')
const description = Scene.selector('#bio-description')

describe('Textarea view', () => {
  it('derives descriptionId, forwards rows/name/placeholder, links label for and aria-describedby, and dispatches onInput', () => {
    expect(descriptionId('bio')).toBe('bio-description')

    Scene.scene(
      {
        update,
        view: testView({
          name: 'bio',
          rows: 4,
          placeholder: 'Write a short bio',
        }),
      },
      Scene.with({ value: '' }),
      Scene.expect(textarea).toHaveAttr('id', 'bio'),
      Scene.expect(textarea).toHaveAttr('name', 'bio'),
      Scene.expect(textarea).toHaveAttr('rows', '4'),
      Scene.expect(textarea).toHaveAttr('placeholder', 'Write a short bio'),
      Scene.expect(textarea).toHaveAttr('aria-describedby', 'bio-description'),
      Scene.expect(label).toHaveAttr('htmlFor', 'bio'),
      Scene.expect(description).toHaveText('Tell us about yourself.'),
      Scene.type(textarea, 'Line one\nLine two'),
      Scene.expect(textarea).toHaveValue('Line one\nLine two'),
    )
  })

  it('marks aria-disabled, disabled, and data-disabled and suppresses onInput when disabled', () => {
    Scene.scene(
      { update, view: testView({ isDisabled: true }) },
      Scene.with({ value: 'locked' }),
      Scene.expect(textarea).toBeDisabled(),
      Scene.expect(textarea).toHaveAttr('aria-disabled', 'true'),
      Scene.expect(textarea).toHaveAttr('data-disabled', ''),
      Scene.expect(textarea).not.toHaveHandler('input'),
    )
  })

  it('marks aria-invalid and data-invalid when invalid', () => {
    Scene.scene(
      { update, view: testView({ isInvalid: true }) },
      Scene.with({ value: 'too short' }),
      Scene.expect(textarea).toHaveAttr('aria-invalid', 'true'),
      Scene.expect(textarea).toHaveAttr('data-invalid', ''),
    )
  })

  it('renders cleanly without an onInput handler', () => {
    Scene.scene(
      { update, view: testView({ includeOnInput: false }) },
      Scene.with({ value: 'static\ntext' }),
      Scene.expect(textarea).toHaveValue('static\ntext'),
      Scene.expect(textarea).not.toHaveHandler('input'),
    )
  })
})
