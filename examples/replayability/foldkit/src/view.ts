import { Array, Option } from 'effect'
import { Document, html } from 'foldkit/html'
import { ReplayPresentation, Workbench } from 'replayability-core-example'

// VIEW

type Presentation = Readonly<{
  detail: string
  display: string
  mode: string
  title: string
}>

type Model = Workbench.Model
type Message = Workbench.Message

const presentationForModel = (model: Model): Presentation => {
  return {
    detail: Workbench.detailForModel(model),
    display: Workbench.displayForModel(model),
    mode: Workbench.modeForModel(model),
    title: Workbench.titleForModel(model),
  }
}

const actionButtonStyleFor = (
  isSelected: boolean,
  isFuture: boolean,
): string => {
  if (isSelected) {
    return selectedActionButtonStyle
  } else if (isFuture) {
    return futureActionButtonStyle
  } else {
    return actionButtonStyle
  }
}

const pickerButtonStyle = (
  model: Workbench.ReadyModel,
  actionId: string,
): string => {
  if (
    model._tag === 'Calculator' &&
    (actionId.startsWith('operation-') || actionId === 'equals')
  ) {
    return calculatorOperationButtonStyle
  } else if (
    model._tag === 'Calculator' &&
    (actionId === 'backspace' || actionId === 'clear' || actionId === 'percent')
  ) {
    return calculatorUtilityButtonStyle
  } else if (model._tag === 'Calculator') {
    return calculatorNumberButtonStyle
  } else {
    return genericPickerButtonStyle
  }
}

const readyView = (model: Workbench.ReadyModel): Document => {
  const h = html<Message>()
  const presentation = presentationForModel(model)
  const actions = ReplayPresentation.actionsForModel(model)
  const transitions = ReplayPresentation.transitionsForModel(model)

  return {
    title: `${presentation.title} replay | Foldkit`,
    body: h.main(
      [h.Class('min-h-screen bg-zinc-950 p-4 text-zinc-50')],
      [
        h.div(
          [
            h.Class(
              'mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]',
            ),
          ],
          [
            h.section(
              [
                h.Class(
                  'rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl',
                ),
              ],
              [
                h.div(
                  [
                    h.Class(
                      'mb-6 flex flex-wrap items-start justify-between gap-4',
                    ),
                  ],
                  [
                    h.div(
                      [],
                      [
                        h.p(
                          [
                            h.Class(
                              'mb-2 text-sm uppercase tracking-[0.22em] text-sky-300',
                            ),
                          ],
                          ['Foldkit host | shared Program runtime'],
                        ),
                        h.h1(
                          [h.Class('text-3xl font-semibold tracking-tight')],
                          [`Replay ${presentation.title}`],
                        ),
                        h.p(
                          [h.Class('mt-2 max-w-2xl text-zinc-400')],
                          [
                            'The engine parses, prints, reconstructs, and extends this typed Program tape. This Foldkit client only renders it and sends allowed Messages.',
                          ],
                        ),
                        h.div(
                          [h.Class('mt-4 flex flex-wrap gap-2')],
                          [
                            h.a(
                              [
                                h.Href(model.stateUri),
                                h.Class(linkButtonStyle),
                              ],
                              ['open this state'],
                            ),
                            h.button(
                              [
                                h.OnClick(Workbench.ClickedSaveReplay()),
                                h.Disabled(
                                  model.replaySaveStatus._tag ===
                                    'SavingReplay',
                                ),
                                h.Class(linkButtonStyle),
                              ],
                              [
                                model.replaySaveStatus._tag === 'SavingReplay'
                                  ? 'saving tape…'
                                  : 'save tape',
                              ],
                            ),
                            ...(model.replaySaveStatus._tag === 'SavedReplay'
                              ? [
                                  h.a(
                                    [
                                      h.Href(model.replaySaveStatus.uri),
                                      h.Class(linkButtonStyle),
                                    ],
                                    ['share paused link'],
                                  ),
                                  h.a(
                                    [
                                      h.Href(
                                        model.replaySaveStatus.autoplayUri,
                                      ),
                                      h.Class(linkButtonStyle),
                                    ],
                                    ['share autoplay link'],
                                  ),
                                ]
                              : []),
                          ],
                        ),
                        ...(model.replaySaveStatus._tag === 'FailedSavingReplay'
                          ? [
                              h.p(
                                [h.Class('mt-2 text-sm text-red-300')],
                                [model.replaySaveStatus.reason],
                              ),
                            ]
                          : []),
                      ],
                    ),
                    h.div(
                      [h.Class('flex flex-wrap gap-2')],
                      [
                        h.button(
                          [
                            h.OnClick(
                              Workbench.SelectedReplayProgram({
                                programId: 'Counters',
                              }),
                            ),
                            h.Class(
                              model._tag === 'Counters'
                                ? selectedExampleButtonStyle
                                : exampleButtonStyle,
                            ),
                          ],
                          ['Counters'],
                        ),
                        h.button(
                          [
                            h.OnClick(
                              Workbench.SelectedReplayProgram({
                                programId: 'Counter',
                              }),
                            ),
                            h.Class(
                              model._tag === 'Counter'
                                ? selectedExampleButtonStyle
                                : exampleButtonStyle,
                            ),
                          ],
                          ['Counter'],
                        ),
                        h.button(
                          [
                            h.OnClick(
                              Workbench.SelectedReplayProgram({
                                programId: 'Calculator',
                              }),
                            ),
                            h.Class(
                              model._tag === 'Calculator'
                                ? selectedExampleButtonStyle
                                : exampleButtonStyle,
                            ),
                          ],
                          ['Calculator'],
                        ),
                        h.button(
                          [
                            h.OnClick(
                              Workbench.SelectedReplayProgram({
                                programId: 'Fact',
                              }),
                            ),
                            h.Class(
                              model._tag === 'Fact'
                                ? selectedExampleButtonStyle
                                : exampleButtonStyle,
                            ),
                          ],
                          ['Fact'],
                        ),
                      ],
                    ),
                  ],
                ),
                Option.isSome(model.maybeError)
                  ? h.p(
                      [
                        h.Class(
                          'mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100',
                        ),
                      ],
                      [model.maybeError.value],
                    )
                  : h.empty,
                h.div(
                  [h.Class('grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]')],
                  [
                    h.section(
                      [
                        h.Class(
                          'grid min-h-80 place-items-center rounded-3xl border border-white/10 bg-black p-8 text-center',
                        ),
                      ],
                      [
                        h.div(
                          [],
                          [
                            h.p(
                              [
                                h.Class(
                                  'mb-3 font-mono text-sm uppercase tracking-[0.2em] text-zinc-500',
                                ),
                              ],
                              [
                                `${model.controllerMode} | ${presentation.mode}`,
                              ],
                            ),
                            h.div(
                              [
                                h.Class(
                                  model._tag === 'Fact'
                                    ? 'max-w-3xl text-3xl font-semibold leading-tight md:text-5xl'
                                    : 'text-7xl font-semibold tabular-nums md:text-8xl',
                                ),
                              ],
                              [presentation.display],
                            ),
                            h.p(
                              [h.Class('mt-4 text-zinc-400')],
                              [presentation.detail],
                            ),
                          ],
                        ),
                      ],
                    ),
                    h.aside(
                      [
                        h.Class(
                          'rounded-3xl border border-white/10 bg-zinc-950 p-4',
                        ),
                      ],
                      [
                        h.h2(
                          [h.Class('text-lg font-semibold')],
                          ['New live Messages'],
                        ),
                        h.p(
                          [h.Class('mt-2 text-sm text-zinc-400')],
                          [
                            'This manifest limits what the host can send. The tape itself stores the typed Messages.',
                          ],
                        ),
                        h.div(
                          [
                            h.Class(
                              model._tag === 'Calculator'
                                ? calculatorKeypadStyle
                                : genericPickerGridStyle,
                            ),
                          ],
                          Array.map(actions, action =>
                            h.button(
                              [
                                h.Key(action.id),
                                h.OnClick(
                                  Workbench.PressedReplayAction({
                                    actionId: action.id,
                                  }),
                                ),
                                h.Class(pickerButtonStyle(model, action.id)),
                              ],
                              [action.label],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                h.section(
                  [
                    h.Class(
                      'mt-4 rounded-3xl border border-white/10 bg-zinc-950 p-4',
                    ),
                  ],
                  [
                    h.div(
                      [
                        h.Class(
                          'flex flex-wrap items-center justify-between gap-3',
                        ),
                      ],
                      [
                        h.div(
                          [],
                          [
                            h.h2(
                              [h.Class('font-semibold')],
                              ['Timeline scrubber'],
                            ),
                            h.p(
                              [h.Class('text-sm text-zinc-400')],
                              [
                                `Frame ${model.currentFrame.toString()} of ${model.finalFrame.toString()}`,
                              ],
                            ),
                          ],
                        ),
                        h.div(
                          [h.Class('flex gap-2')],
                          [
                            h.button(
                              [
                                h.OnClick(Workbench.ClickedStepBackward()),
                                h.Disabled(model.currentFrame <= 0),
                                h.Class(controlButtonStyle),
                              ],
                              ['back'],
                            ),
                            h.button(
                              [
                                h.OnClick(Workbench.ClickedPlayback()),
                                h.Class(controlButtonStyle),
                              ],
                              [model.playback === 'Playing' ? 'pause' : 'play'],
                            ),
                            h.button(
                              [
                                h.OnClick(Workbench.ClickedStepForward()),
                                h.Disabled(
                                  model.currentFrame >= model.finalFrame,
                                ),
                                h.Class(controlButtonStyle),
                              ],
                              ['forward'],
                            ),
                          ],
                        ),
                      ],
                    ),
                    h.input([
                      h.Type('range'),
                      h.Min('0'),
                      h.Max(model.finalFrame.toString()),
                      h.Value(model.currentFrame.toString()),
                      h.OnInput(value =>
                        Workbench.ChangedReplayFrame({
                          frame: globalThis.Number.parseInt(value, 10),
                        }),
                      ),
                      h.Class('mt-4 w-full accent-sky-400'),
                    ]),
                  ],
                ),
              ],
            ),
            h.section(
              [
                h.Class(
                  'rounded-3xl border border-white/10 bg-zinc-900 p-4 shadow-2xl',
                ),
              ],
              [
                h.h2(
                  [h.Class('mb-3 text-lg font-semibold')],
                  ['Recorded Messages'],
                ),
                h.ol(
                  [h.Class('grid gap-2')],
                  Array.map(transitions, transition => {
                    const isFuture = transition.sequence > model.currentFrame
                    const isSelected =
                      transition.sequence === model.currentFrame
                    return h.li(
                      [h.Key(transition.sequence.toString())],
                      [
                        h.button(
                          [
                            h.OnClick(
                              Workbench.ChangedReplayFrame({
                                frame: transition.sequence,
                              }),
                            ),
                            h.Class(actionButtonStyleFor(isSelected, isFuture)),
                          ],
                          [
                            h.span(
                              [h.Class('flex items-center gap-2')],
                              [
                                h.span(
                                  [h.Class('text-zinc-500')],
                                  [
                                    transition.sequence
                                      .toString()
                                      .padStart(2, '0'),
                                  ],
                                ),
                                h.strong(
                                  [h.Class('min-w-0 truncate font-medium')],
                                  [transition.messageName],
                                ),
                                h.span(
                                  [h.Class('ml-auto text-zinc-500')],
                                  [transition.sourceName],
                                ),
                              ],
                            ),
                            h.span(
                              [
                                h.Class(
                                  'mt-2 block min-w-0 truncate text-xs text-sky-200/80',
                                ),
                              ],
                              [`payload ${transition.messagePayload}`],
                            ),
                            h.span(
                              [
                                h.Class(
                                  'mt-2 grid min-w-0 gap-1 text-[11px] text-zinc-400',
                                ),
                              ],
                              [
                                h.span(
                                  [h.Class('flex min-w-0 gap-2')],
                                  [
                                    h.span(
                                      [h.Class('w-12 shrink-0 text-zinc-600')],
                                      ['before'],
                                    ),
                                    h.code(
                                      [h.Class('min-w-0 truncate')],
                                      [transition.previousModel],
                                    ),
                                  ],
                                ),
                                h.span(
                                  [h.Class('flex min-w-0 gap-2')],
                                  [
                                    h.span(
                                      [
                                        h.Class(
                                          'w-12 shrink-0 text-sky-500/70',
                                        ),
                                      ],
                                      ['after'],
                                    ),
                                    h.code(
                                      [h.Class('min-w-0 truncate')],
                                      [transition.nextModel],
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ],
                        ),
                      ],
                    )
                  }),
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  }
}

const statusView = (model: Model): Document => {
  const h = html<Message>()
  const presentation = presentationForModel(model)
  return {
    title: `${presentation.title} replay | Foldkit`,
    body: h.main(
      [
        h.Class(
          'grid min-h-screen place-items-center bg-zinc-950 p-6 text-zinc-50',
        ),
      ],
      [
        h.section(
          [
            h.Class(
              'w-full max-w-xl rounded-3xl border border-white/10 bg-zinc-900 p-8 text-center shadow-2xl',
            ),
          ],
          [
            h.p(
              [h.Class('text-sm uppercase tracking-[0.22em] text-sky-300')],
              ['Foldkit host | shared Program runtime'],
            ),
            h.h1(
              [h.Class('mt-4 text-3xl font-semibold')],
              [presentation.display],
            ),
            h.p([h.Class('mt-3 text-zinc-400')], [presentation.detail]),
          ],
        ),
      ],
    ),
  }
}

/** Renders the typed replay controller through Foldkit HTML. */
export const view = (model: Model): Document => {
  if (Workbench.isReady(model)) {
    return readyView(model)
  } else {
    return statusView(model)
  }
}

const controlButtonStyle =
  'rounded-xl border border-white/10 bg-zinc-800 px-3 py-2 text-sm transition enabled:hover:bg-zinc-700 disabled:opacity-40'
const linkButtonStyle =
  'rounded-xl border border-sky-400/40 bg-sky-400/10 px-3 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20'
const exampleButtonStyle =
  'rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-zinc-300'
const selectedExampleButtonStyle =
  'rounded-xl border border-sky-400 bg-sky-400/10 px-3 py-2 text-sm text-sky-100'
const actionButtonStyle =
  'block w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-950 px-3 py-3 text-left font-mono text-sm text-zinc-300 transition hover:bg-zinc-800'
const futureActionButtonStyle = `${actionButtonStyle} opacity-35`
const selectedActionButtonStyle =
  'block w-full overflow-hidden rounded-xl border border-sky-400 bg-sky-400/10 px-3 py-3 text-left font-mono text-sm text-sky-100 transition'
const genericPickerGridStyle = 'mt-4 grid grid-cols-2 gap-2'
const genericPickerButtonStyle =
  'rounded-xl border border-white/10 bg-zinc-800 px-3 py-2 text-left text-sm transition hover:bg-zinc-700'
const calculatorKeypadStyle = 'mt-5 grid grid-cols-4 gap-2'
const calculatorBaseButtonStyle =
  'aspect-square rounded-full text-xl font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
const calculatorNumberButtonStyle = `${calculatorBaseButtonStyle} bg-zinc-800 text-white hover:bg-zinc-700`
const calculatorOperationButtonStyle = `${calculatorBaseButtonStyle} bg-orange-500 text-white hover:bg-orange-400`
const calculatorUtilityButtonStyle = `${calculatorBaseButtonStyle} bg-zinc-500 text-white hover:bg-zinc-400`
