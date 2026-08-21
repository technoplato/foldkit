import { Array, Option } from 'effect'
import { Program } from 'foldkit'
import type { UiNode } from 'foldkit/renderers'

/** A live Program occurrence a React host can subscribe to. */
export type ProgramHandle<Model, Message> = Readonly<{
  readModel: () => Program.SyncedModel<Model, Message>
  subscribe: (listener: () => void) => () => void
  send: (message: Message) => void
  stop?: () => void | Promise<void>
}>

/**
 * Hosts augment this with one entry per Path tag so `useModel` and
 * `useActions` infer that Program's Model, Message, and Actions.
 */
export interface BoundPrograms {}

type TagOf<P> = P extends { readonly _tag: infer Tag extends string }
  ? Tag
  : string

type BoundOf<P> =
  TagOf<P> extends keyof BoundPrograms ? BoundPrograms[TagOf<P>] : never

/**
 * A Path value. Bind a Program with the same `_tag`, then pass
 * `Path()` to the hooks.
 */
export type ProgramPath<
  Model = unknown,
  Message = unknown,
  Actions = unknown,
> = Readonly<{
  readonly _tag: string
  readonly _foldkit?: {
    readonly model: Model
    readonly message: Message
    readonly actions: Actions
  }
}>

/** Model for a Path tag, from {@link BoundPrograms} or a Path brand. */
export type ModelOfPath<P> = [BoundOf<P>] extends [never]
  ? P extends { readonly _foldkit?: { readonly model: infer M } }
    ? M
    : unknown
  : BoundOf<P> extends { readonly model: infer M }
    ? M
    : unknown

/** Message for a Path tag, from {@link BoundPrograms} or a Path brand. */
export type MessageOfPath<P> = [BoundOf<P>] extends [never]
  ? P extends { readonly _foldkit?: { readonly message: infer Msg } }
    ? Msg
    : Readonly<{ _tag: string }>
  : BoundOf<P> extends { readonly message: infer Msg }
    ? Msg
    : Readonly<{ _tag: string }>

/** Actions for a Path tag, from {@link BoundPrograms} or a Path brand. */
export type ActionsOfPath<P> = [BoundOf<P>] extends [never]
  ? P extends { readonly _foldkit?: { readonly actions: infer A } }
    ? A
    : unknown
  : BoundOf<P> extends { readonly actions: infer A }
    ? A
    : unknown

/** Wires one Program to the generic React hooks. */
export type BindProgramConfig<Model, Message, Actions> = Readonly<{
  createHandle: () => ProgramHandle<Model, Message>
  createScreenHandle?: () => ProgramHandle<Model, Message>
  toActions: (
    synced: Program.SyncedModel<Model, Message>,
    send: (message: Message) => void,
  ) => Actions
  toScreen: (synced: Program.SyncedModel<Model, Message>) => UiNode
  tokenToMessage?: (token: string) => Message | undefined
  keyToMessage?: (
    input: Readonly<{
      key: string
      metaKey: boolean
      ctrlKey: boolean
    }>,
    synced: Program.SyncedModel<Model, Message>,
  ) => Message | undefined
}>

type Slot<Model, Message, Actions> = {
  readonly createHandle: () => ProgramHandle<Model, Message>
  readonly createScreenHandle: (() => ProgramHandle<Model, Message>) | undefined
  readonly toActions: BindProgramConfig<Model, Message, Actions>['toActions']
  readonly toScreen: BindProgramConfig<Model, Message, Actions>['toScreen']
  readonly tokenToMessage:
    | BindProgramConfig<Model, Message, Actions>['tokenToMessage']
    | undefined
  readonly keyToMessage:
    | BindProgramConfig<Model, Message, Actions>['keyToMessage']
    | undefined
  handle: ProgramHandle<Model, Message> | undefined
  screenHandle: ProgramHandle<Model, Message> | undefined
}

const slots = new Map<string, Slot<unknown, unknown, unknown>>()

const tagOf = (path: { readonly _tag: string }): string => path._tag

const requireSlot = (tag: string): Slot<unknown, unknown, unknown> => {
  const slot = slots.get(tag)
  if (slot === undefined) {
    throw new Error(`@foldkit/react has no Program bound for ${tag}`)
  }
  return slot
}

/** Binds a Program so {@link useModel} can find its handle by Path tag. */
export const bindProgram = <Model, Message, Actions>(
  path: ProgramPath<Model, Message, Actions> | string,
  config: BindProgramConfig<Model, Message, Actions>,
): void => {
  const tag = typeof path === 'string' ? path : path._tag
  slots.set(tag, {
    createHandle: config.createHandle as () => ProgramHandle<unknown, unknown>,
    createScreenHandle:
      config.createScreenHandle === undefined
        ? undefined
        : (config.createScreenHandle as () => ProgramHandle<unknown, unknown>),
    toActions: config.toActions as Slot<unknown, unknown, unknown>['toActions'],
    toScreen: config.toScreen as Slot<unknown, unknown, unknown>['toScreen'],
    tokenToMessage: config.tokenToMessage as
      | ((token: string) => unknown | undefined)
      | undefined,
    keyToMessage: config.keyToMessage as
      | ((
          input: Readonly<{
            key: string
            metaKey: boolean
            ctrlKey: boolean
          }>,
          synced: Program.SyncedModel<unknown, unknown>,
        ) => unknown | undefined)
      | undefined,
    handle: undefined,
    screenHandle: undefined,
  })
}

/** Installs a live handle for `useModel` and `useActions`. */
export const installProgramHandle = <Model, Message>(
  path: { readonly _tag: string },
  handle: ProgramHandle<Model, Message>,
): void => {
  requireSlot(tagOf(path)).handle = handle as ProgramHandle<unknown, unknown>
}

/** Stops and clears the `useModel` / `useActions` handle. */
export const resetProgramHandle = (path: { readonly _tag: string }): void => {
  const slot = slots.get(tagOf(path))
  if (slot === undefined || slot.handle === undefined) {
    return
  }
  void slot.handle.stop?.()
  slot.handle = undefined
}

/** Installs a live handle for `useScreen`. */
export const installScreenHandle = <Model, Message>(
  path: { readonly _tag: string },
  handle: ProgramHandle<Model, Message>,
): void => {
  requireSlot(tagOf(path)).screenHandle = handle as ProgramHandle<
    unknown,
    unknown
  >
}

/** Stops and clears the `useScreen` handle. */
export const resetScreenHandle = (path: { readonly _tag: string }): void => {
  const slot = slots.get(tagOf(path))
  if (slot === undefined || slot.screenHandle === undefined) {
    return
  }
  void slot.screenHandle.stop?.()
  slot.screenHandle = undefined
}

/** Returns the bound `useModel` handle, starting a default if none is installed. */
export const getProgramHandle = (path: {
  readonly _tag: string
}): ProgramHandle<unknown, unknown> => {
  const slot = requireSlot(tagOf(path))
  if (slot.handle !== undefined) {
    return slot.handle
  }
  const handle = slot.createHandle()
  slot.handle = handle
  return handle
}

/** Returns the bound `useScreen` handle, starting a default if none is installed. */
export const getScreenHandle = (path: {
  readonly _tag: string
}): ProgramHandle<unknown, unknown> => {
  const slot = requireSlot(tagOf(path))
  if (slot.screenHandle !== undefined) {
    return slot.screenHandle
  }
  const created =
    slot.createScreenHandle === undefined
      ? slot.createHandle()
      : slot.createScreenHandle()
  slot.screenHandle = created
  return created
}

/** Looks up the bound Program wiring for a Path tag. */
export const getBoundProgram = (path: {
  readonly _tag: string
}): Slot<unknown, unknown, unknown> => requireSlot(tagOf(path))

/** The only bound Program, when exactly one is registered. */
export const onlyBoundProgram = ():
  | Slot<unknown, unknown, unknown>
  | undefined => {
  if (slots.size !== 1) {
    return undefined
  }
  const maybe = Array.head(Array.fromIterable(slots.values()))
  if (Option.isNone(maybe)) {
    return undefined
  }
  return maybe.value
}

/** Clears every bound Program. Tests use this. */
export const resetBoundPrograms = (): void => {
  for (const slot of slots.values()) {
    if (slot.handle !== undefined) {
      void slot.handle.stop?.()
    }
    if (slot.screenHandle !== undefined) {
      void slot.screenHandle.stop?.()
    }
  }
  slots.clear()
}
