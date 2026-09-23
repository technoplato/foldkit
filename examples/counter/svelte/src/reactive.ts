import { type Interaction } from 'foldkit'
import { createSubscriber } from 'svelte/reactivity'

/**
 * A bound Program as Svelte reactive reads. Reading `status`, `screen`, or
 * `menu` inside a component tracks the Program, so the component repaints
 * on every Model change. Presses go through `bound`.
 */
export type ReactiveProgram<Model, Message> = Readonly<{
  bound: Interaction.BoundInteraction<Model, Message>
  readonly model: Model
  readonly status: Interaction.Status
  readonly screen: ReturnType<
    Interaction.BoundInteraction<Model, Message>['screen']
  >
  readonly menu: ReturnType<
    Interaction.BoundInteraction<Model, Message>['menu']
  >
}>

/** Wraps a bound Program for Svelte 5 components. */
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
  }
}
