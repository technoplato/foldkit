import { Option } from 'effect'
import { Switch as CoreSwitch } from 'foldkit/behavior'
import { type Attribute, type Html, html } from 'foldkit/html'

// VIEW

/** Attribute groups the switch provides to the consumer's `toView` callback.
 *  Each group is a `ReadonlyArray<Attribute<Message>>` the consumer
 *  spreads into its own element attribute arrays. The `button` and `label`
 *  bundles carry the click and Space handlers that dispatch the configured
 *  `onToggle` Message. */
export type SwitchAttributes<Message> = Readonly<{
  button: ReadonlyArray<Attribute<Message>>
  label: ReadonlyArray<Attribute<Message>>
  description: ReadonlyArray<Attribute<Message>>
  hiddenInput: ReadonlyArray<Attribute<Message>>
}>

/** Per-render view configuration for the stateless controlled {@link view}.
 *  Generic over `Message` (the message `onToggle` dispatches).
 *
 *  - `isChecked`: the current checked state, read straight from the parent
 *    Model. `aria-checked` and the `data-checked` marker derive from it.
 *  - `onToggle`: dispatched with the new checked state when the user clicks
 *    the switch or its label, or presses Space. Handle it in the parent's
 *    `update` by storing the value.
 *  - `toView`: receives the {@link SwitchAttributes} and lays out the
 *    switch. */
export type ViewConfig<Message> = Readonly<{
  id: string
  isChecked: boolean
  onToggle: (isChecked: boolean) => Message
  toView: (attributes: SwitchAttributes<Message>) => Html
  isDisabled?: boolean
  name?: string
  value?: string
}>

/** Renders an accessible switch as a stateless controlled component. The
 *  parent owns the checked state (`isChecked`) and receives the new state via
 *  `onToggle` when the user toggles it.
 *
 *  ```ts
 *  // In view:
 *  Switch.view<Message>({
 *    id: 'notifications',
 *    isChecked: model.notificationsEnabled,
 *    onToggle: isChecked => ToggledNotifications({ isChecked }),
 *    toView: attributes => ...,
 *  })
 *
 *  // In update:
 *  ToggledNotifications: ({ isChecked }) => [
 *    evo(model, { notificationsEnabled: () => isChecked }),
 *    [],
 *  ],
 *  ``` */
export const view = <Message>(config: ViewConfig<Message>): Html => {
  const h = html<Message>()

  const {
    id,
    isChecked,
    onToggle,
    toView,
    isDisabled = false,
    name,
    value,
  } = config

  const maybeNextChecked = CoreSwitch.nextCheckedOf({ isChecked, isDisabled })
  const labelId = CoreSwitch.labelId(id)
  const descriptionId = CoreSwitch.descriptionId(id)

  const checkedAttributes = isChecked ? [h.DataAttribute('checked', '')] : []

  const disabledAttributes = isDisabled
    ? [h.AriaDisabled(true), h.DataAttribute('disabled', '')]
    : []

  const interactiveButtonAttributes = Option.match(maybeNextChecked, {
    onNone: () => [],
    onSome: nextChecked => [
      h.OnClick(onToggle(nextChecked)),
      h.OnKeyUpPreventDefault((key: string) =>
        CoreSwitch.isToggleKey(key)
          ? Option.some(onToggle(nextChecked))
          : Option.none(),
      ),
    ],
  })

  const interactiveLabelAttributes = Option.match(maybeNextChecked, {
    onNone: () => [],
    onSome: nextChecked => [h.OnClick(onToggle(nextChecked))],
  })

  const buttonAttributes = [
    h.Role('switch'),
    h.AriaChecked(isChecked),
    h.AriaLabelledBy(labelId),
    h.AriaDescribedBy(descriptionId),
    h.Tabindex(0),
    ...checkedAttributes,
    ...disabledAttributes,
    ...interactiveButtonAttributes,
  ]

  const labelAttributes = [h.Id(labelId), ...interactiveLabelAttributes]

  const descriptionAttributes = [h.Id(descriptionId)]

  const hiddenInputAttributes = name
    ? [
        h.Type('hidden'),
        h.Name(name),
        h.Value(CoreSwitch.formValueOf(isChecked, value)),
      ]
    : []

  return toView({
    button: buttonAttributes,
    label: labelAttributes,
    description: descriptionAttributes,
    hiddenInput: hiddenInputAttributes,
  })
}
