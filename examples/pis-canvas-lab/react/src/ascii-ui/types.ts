/** Host-neutral atomic UI tree + layout + ASCII paint output. */

export type PressHandler = () => void
export type ChangeHandler = (value: string) => void

export type NodeKind =
  | 'vstack'
  | 'hstack'
  | 'text'
  | 'button'
  | 'textinput'
  | 'spacer'
  | 'phone'
  | 'box'

export type UiNode = {
  kind: NodeKind
  props: Record<string, unknown>
  children: UiNode[]
}

export type HotspotAction =
  | { _tag: 'add' }
  | { _tag: 'open'; counterId: string }
  | { _tag: 'inc'; counterId: string }
  | { _tag: 'dec'; counterId: string }
  | { _tag: 'reset'; counterId: string }
  | { _tag: 'back' }
  | { _tag: 'delete' }
  | { _tag: 'cancelDelete' }
  | { _tag: 'confirmDelete' }
  | { _tag: 'custom'; id: string }

export type LayoutBox = {
  id: string
  x: number
  y: number
  w: number
  h: number
  kind: NodeKind
  text?: string
  action?: HotspotAction | undefined
  label?: string
  children: LayoutBox[]
}

export type AsciiHotspot = {
  id: string
  label: string
  row: number
  col: number
  width: number
  height: number
  action: HotspotAction
}

export type AsciiFrame = {
  device: 'phone'
  lines: string[]
  hotspots: AsciiHotspot[]
}
