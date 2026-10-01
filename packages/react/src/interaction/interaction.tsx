import { Array, Equal, Function, Option, Record, String, pipe } from 'effect'
import { type Catalog, Interaction } from 'foldkit'
import type { ButtonNode, UiNode } from 'foldkit/renderers'
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'

import { type PaintClassNames, paintTree } from '../paintReact/paintReact.js'

export type { PaintClassNames } from '../paintReact/paintReact.js'

/**
 * Any bound Program, with its Model and Message erased. Components read
 * status, entries, and the menu, and press by tag, so they never need the
 * Program's types.
 */
export type AnyBound = Interaction.BoundInteraction<unknown, never>

const BoundContext = createContext<Option.Option<AnyBound>>(Option.none())

/**
 * Makes one bound Program available to every hook and component below it.
 *
 * @example
 * ```tsx
 * const bound = Interaction.bind(SyncedCounter, startCounter(config))
 * root.render(
 *   <ProgramProvider bound={bound}>
 *     <CounterPage />
 *   </ProgramProvider>,
 * )
 * ```
 */
export const ProgramProvider = ({
  bound,
  children,
}: Readonly<{ bound: AnyBound; children?: ReactNode }>): ReactElement => (
  <BoundContext.Provider value={Option.some(bound)}>
    {children}
  </BoundContext.Provider>
)

/** The bound Program from the nearest {@link ProgramProvider}. */
export const useBound = (): AnyBound =>
  Option.getOrThrowWith(
    useContext(BoundContext),
    () =>
      new Error(
        '@foldkit/react/interaction hooks need a ProgramProvider above them',
      ),
  )

// SELECTION

type Selected<Snapshot, Selection> = Readonly<{
  snapshot: Snapshot
  selection: Selection
}>

const useSelected = <Snapshot, Selection>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => Snapshot,
  select: (snapshot: Snapshot) => Selection,
  isEqual: (self: Selection, that: Selection) => boolean,
): Selection => {
  const committed = useRef<Option.Option<Selection>>(Option.none())
  const getSelection = useMemo(() => {
    let maybeSelected: Option.Option<Selected<Snapshot, Selection>> =
      Option.none()
    return (): Selection => {
      const snapshot = getSnapshot()
      if (
        Option.isSome(maybeSelected) &&
        Object.is(maybeSelected.value.snapshot, snapshot)
      ) {
        return maybeSelected.value.selection
      }
      const next = select(snapshot)
      const maybePrevious = Option.isSome(maybeSelected)
        ? Option.some(maybeSelected.value.selection)
        : committed.current
      const selection =
        Option.isSome(maybePrevious) && isEqual(maybePrevious.value, next)
          ? maybePrevious.value
          : next
      maybeSelected = Option.some({ snapshot, selection })
      return selection
    }
  }, [getSnapshot, select, isEqual])
  const selection = useSyncExternalStore(subscribe, getSelection, getSelection)
  useEffect(() => {
    committed.current = Option.some(selection)
  }, [selection])
  return selection
}

const useBoundRead = <Value,>(bound: AnyBound, read: () => Value): Value =>
  useSelected(bound.subscribe, bound.readModel, read, Equal.equals)

/**
 * Whether the bound Program accepts Actions: Ready, Starting, or Failed.
 * The component re-renders only when the status changes.
 */
export const useStatus = (): Interaction.Status => {
  const bound = useBound()
  return useBoundRead(bound, bound.status)
}

/**
 * The bound Program's screen tree. It keeps its reference while the tree is
 * unchanged, so a menu move does not repaint the screen.
 */
export const useScreen = (): Option.Option<UiNode> => {
  const bound = useBound()
  return useBoundRead(bound, bound.screen)
}

/** The presented action menu, when one is open. */
export const useMenu = (): Option.Option<Interaction.MenuView> => {
  const bound = useBound()
  return useBoundRead(bound, bound.menu)
}

// ACTIONS

/**
 * One Action as a control. `props` spreads onto a DOM button:
 * `<button {...handle.props}>`. React Native reads `press` and `isEnabled`.
 */
export type ActionHandle = Readonly<{
  entry: Catalog.Entry
  isEnabled: boolean
  maybeBecause: Option.Option<string>
  press: () => boolean
  props: Readonly<{
    type: 'button'
    disabled: boolean
    title?: string
    'aria-keyshortcuts'?: string
    'data-action': string
    onClick: () => void
  }>
}>

const handleOf =
  (bound: AnyBound) =>
  (entry: Catalog.Entry): ActionHandle => {
    const maybeBecause =
      entry.availability._tag === 'Disabled'
        ? Option.some(entry.availability.because)
        : Option.none()
    const isEnabled = entry.availability._tag === 'Enabled'
    const press = (): boolean => bound.press(entry.tag)
    return {
      entry,
      isEnabled,
      maybeBecause,
      press,
      props: {
        type: 'button',
        disabled: !isEnabled,
        ...Option.match(maybeBecause, {
          onNone: () => ({}),
          onSome: because => ({ title: because }),
        }),
        ...Array.match(entry.keys, {
          onEmpty: () => ({}),
          onNonEmpty: keys => ({ 'aria-keyshortcuts': keys.join(' ') }),
        }),
        'data-action': entry.tag,
        onClick: () => {
          press()
        },
      },
    }
  }

/**
 * Every Action of the bound Program as a control, in Catalog order, for
 * generic surfaces that list them all. The list keeps its reference until
 * an Action's availability changes.
 */
export const useActionList = (): ReadonlyArray<ActionHandle> => {
  const bound = useBound()
  const entries = useBoundRead(bound, bound.entries)
  return useMemo(() => Array.map(entries, handleOf(bound)), [bound, entries])
}

// DOMAIN

/**
 * A Program the domain hooks read: its id, the Model its `init` returns,
 * and, for {@link useActions}, its exact Catalog.
 */
export type FeatureProgram = Readonly<{
  id: string
  init: () => readonly [unknown, ReadonlyArray<unknown>]
}>

/** The Model one Program folds. */
export type FeatureModel<P extends FeatureProgram> = ReturnType<P['init']>[0]

type PayloadFreeOf<Action> =
  Action extends Readonly<{ Type: infer Value }>
    ? keyof Omit<Value, '_tag'> extends never
      ? Action
      : never
    : never

/**
 * Every payload-free Action a Program's Catalog declares, keyed by its tag
 * in lower camel case.
 *
 * @example
 * ```typescript
 * type CounterActions = ActionsOf<typeof SyncedCounter>
 * // { increment: ActionHandle; decrement: ActionHandle; reset: ActionHandle }
 * ```
 */
export type ActionsOf<P> = {
  readonly [Action in PayloadFreeOf<
    Catalog.ActionOf<Catalog.CatalogOf<P>>
  > as Uncapitalize<Action['tag']>]: ActionHandle
}

/** The Model, or a selection of it, and the Actions of one Program. */
export type Feature<Model, Actions> = Readonly<{
  model: Model
  actions: Actions
}>

const useBoundTo = (program: FeatureProgram): AnyBound => {
  const bound = useBound()
  if (Option.isSome(bound.programId) && bound.programId.value !== program.id) {
    throw new Error(
      `The nearest ProgramProvider binds ${bound.programId.value}, not ${program.id}`,
    )
  }
  return bound
}

/**
 * The bound Program's Model, or one selection of it. The component
 * re-renders only when the selection changes by value, so a component that
 * reads the count ignores menu moves.
 *
 * @example
 * ```tsx
 * const count = useModel(SyncedCounter, model =>
 *   model._tag === 'Ready' ? model.count : 0,
 * )
 * ```
 */
export function useModel<P extends FeatureProgram>(program: P): FeatureModel<P>
export function useModel<P extends FeatureProgram, Selection>(
  program: P,
  select: (model: FeatureModel<P>) => Selection,
  isEqual?: (self: Selection, that: Selection) => boolean,
): Selection
export function useModel(
  program: FeatureProgram,
  select: (model: unknown) => unknown = Function.identity,
  isEqual: (self: unknown, that: unknown) => boolean = Equal.equals,
): unknown {
  const bound = useBoundTo(program)
  return useSelected(bound.subscribe, bound.readModel, select, isEqual)
}

const actionsOf = <P extends FeatureProgram>(
  bound: AnyBound,
  entries: ReadonlyArray<Catalog.Entry>,
): ActionsOf<P> =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  pipe(
    entries,
    Array.filter(entry => entry.isPayloadFree),
    Array.map((entry): readonly [string, ActionHandle] => [
      String.uncapitalize(entry.tag),
      handleOf(bound)(entry),
    ]),
    Record.fromEntries,
  ) as ActionsOf<P>

/**
 * Every payload-free Catalog Action of the bound Program as a typed
 * control: `actions.increment.press()`. The object keeps its reference
 * until an Action's availability changes.
 *
 * @example
 * ```tsx
 * const actions = useActions(SyncedCounter)
 * return <button {...actions.increment.props}>+</button>
 * ```
 */
export const useActions = <P extends FeatureProgram>(
  program: P,
): ActionsOf<P> => {
  const bound = useBoundTo(program)
  const entries = useBoundRead(bound, bound.entries)
  return useMemo(() => actionsOf<P>(bound, entries), [bound, entries])
}

/**
 * The bound Program's Model, or one selection of it, with its typed
 * Actions. The result keeps its reference until either part changes.
 *
 * @example
 * ```tsx
 * const { model: count, actions } = useFeature(SyncedCounter, model =>
 *   model._tag === 'Ready' ? model.count : 0,
 * )
 * ```
 */
export function useFeature<P extends FeatureProgram>(
  program: P,
): Feature<FeatureModel<P>, ActionsOf<P>>
export function useFeature<P extends FeatureProgram, Selection>(
  program: P,
  select: (model: FeatureModel<P>) => Selection,
  isEqual?: (self: Selection, that: Selection) => boolean,
): Feature<Selection, ActionsOf<P>>
export function useFeature(
  program: FeatureProgram,
  select: (model: unknown) => unknown = Function.identity,
  isEqual: (self: unknown, that: unknown) => boolean = Equal.equals,
): Feature<unknown, unknown> {
  const model = useModel(program, select, isEqual)
  const actions = useActions(program)
  return useMemo(() => ({ model, actions }), [model, actions])
}

// CONTROLS

/**
 * A button for one Action: its label, its disabled sentence, its keys.
 *
 * @example
 * ```tsx
 * const actions = useActions(SyncedCounter)
 * return <ActionButton action={actions.increment}>Add one</ActionButton>
 * ```
 */
export const ActionButton = ({
  action,
  className,
  children,
}: Readonly<{
  action: ActionHandle
  className?: string
  children?: ReactNode
}>): ReactElement => (
  <button className={className} {...action.props}>
    {children ?? action.entry.label}
  </button>
)

/** One button per Action, in Catalog order. */
export const ActionButtons = ({
  className,
}: Readonly<{ className?: string }>): ReactElement => (
  <>
    {Array.map(useActionList(), handle => (
      <button key={handle.entry.tag} className={className} {...handle.props}>
        {handle.entry.label}
      </button>
    ))}
  </>
)

// SCREEN

/**
 * Paints the bound Program's screen tree. A Button press sends its Catalog
 * Action, so the screen needs no token table. It repaints only when the
 * tree changes.
 */
export const Screen = ({
  classNames,
}: Readonly<{ classNames?: PaintClassNames }>): ReactElement | null => {
  const bound = useBound()
  const maybeTree = useScreen()
  return useMemo(
    () =>
      Option.match(maybeTree, {
        onNone: () => null,
        onSome: tree =>
          paintTree(tree, {
            classNames: classNames ?? {},
            onPress: (button: ButtonNode) => {
              if (button.action !== undefined) {
                bound.press(button.action)
              }
            },
          }),
      }),
    [bound, maybeTree, classNames],
  )
}

// MENU

const rowIdOf = (tag: string): string => `fk-action-menu-${tag}`

const listId = 'fk-action-menu-list'

/**
 * The action menu as an accessible combo box: a filter input and a listbox
 * of Catalog rows. It renders nothing while the menu is closed. Keys are
 * routed by {@link useKeyBindings}; the input only carries typing.
 */
export const ActionMenuDialog = ({
  className,
}: Readonly<{ className?: string }>): ReactElement | null => {
  const bound = useBound()
  return Option.match(useMenu(), {
    onNone: () => null,
    onSome: menu => {
      const maybeHighlighted = Array.findFirst(
        menu.rows,
        row => row.isHighlighted,
      )
      return (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="fk-action-menu-title"
          className={className ?? 'fk-action-menu'}
          data-style={menu.style._tag}
        >
          <h2 id="fk-action-menu-title" className="fk-action-menu-title">
            Actions
          </h2>
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={Option.match(maybeHighlighted, {
              onNone: () => undefined,
              onSome: row => rowIdOf(row.entry.tag),
            })}
            aria-label="Filter actions"
            className="fk-action-menu-filter"
            value={menu.query}
            readOnly={!menu.isFilterFocused}
            autoFocus
            onChange={event => {
              bound.typeInMenu(event.currentTarget.value)
            }}
          />
          <ul id={listId} role="listbox" className="fk-action-menu-rows">
            {Array.map(menu.rows, row => (
              <li
                key={row.entry.tag}
                id={rowIdOf(row.entry.tag)}
                role="option"
                aria-selected={row.isHighlighted}
                aria-disabled={row.entry.availability._tag === 'Disabled'}
                data-focused={row.isFocused}
                className="fk-action-menu-row"
                onClick={() => {
                  bound.chooseFromMenu(row.entry.tag)
                }}
              >
                <span className="fk-action-menu-label">{row.entry.label}</span>
                <span className="fk-action-menu-what">{row.entry.what}</span>
                {row.entry.availability._tag === 'Disabled' ? (
                  <span className="fk-action-menu-because">
                    {row.entry.availability.because}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {Array.isReadonlyArrayEmpty(menu.rows) ? (
            <p className="fk-action-menu-empty">No matching actions</p>
          ) : null}
        </div>
      )
    },
  })
}

// KEYS

/**
 * Routes document key presses to the bound Program: `+` sends Increment,
 * Cmd-K opens the action menu, arrows and Escape move through it. Typing
 * into a text field stays with the field. Does nothing where there is no
 * document, such as React Native.
 */
export const useKeyBindings = (): void => {
  const bound = useBound()
  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined
    }
    return Interaction.listenToDocumentKeys(bound, document)
  }, [bound])
}
