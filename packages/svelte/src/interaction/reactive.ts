import type { Option } from 'effect'
import { type Interaction, Navigation } from 'foldkit'
import { createSubscriber } from 'svelte/reactivity'

/**
 * A bound Program as Svelte reactive reads. Reading `status`, `screen`, or
 * `menu` inside a component tracks the Program, so the component repaints
 * on every Model change. Presses go through `bound`.
 */
export type ReactiveProgram<Model, Message> = Readonly<{
  bound: Interaction.BoundInteraction<Model, Message>
  model: Model
  status: Interaction.Status
  screen: ReturnType<Interaction.BoundInteraction<Model, Message>['screen']>
  menu: ReturnType<Interaction.BoundInteraction<Model, Message>['menu']>
  frame: Option.Option<Navigation.Frame>
}>

/**
 * Wraps a bound Program for Svelte 5 components. Each read subscribes the
 * reading component, so `{program.status._tag}` repaints when the Model
 * changes, and presses go through `program.bound`.
 *
 * @example
 * ```typescript
 * const counter = reactive(Interaction.bind(SyncedCounter, handle))
 * counter.bound.press('Increment')
 * ```
 */
export const reactive = <Model, Message>(
  bound: Interaction.BoundInteraction<Model, Message>,
): ReactiveProgram<Model, Message> => {
  const track = createSubscriber(update => bound.subscribe(update))
  return {
    bound,
    get model() {
      track()
      return bound.readModel()
    },
    get status() {
      track()
      return bound.status()
    },
    get screen() {
      track()
      return bound.screen()
    },
    get menu() {
      track()
      return bound.menu()
    },
    get frame() {
      track()
      return Navigation.frameOf(bound)
    },
  }
}
