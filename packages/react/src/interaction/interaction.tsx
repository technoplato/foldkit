import { Array, Option } from 'effect'
import { type Catalog, Interaction } from 'foldkit'
import type { ButtonNode } from 'foldkit/renderers'
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
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

const useRevision = (bound: AnyBound): unknown =>
  useSyncExternalStore(bound.subscribe, bound.readModel, bound.readModel)

/**
 * The live Model of one bound Program, typed from the handle you pass.
 *
 * @example
 * ```tsx
 * const model = useModel(bound)
 * return model._tag === 'Ready' ? <p>{model.count}</p> : null
 * ```
 */
export const useModel = <Model,>(
  bound: Interaction.BoundInteraction<Model, never>,
): Model =>
  useSyncExternalStore(bound.subscribe, bound.readModel, bound.readModel)

/** Whether the bound Program accepts Actions: Ready, Starting, or Failed. */
export const useStatus = (): Interaction.Status => {
  const bound = useBound()
  useRevision(bound)
  return bound.status()
}

// ACTIONS

/**
 * One Action as a React control. `props` spreads onto any button:
 * `<button {...handle.props}>`.
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

/** Every Action of the bound Program as a control, in Catalog order. */
export const useActions = (): ReadonlyArray<ActionHandle> => {
  const bound = useBound()
  useRevision(bound)
  return Array.map(bound.entries(), handleOf(bound))
}

/** One Action by tag. None when the Program declares no such Action. */
export const useAction = (tag: string): Option.Option<ActionHandle> =>
  Array.findFirst(useActions(), handle => handle.entry.tag === tag)

/**
 * A button for one Action: its label, its disabled sentence, its keys.
 * An unknown tag is a programming error and throws.
 *
 * @example
 * ```tsx
 * <ActionButton tag="Increment" className="counter-button" />
 * ```
 */
export const ActionButton = ({
  tag,
  className,
  children,
}: Readonly<{
  tag: string
  className?: string
  children?: ReactNode
}>): ReactElement => {
  const handle = Option.getOrThrowWith(
    useAction(tag),
    () => new Error(`The bound Program declares no Action tagged ${tag}`),
  )
  return (
    <button className={className} {...handle.props}>
      {children ?? handle.entry.label}
    </button>
  )
}

/** One button per Action, in Catalog order. */
export const ActionButtons = ({
  className,
}: Readonly<{ className?: string }>): ReactElement => (
  <>
    {Array.map(useActions(), handle => (
      <button key={handle.entry.tag} className={className} {...handle.props}>
        {handle.entry.label}
      </button>
    ))}
  </>
)

// SCREEN

/**
 * Paints the bound Program's screen tree. A Button press sends its Catalog
 * Action, so the screen needs no token table.
 */
export const Screen = ({
  classNames,
}: Readonly<{ classNames?: PaintClassNames }>): ReactElement | null => {
  const bound = useBound()
  useRevision(bound)
  return Option.match(bound.screen(), {
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
  })
}

// MENU

/** The presented action menu, when one is open. */
export const useMenu = (): Option.Option<Interaction.MenuView> => {
  const bound = useBound()
  useRevision(bound)
  return bound.menu()
}

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
