import { Predicate } from 'effect'
import { Input as CoreInput } from 'foldkit/behavior'
import { type Attribute, type Html, html } from 'foldkit/html'

// VIEW

/** Attribute groups the input component provides to the consumer's `toView` callback. */
export type InputAttributes<ParentMessage> = Readonly<{
  input: ReadonlyArray<Attribute<ParentMessage>>
  label: ReadonlyArray<Attribute<ParentMessage>>
  description: ReadonlyArray<Attribute<ParentMessage>>
}>

/** Configuration for rendering an input with `view`. */
export type ViewConfig<ParentMessage> = Readonly<{
  id: string
  toView: (attributes: InputAttributes<ParentMessage>) => Html
  onInput?: (value: string) => ParentMessage
  value?: string
  isDisabled?: boolean
  isInvalid?: boolean
  isAutofocus?: boolean
  name?: string
  type?: string
  placeholder?: string
}>

/** Generates the description element ID from the input's base ID. */
export const descriptionId = (id: string): string => CoreInput.descriptionId(id)

/** Renders an accessible input by building ARIA attribute groups and delegating layout to the consumer's `toView` callback. */
export const view = <ParentMessage>(
  config: ViewConfig<ParentMessage>,
): Html => {
  const h = html<ParentMessage>()

  const {
    toView,
    id,
    onInput,
    value,
    isAutofocus = false,
    name,
    type = CoreInput.defaultInputType,
    placeholder,
  } = config
  const isDisabled = CoreInput.isDisabledOf(config)
  const isInvalid = CoreInput.isInvalidOf(config)

  const disabledAttributes = isDisabled
    ? [h.AriaDisabled(true), h.Disabled(true), h.DataAttribute('disabled', '')]
    : []

  const invalidAttributes = isInvalid
    ? [h.AriaInvalid(true), h.DataAttribute('invalid', '')]
    : []

  const inputAttributes =
    Predicate.isNotUndefined(onInput) && CoreInput.canInput({ isDisabled })
      ? [h.OnInput(onInput)]
      : []

  const valueAttributes = Predicate.isNotUndefined(value)
    ? [h.Value(value)]
    : []

  const autofocusAttributes = isAutofocus ? [h.Autofocus(true)] : []

  const nameAttributes = Predicate.isNotUndefined(name) ? [h.Name(name)] : []

  const placeholderAttributes = Predicate.isNotUndefined(placeholder)
    ? [h.Placeholder(placeholder)]
    : []

  const allInputAttributes = [
    h.Id(id),
    h.Type(type),
    h.AriaDescribedBy(descriptionId(id)),
    ...disabledAttributes,
    ...invalidAttributes,
    ...inputAttributes,
    ...valueAttributes,
    ...autofocusAttributes,
    ...nameAttributes,
    ...placeholderAttributes,
  ]

  const labelAttributes = [h.For(id)]

  const descriptionAttributes = [h.Id(descriptionId(id))]

  return toView({
    input: allInputAttributes,
    label: labelAttributes,
    description: descriptionAttributes,
  })
}
