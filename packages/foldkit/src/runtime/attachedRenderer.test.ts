import {
  Cause,
  Effect,
  Exit,
  Option,
  Queue,
  Schema as S,
  Scope,
  Stream,
} from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { brandViewResult } from '../brand/brand.js'
import * as Command from '../command/index.js'
import { __requireDispatch, defineView, html } from '../html/index.js'
import { m } from '../message/index.js'
import * as Mount from '../mount/index.js'
import * as Program from '../program/program.js'
import { __patchVNode } from '../vdom.js'
import {
  AttachedFoldkitRendererDefect,
  type AttachedProgramModelSource,
  __makeAttachedFoldkitApplicationWithPatch,
  makeAttachedFoldkitApplication,
} from './attachedRenderer.js'

const Model = S.Struct({ count: S.Int, isMounted: S.Boolean })
type Model = typeof Model.Type

const ClickedIncrement = m('ClickedIncrement')
const MountedClient = m('MountedClient')
const ClientInput = S.Union([ClickedIncrement, MountedClient])
type ClientInput = typeof ClientInput.Type

const CompletedStartup = m('CompletedStartup')
const ProgramMessage = S.Union([CompletedStartup])

const makeModelSource = (initialModel: Model) => {
  let currentModel = initialModel
  let unsubscribeCount = 0
  const listeners = new Set<(model: Model) => void>()
  const source: AttachedProgramModelSource<Model> = {
    readModel: () => currentModel,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        unsubscribeCount += 1
        listeners.delete(listener)
      }
    },
  }
  return {
    publish: (model: Model): void => {
      currentModel = model
      listeners.forEach(listener => listener(model))
    },
    readUnsubscribeCount: (): number => unsubscribeCount,
    source,
  }
}

const makeProgram = (
  initialModel: Model,
  lifecycle: Readonly<{
    commandRan: () => void
    initRan: () => void
    updateRan: () => void
  }>,
) => {
  const RunStartup = Command.define(
    'RunStartup',
    CompletedStartup,
  )(
    Effect.sync(() => {
      lifecycle.commandRan()
      return CompletedStartup()
    }),
  )
  return Program.make({
    id: 'attached-counter',
    version: 1,
    Model,
    Message: ProgramMessage,
    init: () => {
      lifecycle.initRan()
      return [initialModel, [RunStartup()]]
    },
    update: model => {
      lifecycle.updateRan()
      return [model, []]
    },
  })
}

const makeContainer = (): HTMLElement => {
  const container = document.createElement('div')
  container.id = 'attached-root'
  document.body.appendChild(container)
  return container
}

const makeScope = (): Scope.Closeable => Effect.runSync(Scope.make())

const closeScope = (scope: Scope.Closeable): Promise<void> =>
  Effect.runPromise(Scope.close(scope, Exit.void))

describe('makeAttachedFoldkitApplication', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('renders external Models and sends ClientInput without running the Program', async () => {
    let initRuns = 0
    let updateRuns = 0
    let commandRuns = 0
    const initialModel = Model.make({ count: 0, isMounted: false })
    const program = makeProgram(initialModel, {
      commandRan: () => {
        commandRuns += 1
      },
      initRan: () => {
        initRuns += 1
      },
      updateRan: () => {
        updateRuns += 1
      },
    })
    const modelSource = makeModelSource(initialModel)
    const inputs: Array<ClientInput> = []
    const h = html<ClientInput>()
    const scope = makeScope()
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput,
        container: makeContainer(),
        program,
        sendClientInput: input => {
          inputs.push(input)
        },
        source: modelSource.source,
        view: model => ({
          title: 'Attached Counter',
          body: h.main(
            [],
            [
              h.output([], [model.count.toString()]),
              h.button([h.OnClick(ClickedIncrement())], ['increment']),
            ],
          ),
        }),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    try {
      expect(document.body.textContent).toContain('0')
      const button = document.body.querySelector('button')
      expect(button).toBeInstanceOf(HTMLButtonElement)
      button?.click()
      expect(inputs).toStrictEqual([ClickedIncrement()])

      modelSource.publish(Model.make({ count: 1, isMounted: false }))
      expect(document.body.textContent).toContain('1')
      expect(initRuns).toBe(0)
      expect(updateRuns).toBe(0)
      expect(commandRuns).toBe(0)
    } finally {
      await Effect.runPromise(application.shutdown)
      await closeScope(scope)
    }
  })

  it('queues reentrant snapshots and preserves stable VDOM identity', async () => {
    const initialModel = Model.make({ count: 0, isMounted: false })
    const modelSource = makeModelSource(initialModel)
    const renderedCounts: Array<number> = []
    const h = html<ClientInput>()
    const scope = makeScope()
    let didPublishDuringView = false
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput,
        container: makeContainer(),
        program: makeProgram(initialModel, {
          commandRan: () => {},
          initRan: () => {},
          updateRan: () => {},
        }),
        sendClientInput: () => {},
        source: modelSource.source,
        view: model => {
          renderedCounts.push(model.count)
          if (model.count === 1 && !didPublishDuringView) {
            didPublishDuringView = true
            modelSource.publish(Model.make({ count: 2, isMounted: false }))
          }
          return {
            title: 'Queued Counter',
            body: h.main(
              [],
              [
                h.input([h.Id('stable-input')]),
                h.output([], [model.count.toString()]),
              ],
            ),
          }
        },
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    try {
      const initialInput = document.querySelector('#stable-input')
      expect(initialInput).toBeInstanceOf(HTMLInputElement)
      if (initialInput instanceof HTMLInputElement) {
        initialInput.value = 'preserved'
      }

      modelSource.publish(Model.make({ count: 1, isMounted: false }))

      expect(document.body.textContent).toContain('2')
      expect(renderedCounts).toStrictEqual([0, 1, 2])
      const nextInput = document.querySelector('#stable-input')
      expect(nextInput).toBe(initialInput)
      expect(nextInput).toHaveProperty('value', 'preserved')
    } finally {
      await Effect.runPromise(application.shutdown)
      await closeScope(scope)
    }
  })

  it('fences a reentrant Model after a terminal view defect', async () => {
    const initialModel = Model.make({ count: 0, isMounted: false })
    const modelSource = makeModelSource(initialModel)
    const h = html<ClientInput>()
    const scope = makeScope()
    let didPublishRecovery = false
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput,
        container: makeContainer(),
        program: makeProgram(initialModel, {
          commandRan: () => {},
          initRan: () => {},
          updateRan: () => {},
        }),
        sendClientInput: () => {},
        source: modelSource.source,
        view: model => {
          if (model.count === 1 && !didPublishRecovery) {
            didPublishRecovery = true
            modelSource.publish(Model.make({ count: 2, isMounted: false }))
            throw new Error('reentrant view defect')
          }
          return {
            title: 'Recovering Counter',
            body: h.output([], [model.count.toString()]),
          }
        },
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    try {
      const maybeDefectPromise = Effect.runPromise(
        Stream.runHead(application.defects),
      )
      modelSource.publish(Model.make({ count: 1, isMounted: false }))
      const maybeDefect = await maybeDefectPromise

      expect(document.body.textContent).toContain('0')
      expect(Option.isSome(maybeDefect)).toBe(true)
      if (Option.isSome(maybeDefect)) {
        expect(maybeDefect.value.operation).toBe('View')
      }
      expect(modelSource.source.readModel().count).toBe(2)
      expect(modelSource.readUnsubscribeCount()).toBe(1)
    } finally {
      await Effect.runPromise(application.shutdown)
      await closeScope(scope)
    }
  })

  it('accepts a later valid Model after a recoverable decode defect', async () => {
    const initialModel = Model.make({ count: 0, isMounted: false })
    const modelSource = makeModelSource(initialModel)
    const h = html<ClientInput>()
    const scope = makeScope()
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput,
        container: makeContainer(),
        program: makeProgram(initialModel, {
          commandRan: () => {},
          initRan: () => {},
          updateRan: () => {},
        }),
        sendClientInput: () => {},
        source: modelSource.source,
        view: model => ({
          title: 'Recoverable Counter',
          body: h.output([], [model.count.toString()]),
        }),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    try {
      const maybeDefectPromise = Effect.runPromise(
        Stream.runHead(application.defects),
      )
      modelSource.publish({ count: 1.5, isMounted: false })
      const maybeDefect = await maybeDefectPromise

      expect(document.body.textContent).toContain('0')
      expect(Option.isSome(maybeDefect)).toBe(true)
      if (Option.isSome(maybeDefect)) {
        expect(maybeDefect.value.operation).toBe('DecodeModel')
      }

      modelSource.publish(Model.make({ count: 2, isMounted: false }))
      expect(document.body.textContent).toContain('2')
      expect(modelSource.readUnsubscribeCount()).toBe(0)
    } finally {
      await Effect.runPromise(application.shutdown)
      await closeScope(scope)
    }
  })

  it('disables abandoned Submodel dispatch after a terminal view defect', async () => {
    const initialModel = Model.make({ count: 0, isMounted: false })
    const modelSource = makeModelSource(initialModel)
    const h = html<ClientInput>()
    const scope = makeScope()
    const inputs: Array<ClientInput> = []
    let staleDispatch: ((message: unknown) => void) | undefined
    const abandonedChildView = defineView<Model, ClientInput>(() => {
      staleDispatch = __requireDispatch()
      return h.output([], ['abandoned child'])
    })
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput,
        container: makeContainer(),
        program: makeProgram(initialModel, {
          commandRan: () => {},
          initRan: () => {},
          updateRan: () => {},
        }),
        sendClientInput: input => {
          inputs.push(input)
        },
        source: modelSource.source,
        view: model => {
          if (model.count === 1) {
            h.submodel({
              model,
              slotId: 'abandoned-child',
              toParentMessage: message => message,
              view: abandonedChildView,
            })
            throw new Error('view failed after building a Submodel')
          }
          return {
            title: 'Boundary Recovery',
            body: h.output([], [model.count.toString()]),
          }
        },
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    try {
      const maybeDefectPromise = Effect.runPromise(
        Stream.runHead(application.defects),
      )
      modelSource.publish(Model.make({ count: 1, isMounted: false }))
      await maybeDefectPromise
      modelSource.publish(Model.make({ count: 2, isMounted: false }))

      expect(staleDispatch).toBeDefined()
      expect(() => staleDispatch?.(ClickedIncrement())).not.toThrow()
      expect(inputs).toStrictEqual([])
      expect(document.body.textContent).toContain('0')
      expect(modelSource.readUnsubscribeCount()).toBe(1)
    } finally {
      await Effect.runPromise(application.shutdown)
      await closeScope(scope)
    }
  })

  it('fences source updates and Client input after a terminal patch defect', async () => {
    const initialModel = Model.make({ count: 0, isMounted: true })
    const modelSource = makeModelSource(initialModel)
    const h = html<ClientInput>()
    const scope = makeScope()
    const inputs: Array<ClientInput> = []
    let mountCleanups = 0
    let mountStarts = 0
    let patchCount = 0
    let viewCount = 0
    const terminalChildView = defineView<Model, ClientInput>(() =>
      h.button([h.OnClick(ClickedIncrement())], ['child increment']),
    )
    const TrackTerminalMount = Mount.defineStream(
      'TrackTerminalMount',
      MountedClient,
    )(() =>
      Stream.callback(() =>
        Effect.acquireRelease(
          Effect.sync(() => {
            mountStarts += 1
          }),
          () =>
            Effect.sync(() => {
              mountCleanups += 1
            }),
        ).pipe(Effect.flatMap(() => Effect.never)),
      ),
    )
    const application = Effect.runSync(
      __makeAttachedFoldkitApplicationWithPatch(
        {
          ClientInput,
          container: makeContainer(),
          program: makeProgram(initialModel, {
            commandRan: () => {},
            initRan: () => {},
            updateRan: () => {},
          }),
          sendClientInput: input => {
            inputs.push(input)
          },
          source: modelSource.source,
          view: model => {
            viewCount += 1
            return {
              title: 'Terminal Counter',
              body: h.main(
                [],
                [
                  h.section([h.OnMount(TrackTerminalMount())], ['mounted']),
                  ...(model.count === 0
                    ? []
                    : [
                        h.aside(
                          [h.OnMount(TrackTerminalMount())],
                          ['mounted after patch'],
                        ),
                      ]),
                  h.output([], [model.count.toString()]),
                  h.button([h.OnClick(ClickedIncrement())], ['increment']),
                  h.submodel({
                    model,
                    slotId: 'terminal-child',
                    toParentMessage: message => message,
                    view: terminalChildView,
                  }),
                ],
              ),
            }
          },
        },
        (maybeCurrentVNode, nextVNode, container, seen, observer) => {
          patchCount += 1
          const patchedVNode = __patchVNode(
            maybeCurrentVNode,
            nextVNode,
            container,
            seen,
            observer,
          )
          if (patchCount === 2) {
            throw new Error('forced patch defect')
          }
          return patchedVNode
        },
      ).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    await vi.waitFor(() => {
      expect(mountStarts).toBe(1)
    })
    const button = document.body.querySelector('button')
    const childButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find(candidate => candidate.textContent === 'child increment')
    const maybeDefectPromise = Effect.runPromise(
      Stream.runHead(application.defects),
    )
    modelSource.publish(Model.make({ count: 1, isMounted: true }))
    const maybeDefect = await maybeDefectPromise

    expect(Option.isSome(maybeDefect)).toBe(true)
    if (Option.isSome(maybeDefect)) {
      expect(maybeDefect.value.operation).toBe('Patch')
    }
    expect(modelSource.readUnsubscribeCount()).toBe(1)
    expect(viewCount).toBe(2)
    await vi.waitFor(() => {
      expect(mountStarts).toBe(2)
    })
    const textAfterFailure = document.body.textContent

    modelSource.publish(Model.make({ count: 2, isMounted: true }))
    button?.click()
    expect(() => childButton?.click()).not.toThrow()
    expect(viewCount).toBe(2)
    expect(document.body.textContent).toBe(textAfterFailure)
    expect(inputs).toStrictEqual([])

    await Effect.runPromise(application.shutdown)
    await Effect.runPromise(application.shutdown)
    await closeScope(scope)
    expect(modelSource.readUnsubscribeCount()).toBe(1)
    await vi.waitFor(() => {
      expect(mountCleanups).toBe(2)
    })
    expect(document.body.querySelector('button')).toBeNull()
  })

  it('releases committed Mounts after a real partial patch failure', async () => {
    const initialModel = Model.make({ count: 0, isMounted: true })
    const modelSource = makeModelSource(initialModel)
    const h = html<ClientInput>()
    const scope = makeScope()
    let mountCleanups = 0
    let mountStarts = 0
    const TrackPartialMount = Mount.defineStream(
      'TrackPartialMount',
      MountedClient,
    )(() =>
      Stream.callback(() =>
        Effect.acquireRelease(
          Effect.sync(() => {
            mountStarts += 1
          }),
          () =>
            Effect.sync(() => {
              mountCleanups += 1
            }),
        ).pipe(Effect.flatMap(() => Effect.never)),
      ),
    )
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput,
        container: makeContainer(),
        program: makeProgram(initialModel, {
          commandRan: () => {},
          initRan: () => {},
          updateRan: () => {},
        }),
        sendClientInput: () => {},
        source: modelSource.source,
        view: model => ({
          title: 'Partial Patch Counter',
          body: h.main(
            [],
            model.count === 0
              ? [
                  h.div([h.Attribute('data-safe', 'true')], []),
                  h.section([h.OnMount(TrackPartialMount())], ['mounted']),
                ]
              : [h.div([h.Attribute('bad attribute', 'fails')], [])],
          ),
        }),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    await vi.waitFor(() => {
      expect(mountStarts).toBe(1)
    })
    const maybeDefectPromise = Effect.runPromise(
      Stream.runHead(application.defects),
    )
    modelSource.publish(Model.make({ count: 1, isMounted: true }))
    const maybeDefect = await maybeDefectPromise

    expect(Option.isSome(maybeDefect)).toBe(true)
    if (Option.isSome(maybeDefect)) {
      expect(maybeDefect.value.operation).toBe('Patch')
    }
    await Effect.runPromise(application.shutdown)
    await closeScope(scope)
    await vi.waitFor(() => {
      expect(mountCleanups).toBe(1)
    })
    expect(document.body.querySelector('main')).toBeNull()
  })

  it('replays a terminal defect published before the first observer subscribes', async () => {
    const initialModel = Model.make({ count: 0, isMounted: false })
    const modelSource = makeModelSource(initialModel)
    const h = html<ClientInput>()
    const scope = makeScope()
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput,
        container: makeContainer(),
        program: makeProgram(initialModel, {
          commandRan: () => {},
          initRan: () => {},
          updateRan: () => {},
        }),
        sendClientInput: () => {},
        source: {
          readModel: modelSource.source.readModel,
          subscribe: listener => {
            const unsubscribe = modelSource.source.subscribe(listener)
            queueMicrotask(() => {
              listener(Model.make({ count: 1, isMounted: false }))
            })
            return unsubscribe
          },
        },
        view: model => {
          if (model.count === 1) {
            throw new Error('microtask view failure')
          }
          return {
            title: 'Buffered Defect Counter',
            body: h.output([], [model.count.toString()]),
          }
        },
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    await new Promise<void>(resolve => queueMicrotask(resolve))
    const maybeDefect = await Effect.runPromise(
      Stream.runHead(application.defects),
    )

    expect(Option.isSome(maybeDefect)).toBe(true)
    if (Option.isSome(maybeDefect)) {
      expect(maybeDefect.value.operation).toBe('View')
    }
    expect(modelSource.readUnsubscribeCount()).toBe(1)
    await Effect.runPromise(application.shutdown)
    await closeScope(scope)
  })

  it('makes a retained Submodel dispatcher inert after normal shutdown', async () => {
    const initialModel = Model.make({ count: 0, isMounted: false })
    const modelSource = makeModelSource(initialModel)
    const h = html<ClientInput>()
    const scope = makeScope()
    const inputs: Array<ClientInput> = []
    let staleDispatch: ((message: unknown) => void) | undefined
    const childView = defineView<Model, ClientInput>(() => {
      staleDispatch = __requireDispatch()
      return h.button([h.OnClick(ClickedIncrement())], ['child increment'])
    })
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput,
        container: makeContainer(),
        program: makeProgram(initialModel, {
          commandRan: () => {},
          initRan: () => {},
          updateRan: () => {},
        }),
        sendClientInput: input => {
          inputs.push(input)
        },
        source: modelSource.source,
        view: model => ({
          title: 'Shutdown Boundary Counter',
          body: h.submodel({
            model,
            slotId: 'shutdown-child',
            toParentMessage: message => message,
            view: childView,
          }),
        }),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    await Effect.runPromise(application.shutdown)
    expect(staleDispatch).toBeDefined()
    expect(() => staleDispatch?.(ClickedIncrement())).not.toThrow()
    expect(inputs).toStrictEqual([])
    await closeScope(scope)
  })

  it('preserves view-function branch identity while patching snapshots', async () => {
    const initialModel = Model.make({ count: 0, isMounted: false })
    const modelSource = makeModelSource(initialModel)
    const h = html<ClientInput>()
    const scope = makeScope()
    const renderFirstInput = () =>
      brandViewResult(h.input([h.Id('branch-input')]), 'FirstInput')
    const renderSecondInput = () =>
      brandViewResult(h.input([h.Id('branch-input')]), 'SecondInput')
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput,
        container: makeContainer(),
        program: makeProgram(initialModel, {
          commandRan: () => {},
          initRan: () => {},
          updateRan: () => {},
        }),
        sendClientInput: () => {},
        source: modelSource.source,
        view: model => ({
          title: 'Branching Counter',
          body: h.main(
            [],
            [model.isMounted ? renderSecondInput() : renderFirstInput()],
          ),
        }),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    try {
      const firstInput = document.querySelector('#branch-input')
      expect(firstInput).toBeInstanceOf(HTMLInputElement)
      if (firstInput instanceof HTMLInputElement) {
        firstInput.value = 'first branch state'
      }

      modelSource.publish(Model.make({ count: 0, isMounted: true }))

      const secondInput = document.querySelector('#branch-input')
      expect(secondInput).toBeInstanceOf(HTMLInputElement)
      expect(secondInput).not.toBe(firstInput)
      expect(secondInput).toHaveProperty('value', '')
    } finally {
      await Effect.runPromise(application.shutdown)
      await closeScope(scope)
    }
  })

  it('releases Mounts and unsubscribes exactly once across repeated shutdown', async () => {
    const initialModel = Model.make({ count: 0, isMounted: true })
    const modelSource = makeModelSource(initialModel)
    const h = html<ClientInput>()
    let mountStarts = 0
    let mountCleanups = 0
    const TrackMount = Mount.defineStream(
      'TrackMount',
      MountedClient,
    )(() =>
      Stream.callback(queue =>
        Effect.acquireRelease(
          Effect.sync(() => {
            mountStarts += 1
            Queue.offerUnsafe(queue, MountedClient())
          }),
          () =>
            Effect.sync(() => {
              mountCleanups += 1
            }),
        ).pipe(Effect.flatMap(() => Effect.never)),
      ),
    )
    const scope = makeScope()
    const container = makeContainer()
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput,
        container,
        program: makeProgram(initialModel, {
          commandRan: () => {},
          initRan: () => {},
          updateRan: () => {},
        }),
        sendClientInput: () => {},
        source: modelSource.source,
        view: model => ({
          title: 'Mounted Counter',
          body: h.main(
            [],
            [
              ...(model.isMounted
                ? [h.section([h.OnMount(TrackMount())], ['mounted'])]
                : []),
            ],
          ),
        }),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )

    await vi.waitFor(() => {
      expect(mountStarts).toBe(1)
    })
    modelSource.publish(Model.make({ count: 0, isMounted: false }))
    await vi.waitFor(() => {
      expect(mountCleanups).toBe(1)
    })
    modelSource.publish(Model.make({ count: 0, isMounted: true }))
    await vi.waitFor(() => {
      expect(mountStarts).toBe(2)
    })

    await Effect.runPromise(application.shutdown)
    await Effect.runPromise(application.shutdown)
    await closeScope(scope)

    await vi.waitFor(() => {
      expect(mountCleanups).toBe(2)
    })
    expect(modelSource.readUnsubscribeCount()).toBe(1)
    expect(document.body.contains(container)).toBe(true)
    expect(container.childNodes).toHaveLength(0)
  })

  it('fails initial invalid Models with a typed defect', () => {
    const invalidModel: Model = { count: 1.5, isMounted: false }
    const modelSource = makeModelSource(invalidModel)
    const h = html<ClientInput>()
    const exit = Effect.runSync(
      Effect.scoped(
        Effect.exit(
          makeAttachedFoldkitApplication({
            ClientInput,
            container: makeContainer(),
            program: makeProgram(invalidModel, {
              commandRan: () => {},
              initRan: () => {},
              updateRan: () => {},
            }),
            sendClientInput: () => {},
            source: modelSource.source,
            view: model => ({
              title: 'Invalid Counter',
              body: h.output([], [model.count.toString()]),
            }),
          }),
        ),
      ),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const defect = Cause.squash(exit.cause)
      expect(defect).toBeInstanceOf(AttachedFoldkitRendererDefect)
      if (defect instanceof AttachedFoldkitRendererDefect) {
        expect(defect.operation).toBe('DecodeModel')
      }
    }
    expect(modelSource.readUnsubscribeCount()).toBe(1)
  })

  it('publishes a shutdown cleanup defect exactly once', async () => {
    const initialModel = Model.make({ count: 0, isMounted: false })
    const modelSource = makeModelSource(initialModel)
    const h = html<ClientInput>()
    const scope = makeScope()
    const container = makeContainer()
    const application = Effect.runSync(
      makeAttachedFoldkitApplication({
        ClientInput,
        container,
        program: makeProgram(initialModel, {
          commandRan: () => {},
          initRan: () => {},
          updateRan: () => {},
        }),
        sendClientInput: () => {},
        source: modelSource.source,
        view: model => ({
          title: 'Cleanup Counter',
          body: h.output([], [model.count.toString()]),
        }),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )
    const defectsPromise = Effect.runPromise(
      Stream.runCollect(application.defects),
    )
    vi.spyOn(container, 'replaceChildren').mockImplementation(() => {
      throw new Error('cleanup failed')
    })

    const exit = await Effect.runPromiseExit(application.shutdown)
    const defects = Array.from(await defectsPromise)
    await closeScope(scope)

    expect(Exit.isFailure(exit)).toBe(true)
    expect(defects).toHaveLength(1)
    expect(defects).toMatchObject([{ operation: 'Patch' }])
  })
})
