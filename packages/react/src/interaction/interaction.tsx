import {
  Array,
  Equal,
  Function,
  Match as M,
  Option,
  Record,
  String,
  pipe,
} from 'effect'
import { Catalog, Declaration, Environment, Interaction } from 'foldkit'
import type { ButtonNode, UiNode } from 'foldkit/renderers'
import {
  Fragment,
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
} from 'react'

import {
  type PaintClassNames,
  ScreenStyles,
  paintTree,
} from '../paintReact/paintReact.js'
import { useBoundRead, useSelected } from './selected.js'

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

/**
 * Whether the bound Program accepts Actions: Ready, Starting, or Failed.
 * The component re-renders only when the status changes.
 */
export const useStatus = (): Interaction.Status => {
  const bound = useBound()
  return useBoundRead(bound, bound.status)
}

const StatusText = ({
  description,
}: Readonly<{ description: string }>): ReactElement => (
  <>
    <ScreenStyles />
    <p className="fk-status" role="status">
      {description}
    </p>
  </>
)

/**
 * Paints `children` once the Program is Ready, and the Program's own
 * description while it is Starting or Failed, so a host writes no status
 * text: `Starting Counter…`, then the count.
 *
 * @example
 * ```tsx
 * <WhenReady>
 *   <NavigationFrame />
 * </WhenReady>
 * ```
 */
export const WhenReady = ({
  children,
}: Readonly<{ children: ReactNode }>): ReactElement =>
  M.value(useStatus()).pipe(
    M.withReturnType<ReactElement>(),
    M.tagsExhaustive({
      Ready: () => <>{children}</>,
      Starting: ({ description }) => <StatusText description={description} />,
      Failed: ({ description }) => <StatusText description={description} />,
    }),
  )

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

const browserKeyPlatform = (): Interaction.KeyPlatform =>
  typeof navigator === 'undefined'
    ? 'Other'
    : Interaction.keyPlatformOf(navigator)

/**
 * One Action as a control. `props` spreads onto a DOM button:
 * `<button {...handle.props}>`, and carries the Action's hint: what a
 * press does, its keys, and why it is unavailable. React Native reads
 * `press` and `isEnabled`.
 */
export type ActionHandle = Readonly<{
  entry: Catalog.Entry
  isEnabled: boolean
  maybeBecause: Option.Option<string>
  press: () => boolean
  props: Readonly<{
    type: 'button'
    disabled: boolean
    'aria-keyshortcuts'?: string
    'data-action': string
    onClick: () => void
  }> &
    Interaction.HintAttributes
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
        ...Option.match(
          Interaction.controlHintOf(
            {
              label: entry.label,
              description: entry.what,
              keys: entry.keys,
              because: Option.getOrUndefined(maybeBecause),
            },
            browserKeyPlatform(),
            'Browser',
          ),
          { onNone: () => ({}), onSome: Interaction.hintAttributesOf },
        ),
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

// CALLS

type FieldsOf<Action> =
  Action extends Readonly<{ Type: infer Value }>
    ? Readonly<Omit<Value, '_tag'>>
    : never

type WithFieldsOf<Action> =
  Action extends Readonly<{ Type: infer Value }>
    ? keyof Omit<Value, '_tag'> extends never
      ? never
      : Action
    : never

/**
 * One Action that takes fields, as a typed control. `call` sends it with
 * its fields and answers whether it was taken; the Action's own rule
 * decides, as it does for a menu and a terminal. `check` answers what a
 * form holds, raw, with one sentence about the first wrong thing, the
 * sentence every Client gives, or None when it would be read: a wrong
 * name or kind from the declaration, and, for an Action that chooses
 * among what the Program holds, a name that matches none of it or more
 * than one. `callNamed` sends it for the one choice a person names, a
 * title or part of it. `props`
 * spreads onto the control that asks for it, such as an input: its
 * accessible name and description, the Action's hint, and `disabled`
 * with the reason while the Action is unavailable. All of it is read
 * from the Action's declaration.
 *
 * @example
 * ```tsx
 * const { seekTo } = useCalls(Player)
 * seekTo.check({ placeMs: 'soon' }) // Some('placeMs takes a number, such as …')
 * seekTo.call({ placeMs: 723_000 }) // true
 * return <input {...seekTo.props} />
 * ```
 */
export type CallHandle<Fields> = Readonly<{
  entry: Catalog.Entry
  isEnabled: boolean
  maybeBecause: Option.Option<string>
  call: (fields: Fields) => boolean
  callNamed: (typed: string) => boolean
  check: (said: Readonly<Record<string, unknown>>) => Option.Option<string>
  props: Readonly<{
    disabled: boolean
    'aria-label': string
    'data-action': string
  }> &
    Interaction.HintAttributes
}>

/**
 * Every Action of a Program's Catalog that takes fields, keyed by its tag
 * in lower camel case, each typed by its own fields.
 *
 * @example
 * ```typescript
 * type PlayerCalls = CallsOf<typeof Player>
 * // { seekTo: CallHandle<{ placeMs: Milliseconds }>; setSpeed: CallHandle<{ speed: Speed }> }
 * ```
 */
export type CallsOf<P> = {
  readonly [Action in WithFieldsOf<
    Catalog.ActionOf<Catalog.CatalogOf<P>>
  > as Uncapitalize<Action['tag']>]: CallHandle<FieldsOf<Action>>
}

const noActions: ReadonlyArray<Catalog.AnyAction> = []

const actionsWithFieldsOf = (
  program: FeatureProgram,
): ReadonlyArray<Catalog.AnyAction> =>
  Array.filter(
    'catalog' in program &&
      typeof program.catalog === 'object' &&
      program.catalog !== null &&
      'actions' in program.catalog &&
      globalThis.Array.isArray(program.catalog.actions)
      ? /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
        (program.catalog.actions as ReadonlyArray<Catalog.AnyAction>)
      : noActions,
    action => !action.isPayloadFree,
  )

/**
 * The sentence for a name that picks no one choice, for an entry whose
 * choices are the ones the Program holds; None when what was said names
 * one, or when the entry takes values of its own, such as a time.
 */
const nameProblemOf = (
  entry: Catalog.Entry,
  said: Readonly<Record<string, unknown>>,
): Option.Option<string> =>
  Option.flatMap(entry.maybeChoices, choices => {
    const typed = said[choices.field]
    if (choices.isOpen || typeof typed !== 'string') {
      return Option.none()
    } else {
      const named = Catalog.choiceNamed(entry, typed)
      return named._tag === 'NotNamed'
        ? Option.some(named.sentence)
        : Option.none()
    }
  })

const callOf =
  (bound: AnyBound, entries: ReadonlyArray<Catalog.Entry>) =>
  (
    action: Catalog.AnyAction,
  ): Option.Option<readonly [string, CallHandle<never>]> =>
    Option.map(
      Array.findFirst(entries, entry => entry.tag === action.tag),
      entry => {
        const declaration = Catalog.declarationOf(action)
        const maybeBecause =
          entry.availability._tag === 'Disabled'
            ? Option.some(entry.availability.because)
            : Option.none()
        const isEnabled = entry.availability._tag === 'Enabled'
        return [
          String.uncapitalize(action.tag),
          {
            entry,
            isEnabled,
            maybeBecause,
            call: (fields: Readonly<Record<string, unknown>>) =>
              Option.match(Catalog.tagFor(action, fields), {
                onNone: () => false,
                onSome: tag => bound.press(tag),
              }),
            callNamed: (typed: string) => {
              const named = Catalog.choiceNamed(entry, typed)
              return named._tag === 'Named' && bound.press(named.tag)
            },
            check: said => {
              const parsed = Declaration.parse(declaration, said)
              return parsed._tag === 'Refused'
                ? Option.some(parsed.sentence)
                : nameProblemOf(entry, said)
            },
            props: {
              disabled: !isEnabled,
              'aria-label': entry.title,
              ...Option.match(
                Interaction.controlHintOf(
                  {
                    label: entry.title,
                    description: entry.what,
                    why: entry.why,
                    because: Option.getOrUndefined(maybeBecause),
                  },
                  browserKeyPlatform(),
                  'Browser',
                ),
                { onNone: () => ({}), onSome: Interaction.hintAttributesOf },
              ),
              'data-action': entry.tag,
            },
          },
        ]
      },
    )

/**
 * Every Action of the bound Program that takes fields, as a typed call
 * with its check and its control's props: `calls.seekTo.call({ placeMs })`.
 * The object keeps its reference until an Action's availability changes.
 *
 * @example
 * ```tsx
 * const { setCount } = useCalls(SyncedCounter)
 * const maybeProblem = setCount.check({ count: typed })
 * return <input {...setCount.props} aria-invalid={Option.isSome(maybeProblem)} />
 * ```
 */
export const useCalls = <P extends FeatureProgram>(program: P): CallsOf<P> => {
  const bound = useBoundTo(program)
  const entries = useBoundRead(bound, bound.entries)
  return useMemo(
    () =>
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      Record.fromEntries(
        Array.getSomes(
          Array.map(actionsWithFieldsOf(program), callOf(bound, entries)),
        ),
      ) as CallsOf<P>,
    [bound, entries, program],
  )
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
        onSome: tree => (
          <>
            <ScreenStyles />
            {paintTree(tree, {
              classNames: classNames ?? {},
              onPress: (button: ButtonNode) => {
                if (button.action !== undefined) {
                  bound.press(button.action)
                }
              },
            })}
          </>
        ),
      }),
    [bound, maybeTree, classNames],
  )
}

// MENU

const rowIdOf = (tag: string): string => `fk-action-menu-${tag}`

const listId = 'fk-action-menu-list'

const revealRow = (row: HTMLLIElement | null): void => {
  if (row !== null && typeof row.scrollIntoView === 'function') {
    row.scrollIntoView({ block: 'nearest' })
  }
}

const MatchedText = ({
  runs,
}: Readonly<{ runs: ReadonlyArray<Interaction.TextRun> }>): ReactElement => (
  <>
    {Array.map(runs, (run, position) =>
      run.isMatch ? (
        <mark key={position} className="fk-action-menu-match">
          {run.text}
        </mark>
      ) : (
        <Fragment key={position}>{run.text}</Fragment>
      ),
    )}
  </>
)

const KeyCaps = ({
  keys,
}: Readonly<{ keys: ReadonlyArray<string> }>): ReactElement => (
  <>
    {Array.map(keys, key => (
      <kbd key={key} className="fk-action-menu-key">
        {key}
      </kbd>
    ))}
  </>
)

const MenuRowView = ({
  row,
  rowKeysHint,
}: Readonly<{
  row: Interaction.MenuRow
  rowKeysHint: string
}>): ReactElement => {
  const bound = useBound()
  return (
    <li
      id={rowIdOf(row.entry.tag)}
      ref={row.isHighlighted ? revealRow : undefined}
      role="option"
      aria-selected={row.isHighlighted}
      aria-disabled={row.entry.availability._tag === 'Disabled'}
      data-focused={row.isFocused}
      data-nested={row.isNested}
      data-first-unavailable={row.isFirstUnavailable}
      className="fk-action-menu-row"
      onClick={() => {
        bound.chooseFromMenu(row.entry.tag)
      }}
    >
      <span className="fk-action-menu-text">
        <span className="fk-action-menu-label">
          <MatchedText runs={row.title} />
        </span>
        <span className="fk-action-menu-what">
          <MatchedText runs={row.description} />
        </span>
        {row.entry.availability._tag === 'Disabled' ? (
          <span className="fk-action-menu-because">
            {row.entry.availability.because}
          </span>
        ) : null}
      </span>
      {Array.isReadonlyArrayNonEmpty(row.keys) ? (
        <span
          className="fk-action-menu-keys"
          aria-hidden="true"
          data-hint={rowKeysHint}
        >
          <KeyCaps keys={row.keys} />
        </span>
      ) : null}
      {Option.match(
        Option.flatMap(row.maybePick, pick =>
          Interaction.pickShortcutOf(pick, browserKeyPlatform(), 'Browser'),
        ),
        {
          onNone: () => null,
          onSome: shortcut => (
            <kbd className="fk-action-menu-pick" aria-hidden="true">
              {shortcut}
            </kbd>
          ),
        },
      )}
    </li>
  )
}

/**
 * One action menu as an accessible combo box over a dimmed backdrop: a
 * search field, a listbox of Catalog rows with the matched letters marked
 * and each row's shortcut, a live summary for screen readers, and a footer
 * of the keys that work right now beside the count of rows the search
 * kept. A row's own key is dimmed while a letter would only type. All of it, text included, comes from
 * the Program's `MenuView`, and the look is `Interaction.menuStylesheet`,
 * which it adds to the document head once. Keys are routed by
 * {@link useKeyBindings}; the input only carries typing. A navigation
 * frame paints its menu layer with it.
 *
 * @example
 * ```tsx
 * <ActionMenuPanel menu={menu} />
 * ```
 */
export const ActionMenuPanel = ({
  menu,
  className,
}: Readonly<{
  menu: Interaction.MenuView
  className?: string
}>): ReactElement => {
  const bound = useBound()
  const maybeHighlighted = Array.findFirst(menu.rows, row => row.isHighlighted)
  return (
    <div className="fk-action-menu-layer">
      <style href="foldkit-action-menu" precedence="foldkit">
        {Interaction.menuStylesheet}
      </style>
      <div
        className="fk-action-menu-backdrop"
        aria-hidden="true"
        onClick={() => {
          bound.dismissMenu()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fk-action-menu-title"
        className={
          className === undefined
            ? 'fk-action-menu'
            : `fk-action-menu ${className}`
        }
        data-style={menu.style._tag}
        data-keys-live={menu.areRowKeysLive}
      >
        <h2 id="fk-action-menu-title" className="fk-action-menu-title">
          {menu.title}
        </h2>
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={Option.match(maybeHighlighted, {
            onNone: () => undefined,
            onSome: row => rowIdOf(row.entry.tag),
          })}
          aria-label={menu.filterLabel}
          placeholder={menu.filterLabel}
          autoComplete="off"
          spellCheck={false}
          className="fk-action-menu-filter"
          value={menu.query}
          readOnly={!menu.isFilterFocused}
          autoFocus
          onChange={event => {
            bound.typeInMenu(event.currentTarget.value)
          }}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label={menu.title}
          className="fk-action-menu-rows"
        >
          {Array.map(menu.rows, row => (
            <MenuRowView
              key={row.entry.tag}
              row={row}
              rowKeysHint={menu.rowKeysHint}
            />
          ))}
        </ul>
        {Array.isReadonlyArrayEmpty(menu.rows) ? (
          <p className="fk-action-menu-empty">{menu.summary}</p>
        ) : null}
        <p className="fk-action-menu-status" role="status" aria-live="polite">
          {menu.summary}
        </p>
        <p className="fk-action-menu-footer" aria-hidden="true">
          {Array.map(menu.hints, hint => (
            <span key={hint.does} className="fk-action-menu-hint">
              <KeyCaps keys={hint.keys} />
              {hint.does}
            </span>
          ))}
          <span className="fk-action-menu-count">{menu.summary}</span>
        </p>
      </div>
    </div>
  )
}

/**
 * The bound Program's action menu while it is presented, painted as an
 * {@link ActionMenuPanel}. It renders nothing while the menu is closed.
 */
export const ActionMenuDialog = ({
  className,
}: Readonly<{ className?: string }>): ReactElement | null =>
  Option.match(useMenu(), {
    onNone: () => null,
    onSome: menu => (
      <ActionMenuPanel
        menu={menu}
        {...(className === undefined ? {} : { className })}
      />
    ),
  })

// MENU OPENER

/**
 * The bound Program's menu opener for this device, `Actions (⌘K)` on a
 * Mac and `Actions (Ctrl+K)` elsewhere, and the function that opens the
 * menu. None for a Program without a menu, and until the Program is Ready.
 *
 * @example
 * ```tsx
 * const maybeOpener = useMenuOpener()
 * ```
 */
export const useMenuOpener = (
  platform: Interaction.KeyPlatform = browserKeyPlatform(),
): Option.Option<
  Readonly<{ opener: Interaction.MenuOpener; open: () => void }>
> => {
  const bound = useBound()
  const maybeOpener = useBoundRead(bound, () => bound.menuOpener(platform))
  return useMemo(
    () =>
      Option.map(maybeOpener, opener => ({
        opener,
        open: () => {
          bound.openMenu()
        },
      })),
    [bound, maybeOpener],
  )
}

/**
 * A button that opens the bound Program's action menu, labeled from the
 * Program: `Actions (⌘K)` on a Mac. It renders nothing for a Program
 * without a menu.
 *
 * @example
 * ```tsx
 * <ActionMenuButton className="text-sm underline" />
 * ```
 */
export const ActionMenuButton = ({
  className,
  platform,
}: Readonly<{
  className?: string
  platform?: Interaction.KeyPlatform
}>): ReactElement | null =>
  Option.match(useMenuOpener(platform), {
    onNone: () => null,
    onSome: ({ opener, open }) => (
      <button
        type="button"
        className={className ?? 'fk-action-menu-opener'}
        onClick={open}
      >
        {opener.label}
      </button>
    ),
  })

// KEYS

/**
 * Routes document key presses to the bound Program: `+` sends Increment,
 * Cmd-K opens the action menu, arrows and Escape move through it. Typing
 * into a text field stays with the field. Does nothing where there is no
 * document, such as React Native.
 */
export const useKeyBindings = (): void => {
  const bound = useBound()
  useEffect(
    () =>
      Option.match(Environment.maybePage(), {
        onNone: () => undefined,
        onSome: page => Interaction.listenToDocumentKeys(bound, page.document),
      }),
    [bound],
  )
}
