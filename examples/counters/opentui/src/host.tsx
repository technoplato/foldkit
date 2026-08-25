import {
  MultipleCountersInteractionGraph,
  type NavigationTarget,
  activatedInteraction,
  makeInteractionIdentitySource,
} from 'counters-core-example'
import { Array, Match as M, Option, Result } from 'effect'
import * as InteractionGraph from 'foldkit/interaction-graph'
import { randomUUID } from 'node:crypto'
import {
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  type CliRenderer,
  type ScrollBoxRenderable,
  type TextRenderable,
} from '@opentui/core'
import { useKeyboard } from '@opentui/react'

import {
  MultipleCountersProvider,
  useMultipleCountersActions,
  useMultipleCountersModel,
  useMultipleCountersReplay,
} from './client.js'
import { type CountersInteractionId, normalizeInput } from './input.js'
import type { OpenTuiCountersHost } from './instant.js'
import {
  availableSemanticShortcutLabels,
  movedSourceReference,
  referenceForSemanticInteraction,
  scrollTopForFocusedBounds,
} from './interactionPresentation.js'

import { attributionSuffix, gitSourceUrl } from './surfaceLabel.js'

const HEADER_HEIGHT = 7

/** Runs Multiple Counters through the OpenTUI React reconciler. */
export const App = ({
  host,
  maybeInitialTarget,
  renderer,
}: Readonly<{
  host?: OpenTuiCountersHost
  maybeInitialTarget: Option.Option<NavigationTarget>
  renderer: CliRenderer
}>) => (
  <MultipleCountersProvider
    fallback={<text fg="#a8a29e">Starting Multiple Counters…</text>}
    maybeInitialTarget={maybeInitialTarget}
    {...(host === undefined ? {} : { host })}
  >
    <MultipleCountersTerminal renderer={renderer} />
  </MultipleCountersProvider>
)

const MultipleCountersTerminal = ({
  renderer,
}: Readonly<{ renderer: CliRenderer }>) => {
  const model = useMultipleCountersModel()
  const actions = useMultipleCountersActions()
  const replay = useMultipleCountersReplay()
  const projected = useMemo(
    () => MultipleCountersInteractionGraph.project(model),
    [model],
  )

  if (Result.isFailure(projected)) {
    return (
      <box border borderColor="#fca5a5" flexDirection="column" padding={1}>
        <text content="Interaction projection failed" fg="#fca5a5" />
        <text content={projected.failure._tag} />
      </box>
    )
  }

  return (
    <ProjectedMultipleCountersTerminal
      actions={actions}
      model={model}
      projection={projected.success}
      renderer={renderer}
      replay={replay}
    />
  )
}

const ProjectedMultipleCountersTerminal = ({
  actions,
  model,
  projection,
  renderer,
  replay,
}: Readonly<{
  actions: ReturnType<typeof useMultipleCountersActions>
  model: ReturnType<typeof useMultipleCountersModel>
  projection: InteractionGraph.InteractionProjection<unknown>
  renderer: CliRenderer
  replay: ReturnType<typeof useMultipleCountersReplay>
}>) => {
  const navigator = useMemo(() => InteractionGraph.makeNavigator<unknown>(), [])
  const identitySource = useMemo(
    () => makeInteractionIdentitySource(randomUUID),
    [],
  )
  const [, setNavigationRevision] = useState(0)
  const [maybeNotice, setNotice] = useState(Option.none<string>())
  const scrollBoxRef = useRef<ScrollBoxRenderable | null>(null)
  const focusedNodeRef = useRef<TextRenderable | null>(null)

  useLayoutEffect(() => {
    navigator.reconcile(projection)
    setNavigationRevision(revision => revision + 1)
  }, [navigator, projection])

  const maybeFocusedReference = navigator.readFocusedReference()
  const focusedKey = Option.getOrUndefined(
    Option.map(maybeFocusedReference, InteractionGraph.interactionReferenceKey),
  )

  useLayoutEffect(() => {
    const scrollBox = scrollBoxRef.current
    const focusedNode = focusedNodeRef.current
    if (scrollBox === null || focusedNode === null) {
      return
    }
    const nextScrollTop = scrollTopForFocusedBounds({
      scrollTop: scrollBox.scrollTop,
      targetHeight: focusedNode.height,
      targetScreenY: focusedNode.screenY,
      viewportHeight: scrollBox.viewport.height,
      viewportScreenY: scrollBox.viewport.screenY,
    })
    if (nextScrollTop !== scrollBox.scrollTop) {
      scrollBox.scrollTo(nextScrollTop)
    }
  }, [focusedKey, projection])

  const semanticShortcutLabels = availableSemanticShortcutLabels(
    projection,
    maybeFocusedReference,
  )
  const localShortcutLabels = replay.isBranchable ? semanticShortcutLabels : []
  const hasDeleteConfirmation = Array.some(
    InteractionGraph.interactionNodes(projection.root),
    node =>
      node._tag === 'InteractionGroup' &&
      node.interactionId.token === 'DeleteCounterConfirmation',
  )
  const inputContext = (() => {
    if (navigator.readState()._tag === 'EditingInteraction') {
      return 'Editing'
    } else if (hasDeleteConfirmation) {
      return 'Confirmation'
    } else {
      return 'Browse'
    }
  })()

  const refreshNavigation = () => {
    setNavigationRevision(revision => revision + 1)
  }
  const dispatchNavigation = (
    intent: InteractionGraph.InteractionNavigationIntent,
  ) => {
    navigator.dispatch(intent)
    refreshNavigation()
  }
  const moveSource = (delta: -1 | 1) => {
    const maybeReference = movedSourceReference(
      projection,
      navigator.readFocusedReference(),
      delta,
    )
    if (Option.isSome(maybeReference)) {
      navigator.focus(maybeReference.value)
      refreshNavigation()
    }
  }
  const activateReference = (
    reference: InteractionGraph.InteractionReference,
  ) => {
    const resolved = MultipleCountersInteractionGraph.resolve(
      model,
      activatedInteraction(reference, `occurrence-${randomUUID()}`),
      identitySource,
    )
    if (Result.isFailure(resolved)) {
      setNotice(Option.some(resolved.failure._tag))
    } else if (Option.isNone(resolved.success)) {
      setNotice(Option.some('That interaction is no longer available.'))
    } else {
      setNotice(Option.none())
      actions.sentMessage(resolved.success.value)
    }
  }
  const activateFocused = () => {
    const maybeReference = navigator.dispatch(
      InteractionGraph.ActivateFocusedInteraction.make({}),
    )
    if (Option.isSome(maybeReference)) {
      activateReference(maybeReference.value)
    }
  }
  const activateSemantic = (interactionId: CountersInteractionId) => {
    const maybeReference = referenceForSemanticInteraction(
      projection,
      navigator.readFocusedReference(),
      interactionId,
    )
    if (Option.isSome(maybeReference)) {
      activateReference(maybeReference.value)
    }
  }

  useKeyboard(key => {
    M.value(normalizeInput(key.name, inputContext)).pipe(
      M.tagsExhaustive({
        Activate: activateFocused,
        Back: () => activateSemantic('Back'),
        Ignored: () => {},
        Inspect: () => replay.inspect(),
        Invoke: ({ interactionId }) => activateSemantic(interactionId),
        MoveNextAction: () =>
          dispatchNavigation(InteractionGraph.MoveNextInteraction.make({})),
        MoveNextSource: () => moveSource(1),
        MovePreviousAction: () =>
          dispatchNavigation(InteractionGraph.MovePreviousInteraction.make({})),
        MovePreviousSource: () => moveSource(-1),
        Quit: () => renderer.destroy(),
        ReplayNext: replay.stepForward,
        ReplayPrevious: replay.stepBackward,
      }),
    )
  })

  const replayInstruction = (): string => {
    if (Option.isSome(replay.maybeError)) {
      return replay.maybeError.value
    }
    if (Option.isSome(maybeNotice)) {
      return maybeNotice.value
    }
    if (!replay.isBranchable) {
      return 'This frame is inspection-only until its Command result arrives.'
    }
    return Array.join(
      [
        'j/k or arrows move',
        ...(Option.isSome(maybeFocusedReference) ? ['Enter activates'] : []),
        ...localShortcutLabels,
      ],
      ' · ',
    )
  }

  return (
    <box
      backgroundColor="#0c0a09"
      flexDirection="column"
      gap={1}
      height="100%"
      padding={1}
      width="100%"
    >
      <box
        border
        borderColor="#fbbf24"
        flexDirection="column"
        height={HEADER_HEIGHT}
        padding={1}
        title={attributionSuffix('Foldkit Multiple Counters | OpenTUI React')}
      >
        <text
          content="One Model. One Message path. One tape."
          fg="#fbbf24"
          height={1}
        />
        <text
          content={`Replay ${replay.mode} | frame ${replay.frame.toString()} of ${replay.finalFrame.toString()} | ${replay.isBranchable ? 'settled' : 'unsettled'}`}
          fg="#a8a29e"
          height={1}
        />
        <text
          content={`Source: ${gitSourceUrl() || 'local checkout'}`}
          fg="#78716c"
          height={1}
        />
        <text content={replayInstruction()} fg="#78716c" height={1} />
      </box>

      <scrollbox
        contentOptions={{ flexDirection: 'column' }}
        flexGrow={1}
        minHeight={8}
        ref={scrollBoxRef}
        scrollY
        viewportCulling
      >
        <InteractionGroupView
          focusedNodeRef={focusedNodeRef}
          group={projection.root}
          maybeFocusedReference={maybeFocusedReference}
          isRoot
        />
      </scrollbox>

      <text
        content={Array.join(
          [...localShortcutLabels, '[ ] replay', 'i inspect', 'q quit'],
          ' · ',
        )}
        fg="#78716c"
        height={1}
      />
    </box>
  )
}

const isFocusedReference = (
  reference: InteractionGraph.InteractionReference,
  maybeFocusedReference: Option.Option<InteractionGraph.InteractionReference>,
): boolean =>
  Option.isSome(maybeFocusedReference) &&
  InteractionGraph.interactionReferenceKey(reference) ===
    InteractionGraph.interactionReferenceKey(maybeFocusedReference.value)

const groupContainsFocus = (
  group: InteractionGraph.InteractionGroup<unknown>,
  maybeFocusedReference: Option.Option<InteractionGraph.InteractionReference>,
): boolean => {
  if (Option.isNone(maybeFocusedReference)) {
    return false
  }
  const focusedKey = InteractionGraph.interactionReferenceKey(
    maybeFocusedReference.value,
  )
  return Array.some(
    InteractionGraph.interactiveNodes(group),
    node =>
      InteractionGraph.interactionReferenceKey(node.reference) === focusedKey,
  )
}

const interactiveNodeColor = (role: string, isFocused: boolean): string => {
  if (role === 'Destructive') {
    return '#fca5a5'
  } else if (isFocused) {
    return '#fbbf24'
  } else {
    return '#a8a29e'
  }
}

const interactiveNodeView = (
  node:
    | InteractionGraph.InteractionAction<unknown>
    | InteractionGraph.InteractionEditableText<unknown>
    | InteractionGraph.InteractionSelection<unknown>,
  maybeFocusedReference: Option.Option<InteractionGraph.InteractionReference>,
  focusedNodeRef: RefObject<TextRenderable | null>,
): ReactNode => {
  const isFocused = isFocusedReference(node.reference, maybeFocusedReference)
  const marker = isFocused ? '▶' : ' '
  const unavailable =
    node.availability._tag === 'Unavailable'
      ? ` · ${node.availability.reason}`
      : ''
  return (
    <text
      content={`${marker} ${node.label}${unavailable}`}
      fg={interactiveNodeColor(node.role, isFocused)}
      id={InteractionGraph.interactionReferenceKey(node.reference)}
      key={InteractionGraph.interactionReferenceKey(node.reference)}
      {...(isFocused ? { ref: focusedNodeRef } : {})}
    />
  )
}

const InteractionGroupView = ({
  focusedNodeRef,
  group,
  isRoot = false,
  maybeFocusedReference,
}: Readonly<{
  focusedNodeRef: RefObject<TextRenderable | null>
  group: InteractionGraph.InteractionGroup<unknown>
  isRoot?: boolean
  maybeFocusedReference: Option.Option<InteractionGraph.InteractionReference>
}>) => {
  const isFocused = groupContainsFocus(group, maybeFocusedReference)
  return (
    <box
      border={!isRoot}
      borderColor={isFocused ? '#fbbf24' : '#57534e'}
      flexDirection="column"
      gap={1}
      padding={isRoot ? 0 : 1}
      title={group.label}
    >
      {Array.map(group.children, child =>
        InteractionGraph.isInteractiveNode(child) ? (
          interactiveNodeView(child, maybeFocusedReference, focusedNodeRef)
        ) : (
          <InteractionContentView
            focusedNodeRef={focusedNodeRef}
            key={InteractionGraph.interactionIdKey(child.interactionId)}
            maybeFocusedReference={maybeFocusedReference}
            node={child}
          />
        ),
      )}
    </box>
  )
}

const InteractionContentView = ({
  focusedNodeRef,
  maybeFocusedReference,
  node,
}: Readonly<{
  focusedNodeRef: RefObject<TextRenderable | null>
  maybeFocusedReference: Option.Option<InteractionGraph.InteractionReference>
  node:
    | InteractionGraph.InteractionGroup<unknown>
    | InteractionGraph.InteractionInspection
}>) =>
  M.value(node).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      InteractionGroup: group => (
        <InteractionGroupView
          focusedNodeRef={focusedNodeRef}
          group={group}
          maybeFocusedReference={maybeFocusedReference}
        />
      ),
      InteractionInspection: inspection => (
        <box flexDirection="row" height={1} justifyContent="space-between">
          <text content={inspection.label} fg="#d6d3d1" />
          <text content={inspection.value} fg="#fbbf24" />
        </box>
      ),
    }),
  )
