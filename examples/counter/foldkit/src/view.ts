import {
  SyncedCounter,
  type SyncedCounterModel,
  initialCount,
} from 'counter-core-example'
import { Match as M, Option } from 'effect'
import { Interaction } from 'foldkit'
import { type Document, type Html, html } from 'foldkit/html'
import { type ActionContext } from 'foldkit/message'
import {
  type MenuMessages,
  paintHtml,
  paintMenuHtml,
} from 'foldkit/renderers/html'

// VIEW

const interaction = Option.getOrThrowWith(
  Option.fromNullishOr(SyncedCounter.interaction),
  () => new Error('SyncedCounter must carry an interaction'),
)

const menuGestures: MenuMessages<Interaction.Gesture> = {
  typed: (query: string) => Interaction.TypedInMenu({ query }),
  chose: (tag: string) => Interaction.ChoseFromMenu({ tag }),
  dismissed: () => Interaction.DismissedMenu(),
}

const countOf = (model: SyncedCounterModel): number =>
  model._tag === 'Ready' ? model.count : initialCount

/**
 * The Foldkit HTML Counter window for one painter context. It paints the
 * Program's screen and presented action menu and reports gestures; the
 * Client turns each gesture into the Program's Messages. It never names
 * Increment, Decrement, or Reset.
 */
export const makeView =
  (context: ActionContext) =>
  (model: SyncedCounterModel): Document => {
    const h = html<Interaction.Gesture>()
    const status = (text: string): ReadonlyArray<Html> => [
      h.p([h.Class('counter-status')], [text]),
    ]
    const body = M.value(interaction.status(model)).pipe(
      M.withReturnType<ReadonlyArray<Html>>(),
      M.tagsExhaustive({
        Starting: () => status('Starting Instant Counter…'),
        Failed: ({ description }) => status(description),
        Ready: () => [
          ...Option.match(Option.fromNullishOr(SyncedCounter.screen), {
            onNone: () => [],
            onSome: screen => [
              paintHtml(screen(model, context), tag =>
                Interaction.PressedAction({ tag }),
              ),
            ],
          }),
          h.button(
            [
              h.Type('button'),
              h.Class('counter-menu-button'),
              h.OnClick(Interaction.OpenedMenu()),
            ],
            ['Actions (⌘K)'],
          ),
          ...Option.match(interaction.menu(model), {
            onNone: () => [],
            onSome: menu => [paintMenuHtml(menu, menuGestures)],
          }),
        ],
      }),
    )
    return {
      title: `Foldkit Counter: ${countOf(model)}`,
      body: h.div(
        [
          h.Class(
            'counter-screen min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6',
          ),
        ],
        body,
      ),
    }
  }

/** The Counter window without Device chrome. */
export const view = makeView({})

/** The Counter window inside phone chrome, for counter-mobile. */
export const phoneView = makeView({ device: 'phone' })
