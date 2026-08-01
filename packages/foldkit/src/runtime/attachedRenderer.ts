import {
  Array,
  Context,
  Data,
  Effect,
  Option,
  PubSub,
  Schema,
  Scope,
  Stream,
} from 'effect'

import {
  checkpointBoundaryRegistry,
  clearBoundaryRegistry,
  disableBoundaryDispatch,
  restoreBoundaryRegistry,
} from '../html/boundary.js'
import {
  type Document,
  __beginRender as beginHtmlRender,
  __clearRuntime as clearHtmlRuntime,
  __createBoundaryRegistry as createHtmlBoundaryRegistry,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import { MountTracker } from '../mount/index.js'
import type { ProgramSchema } from '../program/program.js'
import { type VNode, __destroyVNodeForest, __patchVNode } from '../vdom.js'
import { Dispatch } from './runtime.js'

/** The phase in which an attached Foldkit renderer encountered a defect. */
export const AttachedFoldkitRendererOperation = Schema.Literals([
  'DecodeClientInput',
  'DecodeModel',
  'Patch',
  'ReadModel',
  'SendClientInput',
  'Subscribe',
  'Unsubscribe',
  'View',
])

/** The phase in which an attached Foldkit renderer encountered a defect. */
export type AttachedFoldkitRendererOperation =
  typeof AttachedFoldkitRendererOperation.Type

/** A host, source, view, or patch boundary failed without escaping untyped. */
export class AttachedFoldkitRendererDefect extends Data.TaggedError(
  'AttachedFoldkitRendererDefect',
)<
  Readonly<{
    cause: unknown
    operation: AttachedFoldkitRendererOperation
    programId: string
  }>
> {}

/** The Program identity and Model Schema required by an attached renderer. */
export type AttachedFoldkitProgram<Model> = Readonly<{
  id: string
  version: number
  Model: ProgramSchema<Model>
}>

/** An externally owned current Model and its ordered snapshot notifications. */
export type AttachedProgramModelSource<Model> = Readonly<{
  readModel: () => Model
  subscribe: (listener: (model: Model) => void) => () => void
}>

/** Configuration for rendering an externally owned Program Model with Foldkit HTML. */
export type AttachedFoldkitApplicationConfig<Model, ClientInput> = Readonly<{
  ClientInput: Schema.Codec<ClientInput, unknown, never, never>
  container: HTMLElement | null
  program: AttachedFoldkitProgram<Model>
  sendClientInput: (input: ClientInput) => void
  source: AttachedProgramModelSource<Model>
  view: (model: Model) => Document
}>

/** A running attached renderer with typed defect observation and explicit cleanup. */
export type AttachedFoldkitApplication = Readonly<{
  defects: Stream.Stream<AttachedFoldkitRendererDefect>
  shutdown: Effect.Effect<void, AttachedFoldkitRendererDefect>
}>

type PatchAttachedFoldkitVNode = typeof __patchVNode

type VNodeSlot = {
  maybeCurrentVNode: Option.Option<VNode>
}

type DocumentMetadataElements = {
  canonical?: HTMLLinkElement
  ogUrl?: HTMLMetaElement
}

const documentMetadataElements = new WeakMap<
  globalThis.Document,
  DocumentMetadataElements
>()

const currentLocationUrl = (): string => {
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}`
}

const metadataElementsForDocument = (): Readonly<{
  canonical: HTMLLinkElement
  ogUrl: HTMLMetaElement
}> => {
  let elements = documentMetadataElements.get(document)
  if (elements === undefined) {
    elements = {}
    documentMetadataElements.set(document, elements)
  }

  let canonical = elements.canonical
  if (canonical === undefined || canonical.parentNode !== document.head) {
    canonical =
      document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]') ??
      document.head.appendChild(document.createElement('link'))
    elements.canonical = canonical
  }

  let ogUrl = elements.ogUrl
  if (ogUrl === undefined || ogUrl.parentNode !== document.head) {
    ogUrl =
      document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]') ??
      document.head.appendChild(document.createElement('meta'))
    elements.ogUrl = ogUrl
  }

  return { canonical, ogUrl }
}

const applyDocumentMetadata = (
  nextDocument: Document,
  mountedRoot: Node | undefined,
): void => {
  if (!mountedRoot || !document.body.contains(mountedRoot)) {
    return
  }

  if (document.title !== nextDocument.title) {
    document.title = nextDocument.title
  }

  const canonical = nextDocument.canonical ?? currentLocationUrl()
  const ogUrl = nextDocument.ogUrl ?? canonical
  const metadataElements = metadataElementsForDocument()

  if (metadataElements.canonical.getAttribute('rel') !== 'canonical') {
    metadataElements.canonical.setAttribute('rel', 'canonical')
  }
  if (metadataElements.canonical.getAttribute('href') !== canonical) {
    metadataElements.canonical.setAttribute('href', canonical)
  }
  if (metadataElements.ogUrl.getAttribute('property') !== 'og:url') {
    metadataElements.ogUrl.setAttribute('property', 'og:url')
  }
  if (metadataElements.ogUrl.getAttribute('content') !== ogUrl) {
    metadataElements.ogUrl.setAttribute('content', ogUrl)
  }
}

const makeDefect = (
  programId: string,
  operation: AttachedFoldkitRendererOperation,
  cause: unknown,
): AttachedFoldkitRendererDefect =>
  new AttachedFoldkitRendererDefect({ cause, operation, programId })

/**
 * Starts a Foldkit HTML renderer over an externally owned Program Model.
 *
 * The source remains the only Model owner. This renderer never initializes a
 * Program runtime, invokes update, or executes Commands. Client input is
 * Schema-decoded and forwarded to the supplied host sink.
 */
const makeAttachedFoldkitApplicationWithPatch = <Model, ClientInput>(
  config: AttachedFoldkitApplicationConfig<Model, ClientInput>,
  patchVNode: PatchAttachedFoldkitVNode,
): Effect.Effect<
  AttachedFoldkitApplication,
  AttachedFoldkitRendererDefect,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const container = config.container
    if (container === null) {
      return yield* Effect.fail(
        makeDefect(
          config.program.id,
          'Patch',
          new Error('The attached Foldkit renderer container was not found.'),
        ),
      )
    }
    const decodeModel = Schema.decodeUnknownSync(
      Schema.toType(config.program.Model),
    )
    const decodeClientInput = Schema.decodeUnknownSync(config.ClientInput)
    const boundaryRegistry = createHtmlBoundaryRegistry()
    const vnodeSlot: VNodeSlot = { maybeCurrentVNode: Option.none() }
    let maybeFailedAttemptVNode = Option.none<VNode>()
    const defects = yield* PubSub.unbounded<AttachedFoldkitRendererDefect>({
      replay: 8,
    })
    let queuedModels: ReadonlyArray<Model> = []
    let isRendering = false
    let isSourceReady = false
    let isDisposed = false
    let isTerminal = false
    let isDefectStreamOpen = true
    let maybeTerminalCleanupDefect =
      Option.none<AttachedFoldkitRendererDefect>()
    let stopObserving: (() => void) | undefined

    const publishDefect = (defect: AttachedFoldkitRendererDefect): void => {
      if (isDefectStreamOpen) {
        PubSub.publishUnsafe(defects, defect)
      }
    }

    const dispatchClientInput = (input: unknown): void => {
      if (isDisposed || isTerminal) {
        return
      }
      let decodedInput: ClientInput
      try {
        decodedInput = decodeClientInput(input)
      } catch (cause) {
        publishDefect(makeDefect(config.program.id, 'DecodeClientInput', cause))
        return
      }
      try {
        config.sendClientInput(decodedInput)
      } catch (cause) {
        publishDefect(makeDefect(config.program.id, 'SendClientInput', cause))
      }
    }

    const dispatch = Dispatch.of({
      dispatchAsync: input => Effect.sync(() => dispatchClientInput(input)),
      dispatchSync: dispatchClientInput,
    })
    const runtimeContext = Context.make(Dispatch, dispatch).pipe(
      Context.add(MountTracker, {
        started: () => {},
        ended: () => {},
      }),
    )

    const renderModel = (
      externalModel: Model,
    ): Option.Option<AttachedFoldkitRendererDefect> => {
      let model: Model
      try {
        model = decodeModel(externalModel)
      } catch (cause) {
        return Option.some(makeDefect(config.program.id, 'DecodeModel', cause))
      }

      let nextDocument: Document
      const boundaryCheckpoint = checkpointBoundaryRegistry(boundaryRegistry)
      try {
        beginHtmlRender(boundaryRegistry)
        setHtmlRuntime(dispatch.dispatchSync, runtimeContext, boundaryRegistry)
        try {
          nextDocument = config.view(model)
        } finally {
          clearHtmlRuntime()
        }
      } catch (cause) {
        restoreBoundaryRegistry(boundaryRegistry, boundaryCheckpoint)
        return Option.some(makeDefect(config.program.id, 'View', cause))
      }

      let maybeAttemptedVNode = Option.none<VNode>()
      try {
        const nextVNode = patchVNode(
          vnodeSlot.maybeCurrentVNode,
          nextDocument.body,
          container,
          boundaryRegistry.dedupeSeen,
          {
            patched: patchedVNode => {
              vnodeSlot.maybeCurrentVNode = Option.some(patchedVNode)
            },
            prepared: preparedVNode => {
              maybeAttemptedVNode = Option.some(preparedVNode)
            },
          },
        )
        vnodeSlot.maybeCurrentVNode = Option.some(nextVNode)
        maybeFailedAttemptVNode = Option.none()
        applyDocumentMetadata(nextDocument, nextVNode.elm)
        return Option.none()
      } catch (cause) {
        if (Option.isSome(maybeAttemptedVNode)) {
          maybeFailedAttemptVNode = maybeAttemptedVNode
        }
        return Option.some(makeDefect(config.program.id, 'Patch', cause))
      }
    }

    const enqueueModel = (
      model: Model,
    ): Option.Option<AttachedFoldkitRendererDefect> => {
      if (isDisposed || isTerminal) {
        return Option.none()
      }
      queuedModels = Array.append(queuedModels, model)
      if (isRendering) {
        return Option.none()
      }

      isRendering = true
      let maybeDefect = Option.none<AttachedFoldkitRendererDefect>()
      let recoveryAttempts = 0
      try {
        while (!isDisposed && Array.isReadonlyArrayNonEmpty(queuedModels)) {
          const maybeModel = Array.head(queuedModels)
          queuedModels = Array.drop(queuedModels, 1)
          if (Option.isSome(maybeModel)) {
            const maybeRenderDefect = renderModel(maybeModel.value)
            if (Option.isNone(maybeRenderDefect)) {
              recoveryAttempts = 0
            } else {
              if (Option.isNone(maybeDefect)) {
                maybeDefect = maybeRenderDefect
              }
              if (
                maybeRenderDefect.value.operation === 'Patch' ||
                maybeRenderDefect.value.operation === 'View'
              ) {
                isTerminal = true
                isSourceReady = false
                disableBoundaryDispatch(boundaryRegistry)
                clearBoundaryRegistry(boundaryRegistry)
                try {
                  stopObserving?.()
                } catch (cause) {
                  maybeTerminalCleanupDefect = Option.some(
                    makeDefect(config.program.id, 'Unsubscribe', cause),
                  )
                } finally {
                  stopObserving = undefined
                }
              }
              const maybeLatestQueuedModel = Array.last(queuedModels)
              const canRecover =
                !isTerminal &&
                Option.isSome(maybeLatestQueuedModel) &&
                recoveryAttempts === 0
              if (canRecover && Option.isSome(maybeLatestQueuedModel)) {
                queuedModels = [maybeLatestQueuedModel.value]
                recoveryAttempts += 1
              } else {
                queuedModels = []
              }
            }
          }
        }
      } finally {
        isRendering = false
      }
      return maybeDefect
    }

    const receiveModel = (model: Model): void => {
      if (!isSourceReady || isDisposed || isTerminal) {
        return
      }
      const maybeDefect = enqueueModel(model)
      if (Option.isSome(maybeDefect)) {
        publishDefect(maybeDefect.value)
      }
      if (Option.isSome(maybeTerminalCleanupDefect)) {
        publishDefect(maybeTerminalCleanupDefect.value)
        maybeTerminalCleanupDefect = Option.none()
      }
    }

    const shutdown: AttachedFoldkitApplication['shutdown'] = Effect.suspend(
      () => {
        if (isDisposed) {
          return Effect.void
        }
        isDisposed = true
        isSourceReady = false
        queuedModels = []
        let maybeDefect = Option.none<AttachedFoldkitRendererDefect>()
        const recordDefect = (defect: AttachedFoldkitRendererDefect): void => {
          publishDefect(defect)
          if (Option.isNone(maybeDefect)) {
            maybeDefect = Option.some(defect)
          }
        }

        disableBoundaryDispatch(boundaryRegistry)
        try {
          stopObserving?.()
        } catch (cause) {
          recordDefect(makeDefect(config.program.id, 'Unsubscribe', cause))
        }
        stopObserving = undefined

        const ownedVnodes = Array.getSomes([
          vnodeSlot.maybeCurrentVNode,
          maybeFailedAttemptVNode,
        ])
        if (Array.isReadonlyArrayNonEmpty(ownedVnodes)) {
          try {
            __destroyVNodeForest(ownedVnodes)
            const rootNodes = new Set<Node>()
            for (const vnode of ownedVnodes) {
              if (vnode.elm !== undefined) {
                rootNodes.add(vnode.elm)
              }
            }
            let isContainerRestored = false
            for (const rootNode of rootNodes) {
              const parentNode = rootNode.parentNode
              if (parentNode !== null) {
                if (isContainerRestored) {
                  parentNode.removeChild(rootNode)
                } else {
                  parentNode.replaceChild(container, rootNode)
                  isContainerRestored = true
                }
              }
            }
          } catch (cause) {
            const defect = makeDefect(config.program.id, 'Patch', cause)
            recordDefect(defect)
          } finally {
            vnodeSlot.maybeCurrentVNode = Option.none()
            maybeFailedAttemptVNode = Option.none()
          }
        }
        try {
          container.replaceChildren()
        } catch (cause) {
          const defect = makeDefect(config.program.id, 'Patch', cause)
          recordDefect(defect)
        }
        clearBoundaryRegistry(boundaryRegistry)

        isDefectStreamOpen = false
        return PubSub.shutdown(defects).pipe(
          Effect.flatMap(() =>
            Option.match(maybeDefect, {
              onNone: () => Effect.void,
              onSome: Effect.fail,
            }),
          ),
        )
      },
    )

    yield* Effect.addFinalizer(() =>
      shutdown.pipe(Effect.catch(() => Effect.void)),
    )

    stopObserving = yield* Effect.try({
      try: () => config.source.subscribe(receiveModel),
      catch: cause => makeDefect(config.program.id, 'Subscribe', cause),
    })
    const initialModel = yield* Effect.try({
      try: config.source.readModel,
      catch: cause => makeDefect(config.program.id, 'ReadModel', cause),
    })
    isSourceReady = true
    const maybeInitialDefect = enqueueModel(initialModel)
    if (Option.isSome(maybeInitialDefect)) {
      return yield* Effect.fail(maybeInitialDefect.value)
    }

    return {
      defects: Stream.fromPubSub(defects),
      shutdown,
    }
  })

/**
 * Starts a Foldkit HTML renderer over an externally owned Program Model.
 *
 * The source remains the only Model owner. This renderer never initializes a
 * Program runtime, invokes update, or executes Commands. Client input is
 * Schema-decoded and forwarded to the supplied host sink.
 */
export const makeAttachedFoldkitApplication = <Model, ClientInput>(
  config: AttachedFoldkitApplicationConfig<Model, ClientInput>,
): Effect.Effect<
  AttachedFoldkitApplication,
  AttachedFoldkitRendererDefect,
  Scope.Scope
> => makeAttachedFoldkitApplicationWithPatch(config, __patchVNode)

/** @internal Creates an attached renderer with a deterministic patch test seam. */
export const __makeAttachedFoldkitApplicationWithPatch =
  makeAttachedFoldkitApplicationWithPatch
