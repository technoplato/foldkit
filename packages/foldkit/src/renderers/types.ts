import type { Device } from './device.js'

/** A pressable control id used when a host maps a hit to a cause. */
export type HotspotAction = Readonly<{
  readonly _tag: 'custom'
  readonly id: string
}>

/** A text run. */
export type TextNode = Readonly<{
  readonly _tag: 'Text'
  readonly content: string
  readonly mono?: boolean
  readonly dim?: boolean
  readonly width?: number
}>

/** A pressable control. The label is product data. */
export type ButtonNode = Readonly<{
  readonly _tag: 'Button'
  readonly label: string
  readonly token?: string
  readonly variant?: 'Primary' | 'Ghost' | 'Destructive'
  readonly disabled?: boolean
}>

/** A Model-bound text field. */
export type TextInputNode = Readonly<{
  readonly _tag: 'TextInput'
  readonly value: string
  readonly placeholder?: string
  readonly focused?: boolean
  readonly width?: number
  readonly token?: string
}>

/** Fixed blank rows. */
export type SpacerNode = Readonly<{
  readonly _tag: 'Spacer'
  readonly rows: number
}>

/** A horizontal stack. */
export type RowNode = Readonly<{
  readonly _tag: 'Row'
  readonly gap: number
  readonly children: ReadonlyArray<UiNode>
}>

/** A vertical stack. */
export type ColumnNode = Readonly<{
  readonly _tag: 'Column'
  readonly gap: number
  readonly children: ReadonlyArray<UiNode>
}>

/** A padded box. */
export type BoxNode = Readonly<{
  readonly _tag: 'Box'
  readonly padding: number
  readonly children: ReadonlyArray<UiNode>
}>

/** Device chrome around a product tree. The shell does not own product buttons. */
export type DeviceShellNode = Readonly<{
  readonly _tag: 'DeviceShell'
  readonly device: Device
  readonly time: string
  readonly title?: string
  readonly children: ReadonlyArray<UiNode>
}>

/** Host-neutral ASCII tree. */
export type UiNode =
  | TextNode
  | ButtonNode
  | TextInputNode
  | SpacerNode
  | RowNode
  | ColumnNode
  | BoxNode
  | DeviceShellNode

/** A laid-out character box. */
export type LayoutBox = Readonly<{
  readonly id: string
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly kind: UiNode['_tag']
  readonly device?: Device
  readonly time?: string
  readonly title?: string
  readonly text?: string
  readonly action?: HotspotAction
  readonly label?: string
  readonly children: ReadonlyArray<LayoutBox>
}>

/** A pressable region in painted ASCII. */
export type AsciiHotspot = Readonly<{
  readonly id: string
  readonly label: string
  readonly row: number
  readonly col: number
  readonly width: number
  readonly height: number
  readonly action: HotspotAction
}>

/** Painted ASCII plus optional Device chrome. */
export type AsciiFrame = Readonly<{
  readonly maybeDevice: Device | undefined
  readonly lines: ReadonlyArray<string>
  readonly hotspots: ReadonlyArray<AsciiHotspot>
}>
