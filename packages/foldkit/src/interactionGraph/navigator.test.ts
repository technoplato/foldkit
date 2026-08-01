import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { interactionReferenceKey } from './interactionGraph.js'
import {
  Available,
  CleanInteractionText,
  DirtyInteractionText,
  InteractionId,
  InteractionPathSegment,
  InteractionReference,
  InteractionSource,
  Unavailable,
  makeSchemas,
} from './interactionNode.js'
import {
  BeginEditingInteraction,
  MoveIntoInteraction,
  MoveOutOfInteraction,
  makeNavigator,
} from './navigator.js'

const Descriptor = S.TaggedStruct('TestInteraction', {})
type Descriptor = typeof Descriptor.Type
const Schemas = makeSchemas(Descriptor)

const source = (
  instancePath: ReadonlyArray<
    Readonly<{ submodelId: string; instanceId: string }>
  > = [],
): InteractionSource =>
  InteractionSource.make({
    programId: 'navigator-test',
    instancePath: instancePath.map(segment =>
      InteractionPathSegment.make(segment),
    ),
  })

const interactionId = (
  token: string,
  interactionSource = source(),
): InteractionId => InteractionId.make({ source: interactionSource, token })

const reference = (
  token: string,
  interactionSource = source(),
): InteractionReference =>
  InteractionReference.make({
    destinationUri: '/navigator',
    interactionId: interactionId(token, interactionSource),
  })

const action = (token: string, interactionSource = source()) =>
  Schemas.InteractionAction.make({
    reference: reference(token, interactionSource),
    label: token,
    role: 'Default',
    availability: Available.make({}),
    maybeDestinationUri: Option.none(),
    descriptor: Descriptor.make({}),
  })

const group = (
  token: string,
  children: ReadonlyArray<
    | ReturnType<typeof action>
    | typeof Schemas.InteractionGroup.Type
    | typeof Schemas.InteractionEditableText.Type
  >,
  maybePrimaryInteractionReference: Option.Option<InteractionReference>,
  interactionSource = source(),
) =>
  Schemas.InteractionGroup.make({
    interactionId: interactionId(token, interactionSource),
    label: token,
    role: 'Group',
    children,
    maybePrimaryInteractionReference,
  })

const projection = (root: typeof Schemas.InteractionGroup.Type) =>
  Schemas.InteractionProjection.make({
    destinationUri: '/navigator',
    root,
  })

describe('Interaction navigator', () => {
  it('moves into and out of a primary interaction in a three-level tree', () => {
    const deepSource = source([
      { submodelId: 'Level', instanceId: 'one' },
      { submodelId: 'Level', instanceId: 'two' },
    ])
    const primary = action('Primary', deepSource)
    const nested = action('Nested', deepSource)
    const levelTwo = group(
      'LevelTwo',
      [primary, nested],
      Option.some(primary.reference),
      deepSource,
    )
    const levelOneSource = source([{ submodelId: 'Level', instanceId: 'one' }])
    const levelOne = group(
      'LevelOne',
      [levelTwo],
      Option.none(),
      levelOneSource,
    )
    const root = group('Root', [levelOne], Option.none())
    const navigator = makeNavigator<Descriptor>()
    navigator.reconcile(projection(root))

    expect(navigator.readFocusedReference()).toStrictEqual(
      Option.some(primary.reference),
    )
    navigator.dispatch(MoveIntoInteraction.make({}))
    expect(navigator.readFocusedReference()).toStrictEqual(
      Option.some(nested.reference),
    )
    navigator.dispatch(MoveOutOfInteraction.make({}))
    expect(navigator.readFocusedReference()).toStrictEqual(
      Option.some(primary.reference),
    )
  })

  it('does not move out to an unavailable group primary', () => {
    const interactionSource = source([
      { submodelId: 'Level', instanceId: 'one' },
    ])
    const primary = Schemas.InteractionAction.make({
      ...action('Primary', interactionSource),
      availability: Unavailable.make({
        code: 'UnavailablePrimary',
        reason: 'The group primary is unavailable',
      }),
    })
    const nested = action('Nested', interactionSource)
    const navigator = makeNavigator<Descriptor>()
    navigator.reconcile(
      projection(
        group(
          'Root',
          [primary, nested],
          Option.some(primary.reference),
          interactionSource,
        ),
      ),
    )

    expect(navigator.readFocusedReference()).toStrictEqual(
      Option.some(nested.reference),
    )
    navigator.dispatch(MoveOutOfInteraction.make({}))
    expect(navigator.readFocusedReference()).toStrictEqual(
      Option.some(nested.reference),
    )
  })

  it('preserves editing for the same editable reference and exits when it changes kind', () => {
    const editableReference = reference('Name')
    const editable = Schemas.InteractionEditableText.make({
      reference: editableReference,
      label: 'Name',
      role: 'TextField',
      availability: Available.make({}),
      state: CleanInteractionText.make({ value: 'before' }),
      descriptor: Descriptor.make({}),
    })
    const navigator = makeNavigator<Descriptor>()
    navigator.reconcile(projection(group('Root', [editable], Option.none())))
    navigator.dispatch(BeginEditingInteraction.make({}))
    expect(navigator.readState()._tag).toBe('EditingInteraction')

    const edited = Schemas.InteractionEditableText.make({
      ...editable,
      state: DirtyInteractionText.make({ value: 'after' }),
    })
    navigator.reconcile(projection(group('Root', [edited], Option.none())))
    expect(navigator.readState()._tag).toBe('EditingInteraction')

    const replacement = Schemas.InteractionAction.make({
      reference: editableReference,
      label: 'Name',
      role: 'Default',
      availability: Available.make({}),
      maybeDestinationUri: Option.none(),
      descriptor: Descriptor.make({}),
    })
    navigator.reconcile(projection(group('Root', [replacement], Option.none())))
    expect(navigator.readState()._tag).toBe('BrowsingInteractions')
    expect(navigator.readFocusedReference()).toStrictEqual(
      Option.some(replacement.reference),
    )
  })

  it('recovers to browsing when an edited reference is replaced by another editable field', () => {
    const first = Schemas.InteractionEditableText.make({
      reference: reference('FirstName'),
      label: 'First name',
      role: 'TextField',
      availability: Available.make({}),
      state: CleanInteractionText.make({ value: 'First' }),
      descriptor: Descriptor.make({}),
    })
    const second = Schemas.InteractionEditableText.make({
      reference: reference('SecondName'),
      label: 'Second name',
      role: 'TextField',
      availability: Available.make({}),
      state: CleanInteractionText.make({ value: 'Second' }),
      descriptor: Descriptor.make({}),
    })
    const navigator = makeNavigator<Descriptor>()
    navigator.reconcile(projection(group('Root', [first], Option.none())))
    navigator.dispatch(BeginEditingInteraction.make({}))

    navigator.reconcile(projection(group('Root', [second], Option.none())))

    expect(navigator.readState()._tag).toBe('BrowsingInteractions')
    expect(navigator.readFocusedReference()).toStrictEqual(
      Option.some(second.reference),
    )
  })

  it('recovers a removed focus to the next surviving projected interaction', () => {
    const first = action('First')
    const removed = action('Removed')
    const next = action('Next')
    const navigator = makeNavigator<Descriptor>()
    navigator.reconcile(
      projection(group('Root', [first, removed, next], Option.none())),
    )
    expect(navigator.focus(removed.reference)).toBe(true)

    navigator.reconcile(projection(group('Root', [first, next], Option.none())))
    const maybeFocused = navigator.readFocusedReference()
    expect(Option.isSome(maybeFocused)).toBe(true)
    if (Option.isSome(maybeFocused)) {
      expect(interactionReferenceKey(maybeFocused.value)).toBe(
        interactionReferenceKey(next.reference),
      )
    }
  })
})
