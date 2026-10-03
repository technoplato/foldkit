import { SyncedCounter, type SyncedCounterModel } from 'counter-core-example'
import { Match as M, Option } from 'effect'
import { Interaction } from 'foldkit'
import { type Document, type Html, html } from 'foldkit/html'
import { type ActionContext } from 'foldkit/message'
import { type MenuMessages, paintFrameHtml } from 'foldkit/renderers/html'

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

const keyPlatform: Interaction.KeyPlatform =
  typeof navigator === 'undefined'
    ? 'Other'
    : Interaction.keyPlatformOf(navigator)

/**
 * The Foldkit HTML Counter window for one painter context. It paints the
 * Program's navigation frame, the screen and whatever is presented over
 * it, and an opener for the action menu, and reports gestures; the Client
 * turns each gesture into the Program's Messages. Every word on it, from
 * `Starting Counter…` to `Actions (⌘K)` and the title, comes from the
 * Program. It never names Increment, Decrement, or Reset.
 */
export const makeView =
  (context: ActionContext) =>
  (model: SyncedCounterModel): Document => {
    const h = html<Interaction.Gesture>()
    const program = Option.match(Option.fromNullishOr(SyncedCounter.screen), {
      onNone: () => SyncedCounter,
      onSome: screen => ({
        ...SyncedCounter,
        screen: (current: SyncedCounterModel) => screen(current, context),
      }),
    })
    const maybeFrame = Interaction.frameOfModel(program, model)
    const status = interaction.status(model)
    const statusLine = (text: string): ReadonlyArray<Html> => [
      h.p([h.Class('counter-status')], [text]),
    ]
    const body = M.value(status).pipe(
      M.withReturnType<ReadonlyArray<Html>>(),
      M.tagsExhaustive({
        Starting: ({ description }) => statusLine(description),
        Failed: ({ description }) => statusLine(description),
        Ready: () => [
          ...Option.match(maybeFrame, {
            onNone: () => [],
            onSome: frame =>
              paintFrameHtml(frame, {
                toMessage: tag => Interaction.PressedAction({ tag }),
                menu: menuGestures,
              }),
          }),
          ...Option.match(Interaction.menuOpenerOf(interaction, keyPlatform), {
            onNone: () => [],
            onSome: opener => [
              h.button(
                [
                  h.Type('button'),
                  h.Class('counter-menu-button'),
                  h.OnClick(Interaction.OpenedMenu()),
                ],
                [opener.label],
              ),
            ],
          }),
        ],
      }),
    )
    return {
      title: Option.getOrElse(
        Option.flatMap(maybeFrame, frame => frame.maybeTitle),
        () => (status._tag === 'Ready' ? '' : status.description),
      ),
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
