import { Predicate } from 'effect'
import { Toggle as CoreToggle } from 'foldkit/behavior'
import { type Attribute, type Html, html } from 'foldkit/html'

// VIEW

/** Attribute groups the button component provides to the consumer's `toView` callback. */
export type ButtonAttributes<ParentMessage> = Readonly<{
  button: ReadonlyArray<Attribute<ParentMessage>>
}>

/** Configuration for rendering a button with `view`. */
export type ViewConfig<ParentMessage> = Readonly<{
  toView: (attributes: ButtonAttributes<ParentMessage>) => Html
  onClick?: ParentMessage
  isDisabled?: boolean
  type?: CoreToggle.ButtonType
  isAutofocus?: boolean
}>

/** Renders an accessible button by building attribute groups and delegating layout to the consumer's `toView` callback. */
export const view = <ParentMessage>(
  config: ViewConfig<ParentMessage>,
): Html => {
  const h = html<ParentMessage>()

  const { toView, onClick, isAutofocus = false } = config
  const isDisabled = CoreToggle.isDisabledOf(config)
  const resolvedType = CoreToggle.buttonTypeOf(config)

  const disabledAttributes = isDisabled
    ? [h.AriaDisabled(true), h.DataAttribute('disabled', '')]
    : []

  const clickAttributes =
    Predicate.isNotUndefined(onClick) && CoreToggle.canClick({ isDisabled })
      ? [h.OnClick(onClick)]
      : []

  const autofocusAttributes = isAutofocus ? [h.Autofocus(true)] : []

  const buttonAttributes = [
    h.Type(resolvedType),
    h.Tabindex(0),
    ...disabledAttributes,
    ...clickAttributes,
    ...autofocusAttributes,
  ]

  return toView({
    button: buttonAttributes,
  })
}
