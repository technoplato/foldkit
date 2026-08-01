import { Option, Result, Schema as S } from 'effect'
import { describe, expect, expectTypeOf, it } from 'vitest'

import * as Program from '../program/program.js'
import {
  formatProgramModel,
  interactionIdKey,
  interactionReferenceKey,
  interactionSourceKey,
  make,
} from './interactionGraph.js'
import {
  ActivatedInteraction,
  Available,
  ChangedInteractionText,
  CleanInteractionText,
  InteractionId,
  InteractionPathSegment,
  InteractionReference,
  InteractionSource,
  type ResolvedInteractionOccurrence,
  SelectedInteractionChoice,
  Unavailable,
  makeSchemas,
} from './interactionNode.js'

const Model = S.Struct({
  isEnabled: S.Boolean,
  step: S.Number,
  total: S.Number,
})
type Model = typeof Model.Type

const Incremented = S.TaggedStruct('Incremented', {
  amount: S.Number,
  receipt: S.NonEmptyString,
})
const Message = S.Union([Incremented])

const TestProgram = Program.make({
  id: 'interaction-graph-test',
  version: 1,
  Model,
  Message,
  init: () => [Model.make({ isEnabled: true, step: 1, total: 0 }), []],
  update: (model, message) => [
    Model.make({
      ...model,
      total: model.total + message.amount,
    }),
    [],
  ],
})

const IncrementInteraction = S.TaggedStruct('IncrementInteraction', {})
const Descriptor = S.Union([IncrementInteraction])
type Descriptor = typeof Descriptor.Type

const Schemas = makeSchemas(Descriptor)
const source = InteractionSource.make({
  programId: TestProgram.id,
  instancePath: [],
})

const interactionId = (
  token: string,
  interactionSource: InteractionSource = source,
): InteractionId => InteractionId.make({ source: interactionSource, token })

const reference = (
  destinationUri: string,
  token: string,
  interactionSource: InteractionSource = source,
): InteractionReference =>
  InteractionReference.make({
    destinationUri,
    interactionId: interactionId(token, interactionSource),
  })

const action = (model: Model, destinationUri = '/counter') =>
  Schemas.InteractionAction.make({
    reference: reference(destinationUri, 'Increment'),
    label: 'Increment',
    role: 'Primary',
    availability: model.isEnabled
      ? Available.make({})
      : Unavailable.make({ code: 'Disabled', reason: 'Increment is disabled' }),
    maybeDestinationUri: Option.none(),
    descriptor: IncrementInteraction.make({}),
  })

const projection = (model: Model, destinationUri = '/counter') => {
  const increment = action(model, destinationUri)
  return Schemas.InteractionProjection.make({
    destinationUri,
    root: Schemas.InteractionGroup.make({
      interactionId: interactionId('Counter'),
      label: 'Counter',
      role: 'Form',
      children: [increment],
      maybePrimaryInteractionReference: Option.some(increment.reference),
    }),
  })
}

const Graph = make({
  program: TestProgram,
  Descriptor,
  projectionForModel: model => projection(model),
  messageForOccurrence: ({
    model,
    resolved,
  }: Readonly<{
    model: Model
    resolved: ResolvedInteractionOccurrence<Descriptor>
    context: undefined
  }>) =>
    resolved.node._tag === 'InteractionAction'
      ? Option.some(
          Incremented.make({ amount: model.step, receipt: 'interaction' }),
        )
      : Option.none(),
})

const resultSuccess = <A, E>(result: Result.Result<A, E>): A => {
  if (Result.isFailure(result)) {
    throw new Error(JSON.stringify(result.failure, null, 2))
  }
  return result.success
}

describe('InteractionGraph', () => {
  it('formats a nested bare Program Model without inferring interactions', () => {
    const NestedModel = S.Struct({
      session: S.Struct({ count: S.Number }),
      modes: S.Array(S.Literals(['Live', 'Replay'])),
    })
    const model = NestedModel.make({
      session: { count: 2 },
      modes: ['Live'],
    })

    expect(formatProgramModel({ Model: NestedModel }, model)).toBe(
      '{ "session": { "count": 2 }, "modes": ["Live"] }',
    )
  })

  it('keeps semantic identity independent from the destination URI wrapper', () => {
    const currentReference = reference('/counter', 'Increment')
    const staleReference = reference('/counter/history', 'Increment')
    const model = Model.make({ isEnabled: true, step: 2, total: 0 })

    expect(interactionIdKey(currentReference.interactionId)).toBe(
      interactionIdKey(staleReference.interactionId),
    )
    expect(interactionReferenceKey(currentReference)).not.toBe(
      interactionReferenceKey(staleReference),
    )
    expect(
      resultSuccess(
        Graph.resolve(
          model,
          ActivatedInteraction.make({
            reference: staleReference,
            occurrenceId: 'occurrence-stale',
          }),
          undefined,
        ),
      ),
    ).toStrictEqual(Option.none())
    expect(
      resultSuccess(
        Graph.resolve(
          model,
          ActivatedInteraction.make({
            reference: currentReference,
            occurrenceId: 'occurrence-current',
          }),
          undefined,
        ),
      ),
    ).toStrictEqual(
      Option.some(Incremented.make({ amount: 2, receipt: 'interaction' })),
    )
  })

  it('keeps delimiter-shaped source values collision safe', () => {
    const firstSource = InteractionSource.make({
      programId: 'a\u0000b',
      instancePath: [
        InteractionPathSegment.make({
          submodelId: 'c',
          instanceId: 'd',
        }),
      ],
    })
    const secondSource = InteractionSource.make({
      programId: 'a',
      instancePath: [
        InteractionPathSegment.make({
          submodelId: 'b\u0000c',
          instanceId: 'd',
        }),
      ],
    })

    expect(interactionSourceKey(firstSource)).not.toBe(
      interactionSourceKey(secondSource),
    )
  })

  it('reprojects current availability and rejects absent or kind-mismatched claims', () => {
    const enabledModel = Model.make({ isEnabled: true, step: 1, total: 0 })
    const disabledModel = Model.make({ isEnabled: false, step: 1, total: 0 })
    const currentReference = reference('/counter', 'Increment')
    const missingReference = reference('/counter', 'Missing')

    expect(
      resultSuccess(
        Graph.resolve(
          disabledModel,
          ActivatedInteraction.make({
            reference: currentReference,
            occurrenceId: 'occurrence-disabled',
          }),
          undefined,
        ),
      ),
    ).toStrictEqual(Option.none())
    expect(
      resultSuccess(
        Graph.resolve(
          enabledModel,
          ActivatedInteraction.make({
            reference: missingReference,
            occurrenceId: 'occurrence-missing',
          }),
          undefined,
        ),
      ),
    ).toStrictEqual(Option.none())
    expect(
      resultSuccess(
        Graph.resolve(
          enabledModel,
          ChangedInteractionText.make({
            reference: currentReference,
            occurrenceId: 'occurrence-wrong-kind',
            value: '2',
          }),
          undefined,
        ),
      ),
    ).toStrictEqual(Option.none())
  })

  it('resolves changed editable text with the current Model and invocation context', () => {
    const model = Model.make({ isEnabled: true, step: 2, total: 7 })
    const editableReference = reference('/counter', 'Step')
    const editable = Schemas.InteractionEditableText.make({
      reference: editableReference,
      label: 'Step',
      role: 'TextField',
      availability: Available.make({}),
      state: CleanInteractionText.make({ value: model.step.toString() }),
      descriptor: IncrementInteraction.make({}),
    })
    const EditableGraph = make({
      program: TestProgram,
      Descriptor,
      projectionForModel: () =>
        Schemas.InteractionProjection.make({
          destinationUri: '/counter',
          root: Schemas.InteractionGroup.make({
            interactionId: interactionId('Counter'),
            label: 'Counter',
            role: 'Form',
            children: [editable],
            maybePrimaryInteractionReference: Option.some(editable.reference),
          }),
        }),
      messageForOccurrence: ({
        model: currentModel,
        resolved,
        context,
      }: Readonly<{
        model: Model
        resolved: ResolvedInteractionOccurrence<Descriptor>
        context: Readonly<{ receipt: string }>
      }>) =>
        resolved.occurrence._tag === 'ChangedInteractionText'
          ? Option.some(
              Incremented.make({
                amount: currentModel.total + Number(resolved.occurrence.value),
                receipt: context.receipt,
              }),
            )
          : Option.none(),
    })

    expect(
      resultSuccess(
        EditableGraph.resolve(
          model,
          ChangedInteractionText.make({
            reference: editableReference,
            occurrenceId: 'occurrence-edit-step',
            value: '3',
          }),
          { receipt: 'editable' },
        ),
      ),
    ).toStrictEqual(
      Option.some(Incremented.make({ amount: 10, receipt: 'editable' })),
    )
  })

  it('rejects the same-URI claim for a replaced Submodel occurrence', () => {
    const currentSource = InteractionSource.make({
      programId: TestProgram.id,
      instancePath: [
        InteractionPathSegment.make({
          submodelId: 'Confirmation',
          instanceId: 'current',
        }),
      ],
    })
    const staleSource = InteractionSource.make({
      programId: TestProgram.id,
      instancePath: [
        InteractionPathSegment.make({
          submodelId: 'Confirmation',
          instanceId: 'stale',
        }),
      ],
    })
    const model = Model.make({ isEnabled: true, step: 1, total: 0 })
    const currentAction = Schemas.InteractionAction.make({
      ...action(model),
      reference: reference('/counter/confirm', 'Confirm', currentSource),
    })
    const ModalGraph = make({
      program: TestProgram,
      Descriptor,
      projectionForModel: () =>
        Schemas.InteractionProjection.make({
          destinationUri: '/counter/confirm',
          root: Schemas.InteractionGroup.make({
            interactionId: interactionId('Confirmation', currentSource),
            label: 'Confirmation',
            role: 'Alert',
            children: [currentAction],
            maybePrimaryInteractionReference: Option.some(
              currentAction.reference,
            ),
          }),
        }),
      messageForOccurrence: () =>
        Option.some(Incremented.make({ amount: 1, receipt: 'confirmation' })),
    })

    expect(
      resultSuccess(
        ModalGraph.resolve(
          model,
          ActivatedInteraction.make({
            reference: reference('/counter/confirm', 'Confirm', staleSource),
            occurrenceId: 'occurrence-stale-modal',
          }),
          undefined,
        ),
      ),
    ).toStrictEqual(Option.none())
  })

  it('checks selected choice availability and selected projection validity', () => {
    const model = Model.make({ isEnabled: true, step: 1, total: 0 })
    const selectionReference = reference('/counter', 'Step')
    const selection = Schemas.InteractionSelection.make({
      reference: selectionReference,
      label: 'Step',
      role: 'RadioGroup',
      availability: Available.make({}),
      choices: [
        {
          id: 'One',
          label: 'One',
          availability: Available.make({}),
        },
        {
          id: 'Two',
          label: 'Two',
          availability: Unavailable.make({
            code: 'UnavailableStep',
            reason: 'Two is unavailable',
          }),
        },
      ],
      maybeSelectedChoiceId: Option.some('One'),
      descriptor: IncrementInteraction.make({}),
    })
    const SelectionGraph = make({
      program: TestProgram,
      Descriptor,
      projectionForModel: () =>
        Schemas.InteractionProjection.make({
          destinationUri: '/counter',
          root: Schemas.InteractionGroup.make({
            interactionId: interactionId('Counter'),
            label: 'Counter',
            role: 'Form',
            children: [selection],
            maybePrimaryInteractionReference: Option.none(),
          }),
        }),
      messageForOccurrence: ({ resolved }) =>
        resolved.node._tag === 'InteractionSelection'
          ? Option.some(Incremented.make({ amount: 1, receipt: 'selection' }))
          : Option.none(),
    })
    const selected = (choiceId: string, occurrenceId: string) =>
      SelectedInteractionChoice.make({
        reference: selectionReference,
        occurrenceId,
        choiceId,
      })

    expect(
      resultSuccess(
        SelectionGraph.resolve(
          model,
          selected('One', 'occurrence-choice-one'),
          undefined,
        ),
      ),
    ).toStrictEqual(
      Option.some(Incremented.make({ amount: 1, receipt: 'selection' })),
    )
    expect(
      resultSuccess(
        SelectionGraph.resolve(
          model,
          selected('Two', 'occurrence-choice-two'),
          undefined,
        ),
      ),
    ).toStrictEqual(Option.none())
    expect(
      resultSuccess(
        SelectionGraph.resolve(
          model,
          selected('Missing', 'occurrence-choice-missing'),
          undefined,
        ),
      ),
    ).toStrictEqual(Option.none())

    const InvalidSelectionGraph = make({
      program: TestProgram,
      Descriptor,
      projectionForModel: () =>
        Schemas.InteractionProjection.make({
          destinationUri: '/counter',
          root: Schemas.InteractionGroup.make({
            interactionId: interactionId('Counter'),
            label: 'Counter',
            role: 'Form',
            children: [
              Schemas.InteractionSelection.make({
                ...selection,
                maybeSelectedChoiceId: Option.some('Missing'),
              }),
            ],
            maybePrimaryInteractionReference: Option.none(),
          }),
        }),
      messageForOccurrence: () => Option.none(),
    })
    const invalidProjection = InvalidSelectionGraph.project(model)
    expect(Result.isFailure(invalidProjection)).toBe(true)
    if (Result.isFailure(invalidProjection)) {
      expect(invalidProjection.failure._tag).toBe(
        'InvalidSelectedInteractionChoiceError',
      )
    }
  })

  it('rejects a resolver-produced Message that violates the Program Schema', () => {
    const invalidMessage = (): typeof Message.Type => ({
      _tag: 'Incremented',
      amount: 1,
      receipt: '',
    })
    const InvalidMessageGraph = make({
      program: TestProgram,
      Descriptor,
      projectionForModel: model => projection(model),
      messageForOccurrence: () => Option.some(invalidMessage()),
    })
    const model = Model.make({ isEnabled: true, step: 1, total: 0 })
    const resolved = InvalidMessageGraph.resolve(
      model,
      ActivatedInteraction.make({
        reference: reference('/counter', 'Increment'),
        occurrenceId: 'occurrence-invalid-message',
      }),
      undefined,
    )

    expect(Result.isFailure(resolved)).toBe(true)
    if (Result.isFailure(resolved)) {
      expect(resolved.failure._tag).toBe('InvalidInteractionMessageError')
    }
  })

  it('returns typed failures when Program interaction callbacks throw', () => {
    const model = Model.make({ isEnabled: true, step: 1, total: 0 })
    const ProjectionDefectGraph = make({
      program: TestProgram,
      Descriptor,
      projectionForModel: () => {
        throw new Error('projection defect')
      },
      messageForOccurrence: () => Option.none(),
    })
    const projectionResult = ProjectionDefectGraph.project(model)

    expect(Result.isFailure(projectionResult)).toBe(true)
    if (Result.isFailure(projectionResult)) {
      expect(projectionResult.failure._tag).toBe(
        'InteractionProjectionDefectError',
      )
    }

    const ResolverDefectGraph = make({
      program: TestProgram,
      Descriptor,
      projectionForModel: currentModel => projection(currentModel),
      messageForOccurrence: () => {
        throw new Error('resolver defect')
      },
    })
    const resolverResult = ResolverDefectGraph.resolve(
      model,
      ActivatedInteraction.make({
        reference: reference('/counter', 'Increment'),
        occurrenceId: 'occurrence-resolver-defect',
      }),
      undefined,
    )

    expect(Result.isFailure(resolverResult)).toBe(true)
    if (Result.isFailure(resolverResult)) {
      expect(resolverResult.failure._tag).toBe('InteractionResolverDefectError')
    }
  })

  it('preserves Model, Message, Descriptor, and invocation-context inference', () => {
    const TypedGraph = make({
      program: TestProgram,
      Descriptor,
      projectionForModel: (model: Model) => projection(model),
      messageForOccurrence: ({
        model,
        resolved,
        context,
      }: Readonly<{
        model: Model
        resolved: ResolvedInteractionOccurrence<Descriptor>
        context: Readonly<{ receipt: string }>
      }>) =>
        resolved.node._tag === 'InteractionAction'
          ? Option.some(
              Incremented.make({
                amount: model.step,
                receipt: context.receipt,
              }),
            )
          : Option.none(),
    })

    expectTypeOf(TypedGraph.project).parameter(0).toEqualTypeOf<Model>()
    expectTypeOf(TypedGraph.resolve)
      .parameter(2)
      .toEqualTypeOf<Readonly<{ receipt: string }>>()
    expectTypeOf<
      typeof TypedGraph.Descriptor.Type
    >().toEqualTypeOf<Descriptor>()
    expectTypeOf(
      resultSuccess(
        TypedGraph.resolve(
          Model.make({ isEnabled: true, step: 1, total: 0 }),
          ActivatedInteraction.make({
            reference: reference('/counter', 'Increment'),
            occurrenceId: 'occurrence-typed',
          }),
          { receipt: 'typed' },
        ),
      ),
    ).toEqualTypeOf<Option.Option<typeof Message.Type>>()
  })

  it('returns typed failures for invalid occurrence claims and graph invariants', () => {
    const model = Model.make({ isEnabled: true, step: 1, total: 0 })
    const invalidOccurrence = Graph.resolve(model, {}, undefined)
    expect(Result.isFailure(invalidOccurrence)).toBe(true)
    if (Result.isFailure(invalidOccurrence)) {
      expect(invalidOccurrence.failure._tag).toBe(
        'InvalidInteractionOccurrenceError',
      )
    }

    const duplicateAction = action(model)
    const DuplicateGraph = make({
      program: TestProgram,
      Descriptor,
      projectionForModel: () =>
        Schemas.InteractionProjection.make({
          destinationUri: '/counter',
          root: Schemas.InteractionGroup.make({
            interactionId: interactionId('Counter'),
            label: 'Counter',
            role: 'Form',
            children: [duplicateAction, duplicateAction],
            maybePrimaryInteractionReference: Option.some(
              duplicateAction.reference,
            ),
          }),
        }),
      messageForOccurrence: () => Option.none(),
    })
    const duplicateResult = DuplicateGraph.project(model)
    expect(Result.isFailure(duplicateResult)).toBe(true)
    if (Result.isFailure(duplicateResult)) {
      expect(duplicateResult.failure._tag).toBe('DuplicateInteractionIdError')
    }
  })

  it('rejects foreign sources and missing group primary references', () => {
    const model = Model.make({ isEnabled: true, step: 1, total: 0 })
    const foreignSource = InteractionSource.make({
      programId: 'another-program',
      instancePath: [],
    })
    const foreignAction = Schemas.InteractionAction.make({
      ...action(model),
      reference: reference('/counter', 'Increment', foreignSource),
    })
    const ForeignGraph = make({
      program: TestProgram,
      Descriptor,
      projectionForModel: () =>
        Schemas.InteractionProjection.make({
          destinationUri: '/counter',
          root: Schemas.InteractionGroup.make({
            interactionId: interactionId('Counter'),
            label: 'Counter',
            role: 'Form',
            children: [foreignAction],
            maybePrimaryInteractionReference: Option.none(),
          }),
        }),
      messageForOccurrence: () => Option.none(),
    })
    const MissingPrimaryGraph = make({
      program: TestProgram,
      Descriptor,
      projectionForModel: () =>
        Schemas.InteractionProjection.make({
          destinationUri: '/counter',
          root: Schemas.InteractionGroup.make({
            interactionId: interactionId('Counter'),
            label: 'Counter',
            role: 'Form',
            children: [action(model)],
            maybePrimaryInteractionReference: Option.some(
              reference('/counter', 'Missing'),
            ),
          }),
        }),
      messageForOccurrence: () => Option.none(),
    })

    const foreignResult = ForeignGraph.project(model)
    const primaryResult = MissingPrimaryGraph.project(model)
    expect(Result.isFailure(foreignResult)).toBe(true)
    expect(Result.isFailure(primaryResult)).toBe(true)
    if (Result.isFailure(foreignResult)) {
      expect(foreignResult.failure._tag).toBe('ForeignInteractionSourceError')
    }
    if (Result.isFailure(primaryResult)) {
      expect(primaryResult.failure._tag).toBe('MissingPrimaryInteractionError')
    }
  })

  it('round trips a stateless activation claim through its public Schema', () => {
    const occurrence = ActivatedInteraction.make({
      reference: reference('/counter', 'Increment'),
      occurrenceId: 'occurrence-json',
    })
    const JsonOccurrence = S.toCodecJson(Graph.InteractionOccurrence)
    const encoded = S.encodeSync(JsonOccurrence)(occurrence)

    expect(S.decodeUnknownSync(JsonOccurrence)(encoded)).toStrictEqual(
      occurrence,
    )
  })
})
