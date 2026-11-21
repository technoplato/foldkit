import { Array, Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import {
  type GuardedEdge,
  define,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as Layers from './layers.js'
import {
  Device,
  type DeviceReason,
  Sampled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import * as Placement from './placement.js'
import * as PointerDrag from './pointerDrag.js'
import { type SlotOrientation, type SlotProps } from './slot.js'

// NOTE: this is the core ColorPicker Part (Widget #43 of 54, Scribe #2682).
// It composes `Placement`, `PointerDrag` (`Pace.Sampled` on live 2D area and
// channel slider drags), and `Layers` (stack-aware Escape and outside-press
// dismissal) into one framework-free Machine and Part declaration covering Zag
// color-picker semantics. Its state (`Closed` | `Open`) lives in the Model,
// synced by default (`Domain` category), with `ColorPicker.make` and
// `ColorPicker.deviceOnly()` options. Reference-stable SlotBindings (`Trigger`,
// `Content`, `Area`, `AreaThumb`, `ChannelSlider`, `Swatch`, `Input`) render
// across HTML, React, and React Native generic hosts with zero
// ColorPicker-specific painter logic.

// SCHEMAS & CONSTANTS

/** Maximum hue angle in degrees (`360`). */
export const maxHue = 360

/** Maximum percentage channel value (`100`). */
export const maxPercent = 100

/** Maximum 8-bit RGB channel value (`255`). */
export const maxRgbChannel = 255

/** Default pointer-move sync sampling window in milliseconds (`50`). */
export const defaultSampleMs: number = PointerDrag.defaultSampleMs

const hueSectorDegrees = 60
const hueSectorCount = 6
const colorRoundingPrecision = 100
const alphaRoundingPrecision = 100
const hexRadix = 16
const shortHexLength = 3
const shortHexAlphaLength = 4
const fullHexLength = 6
const fullHexAlphaLength = 8
const areaSmallStep = 1
const areaLargeStep = 10
const hueSmallStep = 1
const hueLargeStep = 10
const alphaSmallStep = 0.01
const alphaLargeStep = 0.1
const rgbChannelCount = 3
const rgbaChannelCount = 4

/** Supported string display and parsing formats for colors. */
export const ColorFormat = S.Literals(['Hex', 'Rgb', 'Hsl', 'Hsb'])
/** Supported string display and parsing formats for colors. */
export type ColorFormat = typeof ColorFormat.Type

/** Default color notation format (`'Hex'`). */
export const defaultFormat: ColorFormat = 'Hex'

/** Individual editable HSBA channel identifier. */
export const Channel = S.Literals(['Hue', 'Saturation', 'Brightness', 'Alpha'])
/** Individual editable HSBA channel identifier. */
export type Channel = typeof Channel.Type

/** Slider channel identifier for 1D channel sliders (`Hue` or `Alpha`). */
export const SliderChannel = S.Literals(['Hue', 'Alpha'])
/** Slider channel identifier for 1D channel sliders. */
export type SliderChannel = typeof SliderChannel.Type

/** Active drag target inside the open color picker. */
export const DragTarget = S.Literals(['Area', 'Hue', 'Alpha'])
/** Active drag target inside the open color picker. */
export type DragTarget = typeof DragTarget.Type

/** Keyboard target surface inside the open color picker. */
export const KeyTarget = S.Literals(['Area', 'Hue', 'Alpha', 'Popup'])
/** Keyboard target surface inside the open color picker. */
export type KeyTarget = typeof KeyTarget.Type

/** Pure HSBA color representation (`h: 0..360`, `s: 0..100`, `b: 0..100`, `a: 0..1`). */
export const HsbaColor = S.Struct({
  h: S.Number,
  s: S.Number,
  b: S.Number,
  a: S.Number,
})
/** Pure HSBA color representation. */
export type HsbaColor = typeof HsbaColor.Type

/** Pure RGBA color representation (`r: 0..255`, `g: 0..255`, `b: 0..255`, `a: 0..1`). */
export const RgbaColor = S.Struct({
  r: S.Number,
  g: S.Number,
  b: S.Number,
  a: S.Number,
})
/** Pure RGBA color representation. */
export type RgbaColor = typeof RgbaColor.Type

/** Pure HSLA color representation (`h: 0..360`, `s: 0..100`, `l: 0..100`, `a: 0..1`). */
export const HslaColor = S.Struct({
  h: S.Number,
  s: S.Number,
  l: S.Number,
  a: S.Number,
})
/** Pure HSLA color representation. */
export type HslaColor = typeof HslaColor.Type

/** Optional placement spacing overrides for the ColorPicker popup. */
export const PlacementOptions = S.Struct({
  gapPx: S.optionalKey(S.Number),
  edgePx: S.optionalKey(S.Number),
})
/** Optional placement spacing overrides. */
export type PlacementOptions = typeof PlacementOptions.Type

/**
 * Read-only props supplied to the ColorPicker chart and projection from the
 * Program's Model. Swatch presets, layer stack, placement options, and
 * disabled/readOnly flags stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  swatches: S.optionalKey(S.Array(S.String)),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isModal: S.optionalKey(S.Boolean),
  closeOnSelectSwatch: S.optionalKey(S.Boolean),
  dismissOnEscape: S.optionalKey(S.Boolean),
  dismissOnOutsidePress: S.optionalKey(S.Boolean),
  layers: S.optionalKey(Layers.Stack),
  placement: S.optionalKey(PlacementOptions),
  sampleMs: S.optionalKey(S.Number),
  label: S.optionalKey(S.String),
})
/** Read-only props supplied to the ColorPicker chart and projection. */
export type Props = typeof Props.Type

/** Default initial color: opaque black (`#000000`). */
export const defaultColor: HsbaColor = { h: 0, s: 0, b: 0, a: 1 }

// PURE COLOR CONVERSIONS

const roundTwo = (value: number): number => {
  const rounded =
    Math.round(value * colorRoundingPrecision) / colorRoundingPrecision
  return Object.is(rounded, -0) ? 0 : rounded
}

const roundAlpha = (value: number): number => {
  const clamped = PointerDrag.clampValue(value, 0, 1)
  const rounded =
    Math.round(clamped * alphaRoundingPrecision) / alphaRoundingPrecision
  return Object.is(rounded, -0) ? 0 : rounded
}

/** Clamps an {@link HsbaColor} into canonical bounds (`h: 0..360`, `s: 0..100`, `b: 0..100`, `a: 0..1`). */
export const clampHsba = (color: HsbaColor): HsbaColor => ({
  h: roundTwo(PointerDrag.clampValue(color.h, 0, maxHue)),
  s: roundTwo(PointerDrag.clampValue(color.s, 0, maxPercent)),
  b: roundTwo(PointerDrag.clampValue(color.b, 0, maxPercent)),
  a: roundAlpha(color.a),
})

/**
 * Purely converts an {@link HsbaColor} (`h: 0..360`, `s: 0..100`, `b: 0..100`, `a: 0..1`)
 * into an 8-bit {@link RgbaColor} (`r/g/b: 0..255`, `a: 0..1`).
 *
 * @example
 * ```typescript
 * hsbaToRgba({ h: 0, s: 100, b: 100, a: 1 }) // { r: 255, g: 0, b: 0, a: 1 }
 * ```
 */
export const hsbaToRgba = (hsba: HsbaColor): RgbaColor => {
  const h = ((hsba.h % maxHue) + maxHue) % maxHue
  const s = PointerDrag.clampValue(hsba.s, 0, maxPercent) / maxPercent
  const v = PointerDrag.clampValue(hsba.b, 0, maxPercent) / maxPercent
  const chroma = v * s
  const sector = h / hueSectorDegrees
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1))
  const match = v - chroma
  const sectorIndex = Math.floor(sector) % hueSectorCount

  const [redPrime, greenPrime, bluePrime]: readonly [number, number, number] =
    sectorIndex === 0
      ? [chroma, secondary, 0]
      : sectorIndex === 1
        ? [secondary, chroma, 0]
        : sectorIndex === 2
          ? [0, chroma, secondary]
          : sectorIndex === 3
            ? [0, secondary, chroma]
            : sectorIndex === 4
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]

  return {
    r: Math.round((redPrime + match) * maxRgbChannel),
    g: Math.round((greenPrime + match) * maxRgbChannel),
    b: Math.round((bluePrime + match) * maxRgbChannel),
    a: roundAlpha(hsba.a),
  }
}

/**
 * Purely converts an 8-bit {@link RgbaColor} into an {@link HsbaColor}
 * (`h: 0..360`, `s: 0..100`, `b: 0..100`, `a: 0..1`).
 *
 * @example
 * ```typescript
 * rgbaToHsba({ r: 0, g: 255, b: 0, a: 1 }) // { h: 120, s: 100, b: 100, a: 1 }
 * ```
 */
export const rgbaToHsba = (rgba: RgbaColor): HsbaColor => {
  const r = PointerDrag.clampValue(rgba.r, 0, maxRgbChannel) / maxRgbChannel
  const g = PointerDrag.clampValue(rgba.g, 0, maxRgbChannel) / maxRgbChannel
  const b = PointerDrag.clampValue(rgba.b, 0, maxRgbChannel) / maxRgbChannel
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  const rawHue =
    delta === 0
      ? 0
      : max === r
        ? hueSectorDegrees * (((g - b) / delta) % hueSectorCount)
        : max === g
          ? hueSectorDegrees * ((b - r) / delta + 2)
          : hueSectorDegrees * ((r - g) / delta + 4)

  const h = ((rawHue % maxHue) + maxHue) % maxHue
  const s = max === 0 ? 0 : (delta / max) * maxPercent
  const brightness = max * maxPercent

  return {
    h: roundTwo(h),
    s: roundTwo(s),
    b: roundTwo(brightness),
    a: roundAlpha(rgba.a),
  }
}

/** Purely converts an {@link HsbaColor} into an {@link HslaColor}. */
export const hsbaToHsla = (hsba: HsbaColor): HslaColor => {
  const s = PointerDrag.clampValue(hsba.s, 0, maxPercent) / maxPercent
  const v = PointerDrag.clampValue(hsba.b, 0, maxPercent) / maxPercent
  const l = v * (1 - s / 2)
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l)
  return {
    h: roundTwo(((hsba.h % maxHue) + maxHue) % maxHue),
    s: roundTwo(sl * maxPercent),
    l: roundTwo(l * maxPercent),
    a: roundAlpha(hsba.a),
  }
}

/** Purely converts an {@link HslaColor} into an {@link HsbaColor}. */
export const hslaToHsba = (hsla: HslaColor): HsbaColor => {
  const sl = PointerDrag.clampValue(hsla.s, 0, maxPercent) / maxPercent
  const l = PointerDrag.clampValue(hsla.l, 0, maxPercent) / maxPercent
  const v = l + sl * Math.min(l, 1 - l)
  const sb = v === 0 ? 0 : 2 * (1 - l / v)
  return {
    h: roundTwo(((hsla.h % maxHue) + maxHue) % maxHue),
    s: roundTwo(sb * maxPercent),
    b: roundTwo(v * maxPercent),
    a: roundAlpha(hsla.a),
  }
}

const toHexByte = (value: number): string =>
  Math.round(PointerDrag.clampValue(value, 0, maxRgbChannel))
    .toString(hexRadix)
    .padStart(2, '0')

/**
 * Purely formats an {@link RgbaColor} as `#rrggbb` (when opaque and
 * `includeAlpha` is not `true`) or `#rrggbbaa`.
 *
 * @example
 * ```typescript
 * rgbaToHex({ r: 255, g: 0, b: 128, a: 1 }) // '#ff0080'
 * rgbaToHex({ r: 255, g: 0, b: 128, a: 0.5 }) // '#ff008080'
 * ```
 */
export const rgbaToHex = (
  rgba: RgbaColor,
  includeAlpha: boolean = false,
): string => {
  const alpha = roundAlpha(rgba.a)
  const rgbHex = `#${toHexByte(rgba.r)}${toHexByte(rgba.g)}${toHexByte(rgba.b)}`
  return includeAlpha || alpha < 1
    ? `${rgbHex}${toHexByte(alpha * maxRgbChannel)}`
    : rgbHex
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu

const expandShortHex = (digits: string): string =>
  Array.join(
    Array.map(digits.split(''), ch => `${ch}${ch}`),
    '',
  )

/**
 * Purely parses `#rgb`, `#rgba`, `#rrggbb`, or `#rrggbbaa` (with or without
 * leading `#`) into an {@link RgbaColor}, or `Option.none()` when invalid.
 *
 * @example
 * ```typescript
 * hexToRgba('#f00') // Option.some({ r: 255, g: 0, b: 0, a: 1 })
 * hexToRgba('#33669980') // Option.some({ r: 51, g: 102, b: 153, a: 0.5 })
 * hexToRgba('invalid') // Option.none()
 * ```
 */
export const hexToRgba = (hex: string): Option.Option<RgbaColor> => {
  const match = HEX_PATTERN.exec(hex.trim())
  if (match === null) {
    return Option.none()
  }
  const [, raw] = match
  if (raw === undefined) {
    return Option.none()
  }
  const expanded =
    raw.length === shortHexLength || raw.length === shortHexAlphaLength
      ? expandShortHex(raw)
      : raw
  if (
    expanded.length !== fullHexLength &&
    expanded.length !== fullHexAlphaLength
  ) {
    return Option.none()
  }
  const r = Number.parseInt(expanded.slice(0, 2), hexRadix)
  const g = Number.parseInt(expanded.slice(2, 4), hexRadix)
  const b = Number.parseInt(expanded.slice(4, 6), hexRadix)
  const a =
    expanded.length === fullHexAlphaLength
      ? roundAlpha(
          Number.parseInt(expanded.slice(6, 8), hexRadix) / maxRgbChannel,
        )
      : 1
  return Option.some({ r, g, b, a })
}

/**
 * Purely formats an {@link HsbaColor} in the chosen {@link ColorFormat}
 * (`'Hex'`, `'Rgb'`, `'Hsl'`, or `'Hsb'`).
 *
 * @example
 * ```typescript
 * formatColor({ h: 0, s: 100, b: 100, a: 1 }, 'Hex') // '#ff0000'
 * formatColor({ h: 0, s: 100, b: 100, a: 1 }, 'Rgb') // 'rgb(255, 0, 0)'
 * formatColor({ h: 0, s: 100, b: 100, a: 0.5 }, 'Hsl') // 'hsla(0, 100%, 50%, 0.5)'
 * formatColor({ h: 0, s: 100, b: 100, a: 1 }, 'Hsb') // 'hsb(0, 100%, 100%)'
 * ```
 */
export const formatColor = (
  color: HsbaColor,
  format: ColorFormat = defaultFormat,
): string => {
  const clamped = clampHsba(color)
  return M.value(format).pipe(
    M.withReturnType<string>(),
    M.when('Hex', () => rgbaToHex(hsbaToRgba(clamped))),
    M.when('Rgb', () => {
      const rgba = hsbaToRgba(clamped)
      return rgba.a < 1
        ? `rgba(${rgba.r.toString()}, ${rgba.g.toString()}, ${rgba.b.toString()}, ${rgba.a.toString()})`
        : `rgb(${rgba.r.toString()}, ${rgba.g.toString()}, ${rgba.b.toString()})`
    }),
    M.when('Hsl', () => {
      const hsla = hsbaToHsla(clamped)
      const h = Math.round(hsla.h)
      const s = Math.round(hsla.s)
      const l = Math.round(hsla.l)
      return hsla.a < 1
        ? `hsla(${h.toString()}, ${s.toString()}%, ${l.toString()}%, ${hsla.a.toString()})`
        : `hsl(${h.toString()}, ${s.toString()}%, ${l.toString()}%)`
    }),
    M.when('Hsb', () => {
      const h = Math.round(clamped.h)
      const s = Math.round(clamped.s)
      const b = Math.round(clamped.b)
      return clamped.a < 1
        ? `hsba(${h.toString()}, ${s.toString()}%, ${b.toString()}%, ${clamped.a.toString()})`
        : `hsb(${h.toString()}, ${s.toString()}%, ${b.toString()}%)`
    }),
    M.exhaustive,
  )
}

const FUNCTIONAL_COLOR_PATTERN = /^(rgba?|hsla?|hsba?)\(\s*([^)]+?)\s*\)$/iu

const parseNumberToken = (
  token: string,
  allowPercent: boolean,
): Option.Option<number> => {
  const trimmed = token.trim()
  if (trimmed.endsWith('%')) {
    if (!allowPercent) {
      return Option.none()
    }
    const parsed = Number(trimmed.slice(0, -1))
    return Number.isFinite(parsed) ? Option.some(parsed) : Option.none()
  } else {
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? Option.some(parsed) : Option.none()
  }
}

const parseAlphaToken = (token: string): Option.Option<number> => {
  const trimmed = token.trim()
  if (trimmed.endsWith('%')) {
    const parsed = Number(trimmed.slice(0, -1))
    return Number.isFinite(parsed)
      ? Option.some(roundAlpha(parsed / maxPercent))
      : Option.none()
  } else {
    const parsed = Number(trimmed)
    return Number.isFinite(parsed)
      ? Option.some(roundAlpha(parsed))
      : Option.none()
  }
}

const parseFunctionalColor = (text: string): Option.Option<HsbaColor> => {
  const match = FUNCTIONAL_COLOR_PATTERN.exec(text)
  if (match === null) {
    return Option.none()
  }
  const [, fnNameRaw, body] = match
  const fnName = fnNameRaw?.toLowerCase()
  if (fnName === undefined || body === undefined) {
    return Option.none()
  }
  const tokens = Array.filter(
    body.replace(/\//gu, ' ').split(/[\s,]+/u),
    token => token !== '',
  )
  if (tokens.length !== rgbChannelCount && tokens.length !== rgbaChannelCount) {
    return Option.none()
  }
  const maybeFirst = Array.get(tokens, 0)
  const maybeSecond = Array.get(tokens, 1)
  const maybeThird = Array.get(tokens, 2)
  const maybeFourth = Array.get(tokens, 3)

  if (
    Option.isNone(maybeFirst) ||
    Option.isNone(maybeSecond) ||
    Option.isNone(maybeThird)
  ) {
    return Option.none()
  }

  const maybeAlpha = Option.match(maybeFourth, {
    onNone: () => Option.some(1),
    onSome: parseAlphaToken,
  })
  if (Option.isNone(maybeAlpha)) {
    return Option.none()
  }

  if (fnName === 'rgb' || fnName === 'rgba') {
    return Option.map(
      Option.all([
        parseNumberToken(maybeFirst.value, false),
        parseNumberToken(maybeSecond.value, false),
        parseNumberToken(maybeThird.value, false),
      ]),
      ([r, g, b]) =>
        rgbaToHsba({
          r: PointerDrag.clampValue(r, 0, maxRgbChannel),
          g: PointerDrag.clampValue(g, 0, maxRgbChannel),
          b: PointerDrag.clampValue(b, 0, maxRgbChannel),
          a: maybeAlpha.value,
        }),
    )
  } else if (fnName === 'hsl' || fnName === 'hsla') {
    return Option.map(
      Option.all([
        parseNumberToken(maybeFirst.value, false),
        parseNumberToken(maybeSecond.value, true),
        parseNumberToken(maybeThird.value, true),
      ]),
      ([h, s, l]) =>
        hslaToHsba({
          h,
          s: PointerDrag.clampValue(s, 0, maxPercent),
          l: PointerDrag.clampValue(l, 0, maxPercent),
          a: maybeAlpha.value,
        }),
    )
  } else if (fnName === 'hsb' || fnName === 'hsba') {
    return Option.map(
      Option.all([
        parseNumberToken(maybeFirst.value, false),
        parseNumberToken(maybeSecond.value, true),
        parseNumberToken(maybeThird.value, true),
      ]),
      ([h, s, b]) =>
        clampHsba({
          h,
          s,
          b,
          a: maybeAlpha.value,
        }),
    )
  } else {
    return Option.none()
  }
}

/**
 * Purely parses a color string in Hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`),
 * RGB/RGBA, HSL/HSLA, or HSB/HSBA syntax into an {@link HsbaColor}, or
 * `Option.none()` when invalid.
 *
 * @example
 * ```typescript
 * parseColor('#00ff00') // Option.some({ h: 120, s: 100, b: 100, a: 1 })
 * parseColor('rgb(0, 0, 255)') // Option.some({ h: 240, s: 100, b: 100, a: 1 })
 * parseColor('hsb(180, 50%, 80%)') // Option.some({ h: 180, s: 50, b: 80, a: 1 })
 * ```
 */
export const parseColor = (text: string): Option.Option<HsbaColor> => {
  const trimmed = text.trim()
  if (trimmed === '') {
    return Option.none()
  }
  return Option.orElse(Option.map(hexToRgba(trimmed), rgbaToHsba), () =>
    parseFunctionalColor(trimmed),
  )
}

/** True when two {@link HsbaColor} values represent the same RGBA color. */
export const isSameColor = (left: HsbaColor, right: HsbaColor): boolean => {
  const leftRgba = hsbaToRgba(left)
  const rightRgba = hsbaToRgba(right)
  return (
    leftRgba.r === rightRgba.r &&
    leftRgba.g === rightRgba.g &&
    leftRgba.b === rightRgba.b &&
    leftRgba.a === rightRgba.a
  )
}

// STATE

/** The color picker popup is closed, holding the current `color`, display `format`, and any input draft. */
export const Closed = ts('Closed', {
  color: HsbaColor,
  format: ColorFormat,
  maybeInputDraft: S.Option(S.String),
})
/** The color picker popup is closed. */
export type Closed = typeof Closed.Type

/**
 * The color picker popup is open, tracking the current `color`, display
 * `format`, optional text draft, active drag target, pre-drag `originColor`,
 * and embedded `PointerDrag.State`.
 */
export const Open = ts('Open', {
  color: HsbaColor,
  format: ColorFormat,
  maybeInputDraft: S.Option(S.String),
  maybeDragTarget: S.Option(DragTarget),
  maybeOriginColor: S.Option(HsbaColor),
  drag: PointerDrag.State,
})
/** The color picker popup is open. */
export type Open = typeof Open.Type

/** Where a ColorPicker Part stands: `Closed` or `Open`. Lives in the Model. */
export const State = S.Union([Closed, Open])
/** Where a ColorPicker Part stands. */
export type State = typeof State.Type

/** Initial ColorPicker state: closed, opaque black, `'Hex'` format. */
export const initial: State = Closed({
  color: defaultColor,
  format: defaultFormat,
  maybeInputDraft: Option.none(),
})

/** Creates an initial closed ColorPicker state with `color` and optional `format`. */
export const initialColor = (
  color: HsbaColor,
  format: ColorFormat = defaultFormat,
): State =>
  Closed({
    color: clampHsba(color),
    format,
    maybeInputDraft: Option.none(),
  })

// ACTIONS

/** Opens the color picker popup. */
export const OpenColorPicker = Catalog.action('OpenColorPicker', {
  what: 'Opens the color picker popup',
  why: 'To inspect and choose a new color',
  meta: { label: 'Open color picker', keys: [] },
})

/** Closes the color picker popup unconditionally. */
export const CloseColorPicker = Catalog.action('CloseColorPicker', {
  what: 'Closes the color picker popup',
  why: 'To return to the surrounding view',
  meta: { label: 'Close color picker', keys: [] },
})

/** Toggles the color picker popup between open and closed. */
export const ToggleColorPicker = Catalog.action('ToggleColorPicker', {
  what: 'Opens the color picker popup or closes it when open',
  why: 'To show or hide color controls on demand',
  meta: { label: 'Toggle color picker', keys: [] },
})

/** Dismisses the open color picker when allowed by the active layer stack. */
export const DismissColorPicker = Catalog.action('DismissColorPicker', {
  what: 'Dismisses the open color picker when permitted by layers',
  why: 'To leave color selection without extra steps',
  meta: { label: 'Dismiss color picker', keys: [] },
})

/** Sets the active color directly to the given HSBA components. */
export const SetColor = Catalog.action('SetColor', {
  fields: { color: HsbaColor },
  what: 'Sets the active color to the given HSBA components',
  why: 'To apply an exact hue, saturation, brightness, and opacity',
  meta: { label: 'Set color', keys: [] },
})

/** Selects a preset color swatch by its color string (for example `'#ff5500'`). */
export const SelectSwatch = Catalog.action('SelectSwatch', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'swatch',
    prompt: 'Select which color swatch?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No swatch is available',
  },
  what: 'Selects a preset color swatch',
  why: 'To apply a predefined palette shade quickly',
  meta: { label: 'Select swatch', keys: [] },
})

/** Switches the color notation format (`Hex`, `Rgb`, `Hsl`, or `Hsb`). */
export const SetColorFormat = Catalog.action('SetColorFormat', {
  fields: { format: ColorFormat },
  choose: {
    field: 'format',
    noun: 'format',
    prompt: 'Display colors in which format?',
    token: ColorFormat,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Choose a color format',
  },
  what: 'Changes the active color notation format',
  why: 'To inspect or enter values in hex, RGB, HSL, or HSB',
  meta: { label: 'Set format', keys: [] },
})

/** Sets one HSBA channel (`Hue`, `Saturation`, `Brightness`, or `Alpha`) to `value`. */
export const SetChannelValue = Catalog.action('SetChannelValue', {
  fields: {
    channel: Channel,
    value: S.Number,
  },
  what: 'Updates one color channel to a specific numeric value',
  why: 'To fine-tune hue, saturation, brightness, or opacity individually',
  meta: { label: 'Set channel', keys: [] },
})

/** Parses and applies the current text draft as the active color (reverting draft when invalid). */
export const CommitColorInput = Catalog.action('CommitColorInput', {
  what: 'Parses and applies the current text draft as the active color',
  why: 'To confirm a typed color notation',
  meta: { label: 'Commit color input', keys: [] },
})

/** The Catalog Actions a ColorPicker Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  OpenColorPicker,
  CloseColorPicker,
  ToggleColorPicker,
  DismissColorPicker,
  SetColor,
  SelectSwatch,
  SetColorFormat,
  SetChannelValue,
  CommitColorInput,
]

// MESSAGES

/** A pointer went down on the 2D saturation-brightness color area. */
export const BeginAreaDrag = m('BeginAreaDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  saturation: S.Number,
  brightness: S.Number,
})

/** The active 2D area drag pointer moved. Synced via `Pace.Sampled`. */
export const MoveAreaDrag = m('MoveAreaDrag', {
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  saturation: S.Number,
  brightness: S.Number,
})

/** A pointer went down on the `Hue` or `Alpha` channel slider. */
export const BeginChannelDrag = m('BeginChannelDrag', {
  channel: SliderChannel,
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  value: S.Number,
})

/** The active `Hue` or `Alpha` channel drag pointer moved. Synced via `Pace.Sampled`. */
export const MoveChannelDrag = m('MoveChannelDrag', {
  channel: SliderChannel,
  pointerId: S.Number,
  x: S.Number,
  y: S.Number,
  value: S.Number,
})

/** The active area or channel slider drag ended, committing the live color. */
export const EndColorDrag = m('EndColorDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** The active area or channel slider drag was cancelled, restoring pre-drag `originColor`. */
export const CancelColorDrag = m('CancelColorDrag', {
  pointerId: S.optionalKey(S.Number),
})

/** The user edited the color text input draft. */
export const ChangedColorInput = m('ChangedColorInput', {
  value: S.String,
})

/** A pointer press landed outside the layers listed in `insideIds`. */
export const PressedOutsideColorPicker = m('PressedOutsideColorPicker', {
  insideIds: S.Array(S.String),
})

/** A keyboard key was pressed on the color area, a channel slider, or the open popup. */
export const PressedColorPickerKey = m('PressedColorPickerKey', {
  key: S.String,
  target: S.optionalKey(KeyTarget),
  isShift: S.optionalKey(S.Boolean),
})

/** Every Message the ColorPicker chart handles. */
export const Message = S.Union([
  OpenColorPicker,
  CloseColorPicker,
  ToggleColorPicker,
  DismissColorPicker,
  SetColor,
  SelectSwatch,
  SetColorFormat,
  SetChannelValue,
  CommitColorInput,
  BeginAreaDrag,
  MoveAreaDrag,
  BeginChannelDrag,
  MoveChannelDrag,
  EndColorDrag,
  CancelColorDrag,
  ChangedColorInput,
  PressedOutsideColorPicker,
  PressedColorPickerKey,
])
/** Every Message the ColorPicker chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the ColorPicker Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the color picker trigger button element id from a base `id`. */
export const triggerId = (id: string): string => `${id}-trigger`

/** Derives the color picker popup content element id from a base `id`. */
export const contentId = (id: string): string => `${id}-content`

/** Derives the 2D saturation-brightness area element id from a base `id`. */
export const areaId = (id: string): string => `${id}-area`

/** Derives the 2D area thumb element id from a base `id`. */
export const areaThumbId = (id: string): string => `${id}-area-thumb`

/** Derives a channel slider element id from a base `id` and `channel`. */
export const channelSliderId = (id: string, channel: SliderChannel): string =>
  `${id}-channel-${channel.toLowerCase()}`

/** Derives a swatch button element id from a base `id` and normalized swatch token. */
export const swatchId = (id: string, swatch: string): string =>
  `${id}-swatch-${swatch.replace(/[^a-zA-Z0-9_-]/gu, '')}`

/** Derives the color text input element id from a base `id`. */
export const inputId = (id: string): string => `${id}-input`

// PURE CONFIGURATION READERS, PLACEMENT, LAYERS & GEOMETRY

/** True when the color picker is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the color picker is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when the color picker popup is modal (`false` by default). */
export const isModalOf = (props: Pick<Props, 'isModal'> = {}): boolean =>
  props.isModal === true

/** True when selecting a swatch automatically closes the popup (`false` by default). */
export const closeOnSelectSwatchOf = (
  props: Pick<Props, 'closeOnSelectSwatch'> = {},
): boolean => props.closeOnSelectSwatch === true

/** True when pressing Escape dismisses the popup (`true` by default). */
export const dismissesOnEscapeOf = (
  props: Pick<Props, 'dismissOnEscape'> = {},
): boolean => props.dismissOnEscape ?? true

/** True when pressing outside dismisses the popup (`true` by default). */
export const dismissesOnOutsidePressOf = (
  props: Pick<Props, 'dismissOnOutsidePress'> = {},
): boolean => props.dismissOnOutsidePress ?? true

/** True when color edits are allowed (neither disabled nor read-only). */
export const canEdit = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/** Builds the {@link Layers.Layer} entry representing this ColorPicker popup. */
export const layerOf = (
  props: Pick<
    Props,
    'id' | 'isModal' | 'dismissOnEscape' | 'dismissOnOutsidePress'
  >,
): Layers.Layer =>
  Layers.layer(props.id, {
    isModal: isModalOf(props),
    dismissesOnEscape: dismissesOnEscapeOf(props),
    dismissesOnOutsidePress: dismissesOnOutsidePressOf(props),
  })

/** The active dismissable layer stack containing this ColorPicker popup. */
export const layersOf = (props: Props): Layers.Stack =>
  props.layers ?? [layerOf(props)]

/**
 * Places a ColorPicker popup panel by its trigger anchor using
 * `Placement.place`, applying any `gapPx` and `edgePx` configured in
 * `props.placement`.
 *
 * @example
 * ```typescript
 * placeFor(props, { anchor, size, view }) // { left, top, side }
 * ```
 */
export const placeFor = (
  props: Pick<Props, 'placement'>,
  geometry: Readonly<{
    anchor: Placement.Rect
    size: Placement.Size
    view: Placement.Size
  }>,
): Placement.Placed =>
  Placement.place({
    ...geometry,
    ...(props.placement?.gapPx === undefined
      ? {}
      : { gapPx: props.placement.gapPx }),
    ...(props.placement?.edgePx === undefined
      ? {}
      : { edgePx: props.placement.edgePx }),
  })

/**
 * Purely maps a 2D pointer `point` inside a measured color area `rect` into
 * `{ saturation: 0..100, brightness: 0..100 }` (x runs left-to-right for
 * saturation; y runs bottom-to-top for brightness).
 */
export const areaFromPoint = (
  point: PointerDrag.Point,
  rect: PointerDrag.Rect,
): Readonly<{ saturation: number; brightness: number }> => {
  const fractions = PointerDrag.fractionsFromPoint(point, rect, {
    isInvertedY: true,
  })
  return {
    saturation: roundTwo(fractions.x * maxPercent),
    brightness: roundTwo(fractions.y * maxPercent),
  }
}

/**
 * Purely maps a pointer `point` inside a channel slider `rect` into a
 * `Hue` (`0..360`) or `Alpha` (`0..1`) value.
 */
export const channelValueFromPoint = (
  channel: SliderChannel,
  point: PointerDrag.Point,
  rect: PointerDrag.Rect,
  orientation: SlotOrientation = 'Horizontal',
): number => {
  const fraction = PointerDrag.fractionFromPoint(point, rect, {
    axis: orientation,
    isInverted: orientation === 'Vertical',
  })
  return M.value(channel).pipe(
    M.withReturnType<number>(),
    M.when('Hue', () => roundTwo(fraction * maxHue)),
    M.when('Alpha', () => roundAlpha(fraction)),
    M.exhaustive,
  )
}

/** Updates one HSBA `channel` on `color`, clamping into canonical range. */
export const withChannelValue = (
  color: HsbaColor,
  channel: Channel,
  value: number,
): HsbaColor =>
  M.value(channel).pipe(
    M.withReturnType<HsbaColor>(),
    M.when('Hue', () => clampHsba({ ...color, h: value })),
    M.when('Saturation', () => clampHsba({ ...color, s: value })),
    M.when('Brightness', () => clampHsba({ ...color, b: value })),
    M.when('Alpha', () => clampHsba({ ...color, a: value })),
    M.exhaustive,
  )

// READINGS

/** True when the color picker popup is open. */
export const isOpen = (state: State): boolean => state._tag === 'Open'

/** True when the color picker popup is closed. */
export const isClosed = (state: State): boolean => state._tag === 'Closed'

/** True when the popup is open and an area or channel slider drag is active. */
export const isDragging = (state: State): boolean =>
  state._tag === 'Open' && PointerDrag.isDragging(state.drag)

/** Current active {@link HsbaColor}. */
export const colorOf = (state: State): HsbaColor => state.color

/** Current display {@link ColorFormat}. */
export const formatOf = (state: State): ColorFormat => state.format

/** Formatted string of the active color in the current format. */
export const formattedValueOf = (state: State): string =>
  formatColor(state.color, state.format)

/** Displayed text value for the `Input` slot (live draft while typing, else formatted color). */
export const inputValueOf = (state: State): string =>
  Option.getOrElse(state.maybeInputDraft, () => formattedValueOf(state))

/** True when `state` holds a non-empty input draft that does not parse to a valid color. */
export const isInputInvalid = (state: State): boolean =>
  Option.exists(
    state.maybeInputDraft,
    draft => draft.trim() !== '' && Option.isNone(parseColor(draft)),
  )

/** True when `swatch` parses to the same color as `state.color`. */
export const isSwatchSelected = (state: State, swatch: string): boolean =>
  Option.exists(parseColor(swatch), parsed => isSameColor(state.color, parsed))

/** True when pointer interaction outside the ColorPicker layer stack is blocked. */
export const isOutsidePointerBlocked = (state: State, props: Props): boolean =>
  isOpen(state) && Layers.isOutsidePointerBlocked(layersOf(props))

// INTERNAL CHART HELPERS

const openFrom = (state: Closed): Open =>
  Open({
    color: state.color,
    format: state.format,
    maybeInputDraft: state.maybeInputDraft,
    maybeDragTarget: Option.none(),
    maybeOriginColor: Option.none(),
    drag: PointerDrag.Idle(),
  })

const closedFrom = (
  state: State,
  color: HsbaColor = state.color,
  format: ColorFormat = state.format,
  maybeInputDraft: Option.Option<string> = state.maybeInputDraft,
): Closed =>
  Closed({
    color,
    format,
    maybeInputDraft,
  })

const dragPropsOf = (props: Props, target: DragTarget): PointerDrag.Props => ({
  axis: target === 'Area' ? 'Both' : 'Horizontal',
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.isReadOnly === undefined ? {} : { isReadOnly: props.isReadOnly }),
  ...(props.sampleMs === undefined ? {} : { sampleMs: props.sampleMs }),
})

const startDragOn = (
  state: Open,
  target: DragTarget,
  pointerId: number,
  x: number,
  y: number,
  nextColor: HsbaColor,
  context: Props,
): Open => {
  const originValue =
    target === 'Hue'
      ? state.color.h
      : target === 'Alpha'
        ? state.color.a
        : state.color.s
  const [nextDrag] = PointerDrag.chart.transition(
    PointerDrag.Idle(),
    PointerDrag.StartDrag({ pointerId, x, y, originValue }),
    dragPropsOf(context, target),
  )
  return Open({
    color: nextColor,
    format: state.format,
    maybeInputDraft: Option.none(),
    maybeDragTarget: Option.some(target),
    maybeOriginColor: Option.some(state.color),
    drag: nextDrag,
  })
}

const resolveChannelOrAreaKey = (
  color: HsbaColor,
  key: string,
  target: KeyTarget,
  isShift: boolean,
): Option.Option<HsbaColor> => {
  if (target === 'Area') {
    const step = isShift ? areaLargeStep : areaSmallStep
    if (key === 'ArrowLeft') {
      return Option.some(withChannelValue(color, 'Saturation', color.s - step))
    } else if (key === 'ArrowRight') {
      return Option.some(withChannelValue(color, 'Saturation', color.s + step))
    } else if (key === 'ArrowUp') {
      return Option.some(withChannelValue(color, 'Brightness', color.b + step))
    } else if (key === 'ArrowDown') {
      return Option.some(withChannelValue(color, 'Brightness', color.b - step))
    } else if (key === 'PageUp') {
      return Option.some(
        withChannelValue(color, 'Brightness', color.b + areaLargeStep),
      )
    } else if (key === 'PageDown') {
      return Option.some(
        withChannelValue(color, 'Brightness', color.b - areaLargeStep),
      )
    } else {
      return Option.none()
    }
  } else if (target === 'Hue') {
    const step = isShift ? hueLargeStep : hueSmallStep
    if (key === 'Home') {
      return Option.some(withChannelValue(color, 'Hue', 0))
    } else if (key === 'End') {
      return Option.some(withChannelValue(color, 'Hue', maxHue))
    } else if (key === 'PageUp') {
      return Option.some(withChannelValue(color, 'Hue', color.h + hueLargeStep))
    } else if (key === 'PageDown') {
      return Option.some(withChannelValue(color, 'Hue', color.h - hueLargeStep))
    } else if (key === 'ArrowRight' || key === 'ArrowUp') {
      return Option.some(withChannelValue(color, 'Hue', color.h + step))
    } else if (key === 'ArrowLeft' || key === 'ArrowDown') {
      return Option.some(withChannelValue(color, 'Hue', color.h - step))
    } else {
      return Option.none()
    }
  } else if (target === 'Alpha') {
    const step = isShift ? alphaLargeStep : alphaSmallStep
    if (key === 'Home') {
      return Option.some(withChannelValue(color, 'Alpha', 0))
    } else if (key === 'End') {
      return Option.some(withChannelValue(color, 'Alpha', 1))
    } else if (key === 'PageUp') {
      return Option.some(
        withChannelValue(color, 'Alpha', color.a + alphaLargeStep),
      )
    } else if (key === 'PageDown') {
      return Option.some(
        withChannelValue(color, 'Alpha', color.a - alphaLargeStep),
      )
    } else if (key === 'ArrowRight' || key === 'ArrowUp') {
      return Option.some(withChannelValue(color, 'Alpha', color.a + step))
    } else if (key === 'ArrowLeft' || key === 'ArrowDown') {
      return Option.some(withChannelValue(color, 'Alpha', color.a - step))
    } else {
      return Option.none()
    }
  } else {
    return Option.none()
  }
}

const canEditGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => canEdit(context)

const commitInputOn = (
  state: State,
): Readonly<{
  color: HsbaColor
  maybeInputDraft: Option.Option<string>
}> =>
  Option.match(state.maybeInputDraft, {
    onNone: () => ({ color: state.color, maybeInputDraft: Option.none() }),
    onSome: draft =>
      Option.match(parseColor(draft), {
        onNone: () => ({ color: state.color, maybeInputDraft: Option.none() }),
        onSome: parsed => ({ color: parsed, maybeInputDraft: Option.none() }),
      }),
  })

const closedSelectSwatchEdges = (): ReadonlyArray<
  GuardedEdge<State, Message, Closed, typeof SelectSwatch.Type, never, Props>
> => [
  when(
    (_state, message, context) =>
      canEdit(context) ? parseColor(message.value) : Option.none(),
    'Closed',
    ({ state, guardValue }) =>
      Closed({
        ...state,
        color: guardValue,
        maybeInputDraft: Option.none(),
      }),
  ),
  ignore(),
]

// CHART

/**
 * Builds the ColorPicker Machine chart starting in `initialState`: composes
 * `Layers` for stack-aware Escape and outside-press dismissal, `PointerDrag`
 * for 2D saturation-brightness area and Hue/Alpha slider dragging with Escape
 * rollback, preset swatch selection, format switching, and text input parsing.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Closed: {
        on: {
          OpenColorPicker: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Open',
              ({ state }) => openFrom(state),
            ),
            ignore(),
          ],
          CloseColorPicker: [ignore()],
          ToggleColorPicker: [
            when(
              (_state, _message, context) => !isDisabledOf(context),
              'Open',
              ({ state }) => openFrom(state),
            ),
            ignore(),
          ],
          DismissColorPicker: [ignore()],
          SetColor: [
            when(canEditGuard, 'Closed', ({ state, message }) =>
              Closed({
                ...state,
                color: clampHsba(message.color),
                maybeInputDraft: Option.none(),
              }),
            ),
            ignore(),
          ],
          SelectSwatch: closedSelectSwatchEdges(),
          SetColorFormat: to('Closed', ({ state, message }) =>
            Closed({
              ...state,
              format: message.format,
              maybeInputDraft: Option.none(),
            }),
          ),
          SetChannelValue: [
            when(canEditGuard, 'Closed', ({ state, message }) =>
              Closed({
                ...state,
                color: withChannelValue(
                  state.color,
                  message.channel,
                  message.value,
                ),
                maybeInputDraft: Option.none(),
              }),
            ),
            ignore(),
          ],
          CommitColorInput: [
            when(canEditGuard, 'Closed', ({ state }) => {
              const committed = commitInputOn(state)
              return Closed({
                ...state,
                color: committed.color,
                maybeInputDraft: committed.maybeInputDraft,
              })
            }),
            ignore(),
          ],
          BeginAreaDrag: [ignore()],
          MoveAreaDrag: [ignore()],
          BeginChannelDrag: [ignore()],
          MoveChannelDrag: [ignore()],
          EndColorDrag: [ignore()],
          CancelColorDrag: [ignore()],
          ChangedColorInput: [
            when(canEditGuard, 'Closed', ({ state, message }) =>
              Closed({
                ...state,
                maybeInputDraft: Option.some(message.value),
              }),
            ),
            ignore(),
          ],
          PressedOutsideColorPicker: [ignore()],
          PressedColorPickerKey: [ignore()],
        },
      },
      Open: {
        on: {
          OpenColorPicker: [ignore()],
          CloseColorPicker: to('Closed', ({ state }) => closedFrom(state)),
          ToggleColorPicker: to('Closed', ({ state }) => closedFrom(state)),
          DismissColorPicker: [
            when(
              (_state, _message, context) =>
                Layers.canDismissOnEscape(layersOf(context), context.id) ||
                Layers.canDismissOnOutsidePress(
                  layersOf(context),
                  context.id,
                  [],
                ),
              'Closed',
              ({ state }) => closedFrom(state),
            ),
            ignore(),
          ],
          SetColor: [
            when(canEditGuard, 'Open', ({ state, message }) =>
              Open({
                ...state,
                color: clampHsba(message.color),
                maybeInputDraft: Option.none(),
              }),
            ),
            ignore(),
          ],
          SelectSwatch: [
            when(
              (_state, message, context) =>
                canEdit(context) && closeOnSelectSwatchOf(context)
                  ? parseColor(message.value)
                  : Option.none(),
              'Closed',
              ({ state, guardValue }) =>
                closedFrom(state, guardValue, state.format, Option.none()),
            ),
            when(
              (_state, message, context) =>
                canEdit(context) ? parseColor(message.value) : Option.none(),
              'Open',
              ({ state, guardValue }) =>
                Open({
                  ...state,
                  color: guardValue,
                  maybeInputDraft: Option.none(),
                }),
            ),
            ignore(),
          ],
          SetColorFormat: to('Open', ({ state, message }) =>
            Open({
              ...state,
              format: message.format,
              maybeInputDraft: Option.none(),
            }),
          ),
          SetChannelValue: [
            when(canEditGuard, 'Open', ({ state, message }) =>
              Open({
                ...state,
                color: withChannelValue(
                  state.color,
                  message.channel,
                  message.value,
                ),
                maybeInputDraft: Option.none(),
              }),
            ),
            ignore(),
          ],
          CommitColorInput: [
            when(canEditGuard, 'Open', ({ state }) => {
              const committed = commitInputOn(state)
              return Open({
                ...state,
                color: committed.color,
                maybeInputDraft: committed.maybeInputDraft,
              })
            }),
            ignore(),
          ],
          BeginAreaDrag: [
            when(canEditGuard, 'Open', ({ state, message, context }) => {
              const nextColor = clampHsba({
                ...state.color,
                s: message.saturation,
                b: message.brightness,
              })
              return startDragOn(
                state,
                'Area',
                message.pointerId,
                message.x,
                message.y,
                nextColor,
                context,
              )
            }),
            ignore(),
          ],
          MoveAreaDrag: [
            when(
              (state, message, context) =>
                canEdit(context) &&
                Option.contains(state.maybeDragTarget, 'Area') &&
                state.drag._tag === 'Dragging' &&
                message.pointerId === state.drag.pointerId,
              'Open',
              ({ state, message, context }) => {
                const [nextDrag] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.MoveDrag({
                    pointerId: message.pointerId,
                    x: message.x,
                    y: message.y,
                  }),
                  dragPropsOf(context, 'Area'),
                )
                return Open({
                  ...state,
                  color: clampHsba({
                    ...state.color,
                    s: message.saturation,
                    b: message.brightness,
                  }),
                  maybeInputDraft: Option.none(),
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          BeginChannelDrag: [
            when(canEditGuard, 'Open', ({ state, message, context }) => {
              const nextColor = withChannelValue(
                state.color,
                message.channel,
                message.value,
              )
              return startDragOn(
                state,
                message.channel,
                message.pointerId,
                message.x,
                message.y,
                nextColor,
                context,
              )
            }),
            ignore(),
          ],
          MoveChannelDrag: [
            when(
              (state, message, context) =>
                canEdit(context) &&
                Option.contains(state.maybeDragTarget, message.channel) &&
                state.drag._tag === 'Dragging' &&
                message.pointerId === state.drag.pointerId,
              'Open',
              ({ state, message, context }) => {
                const [nextDrag] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.MoveDrag({
                    pointerId: message.pointerId,
                    x: message.x,
                    y: message.y,
                  }),
                  dragPropsOf(context, message.channel),
                )
                return Open({
                  ...state,
                  color: withChannelValue(
                    state.color,
                    message.channel,
                    message.value,
                  ),
                  maybeInputDraft: Option.none(),
                  drag: nextDrag,
                })
              },
            ),
            ignore(),
          ],
          EndColorDrag: [
            when(
              (state, message) =>
                state.drag._tag === 'Dragging' &&
                (message.pointerId === undefined ||
                  message.pointerId === state.drag.pointerId),
              'Open',
              ({ state, message, context }) => {
                const [endedDrag] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.EndDrag(
                    message.pointerId === undefined
                      ? {}
                      : { pointerId: message.pointerId },
                  ),
                  dragPropsOf(
                    context,
                    Option.getOrElse(state.maybeDragTarget, () => 'Area'),
                  ),
                )
                return Open({
                  ...state,
                  maybeDragTarget: Option.none(),
                  maybeOriginColor: Option.none(),
                  drag: endedDrag,
                })
              },
            ),
            ignore(),
          ],
          CancelColorDrag: [
            when(
              (state, message) =>
                state.drag._tag === 'Dragging' &&
                (message.pointerId === undefined ||
                  message.pointerId === state.drag.pointerId),
              'Open',
              ({ state, message, context }) => {
                const [cancelledDrag] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.CancelDrag(
                    message.pointerId === undefined
                      ? {}
                      : { pointerId: message.pointerId },
                  ),
                  dragPropsOf(
                    context,
                    Option.getOrElse(state.maybeDragTarget, () => 'Area'),
                  ),
                )
                return Open({
                  ...state,
                  color: Option.getOrElse(
                    state.maybeOriginColor,
                    () => state.color,
                  ),
                  maybeDragTarget: Option.none(),
                  maybeOriginColor: Option.none(),
                  drag: cancelledDrag,
                })
              },
            ),
            ignore(),
          ],
          ChangedColorInput: [
            when(canEditGuard, 'Open', ({ state, message }) =>
              Open({
                ...state,
                maybeInputDraft: Option.some(message.value),
              }),
            ),
            ignore(),
          ],
          PressedOutsideColorPicker: [
            when(
              (_state, message, context) =>
                Layers.canDismissOnOutsidePress(
                  layersOf(context),
                  context.id,
                  message.insideIds,
                ),
              'Closed',
              ({ state }) => closedFrom(state),
            ),
            ignore(),
          ],
          PressedColorPickerKey: [
            when(
              (state, message) =>
                PointerDrag.isCancelKey(message.key) &&
                state.drag._tag === 'Dragging',
              'Open',
              ({ state, context }) => {
                const [cancelledDrag] = PointerDrag.chart.transition(
                  state.drag,
                  PointerDrag.CancelDrag({}),
                  dragPropsOf(
                    context,
                    Option.getOrElse(state.maybeDragTarget, () => 'Area'),
                  ),
                )
                return Open({
                  ...state,
                  color: Option.getOrElse(
                    state.maybeOriginColor,
                    () => state.color,
                  ),
                  maybeDragTarget: Option.none(),
                  maybeOriginColor: Option.none(),
                  drag: cancelledDrag,
                })
              },
            ),
            when(
              (_state, message, context) =>
                PointerDrag.isCancelKey(message.key) &&
                Layers.canDismissOnEscape(layersOf(context), context.id),
              'Closed',
              ({ state }) => closedFrom(state),
            ),
            when(
              (state, message, context) =>
                canEdit(context)
                  ? resolveChannelOrAreaKey(
                      state.color,
                      message.key,
                      message.target ?? 'Popup',
                      message.isShift === true,
                    )
                  : Option.none(),
              'Open',
              ({ state, guardValue }) =>
                Open({
                  ...state,
                  color: guardValue,
                  maybeInputDraft: Option.none(),
                }),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** Default ColorPicker Machine chart starting closed on `#000000`. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the ColorPicker sync table using `Pace.Sampled({ everyMs })` on
 * `MoveAreaDrag` and `MoveChannelDrag` and `Pace.Synced()` on discrete color
 * changes, format switches, swatch clicks, and popup toggles.
 */
export const syncOf = (
  sampleMs: number = defaultSampleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenColorPicker: Synced(),
  CloseColorPicker: Synced(),
  ToggleColorPicker: Synced(),
  DismissColorPicker: Synced(),
  SetColor: Synced(),
  SelectSwatch: Synced(),
  SetColorFormat: Synced(),
  SetChannelValue: Synced(),
  CommitColorInput: Synced(),
  BeginAreaDrag: Synced(),
  MoveAreaDrag: Sampled({ everyMs: sampleMs }),
  BeginChannelDrag: Synced(),
  MoveChannelDrag: Sampled({ everyMs: sampleMs }),
  EndColorDrag: Synced(),
  CancelColorDrag: Synced(),
  ChangedColorInput: Synced(),
  PressedOutsideColorPicker: Synced(),
  PressedColorPickerKey: Synced(),
})

/** Default synchronization: live area and channel drags sampled at 50 ms. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a ColorPicker kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  OpenColorPicker: Device({ because }),
  CloseColorPicker: Device({ because }),
  ToggleColorPicker: Device({ because }),
  DismissColorPicker: Device({ because }),
  SetColor: Device({ because }),
  SelectSwatch: Device({ because }),
  SetColorFormat: Device({ because }),
  SetChannelValue: Device({ because }),
  CommitColorInput: Device({ because }),
  BeginAreaDrag: Device({ because }),
  MoveAreaDrag: Device({ because }),
  BeginChannelDrag: Device({ because }),
  MoveChannelDrag: Device({ because }),
  EndColorDrag: Device({ because }),
  CancelColorDrag: Device({ because }),
  ChangedColorInput: Device({ because }),
  PressedOutsideColorPicker: Device({ because }),
  PressedColorPickerKey: Device({ because }),
})

// SLOTS & PROJECTION

/**
 * The seven painted slots of a ColorPicker Part:
 * - `Trigger`: opens/closes the color picker popup (`role="button"`, `aria-expanded`, `aria-controls`, `aria-haspopup="dialog"`).
 * - `Content`: floating color picker dialog (`role="dialog"`, `hidden`, `aria-labelledby`, `aria-modal`).
 * - `Area`: 2D saturation-brightness color plane (`role="group"`).
 * - `AreaThumb`: 2D slider thumb (`role="slider"`, `valueMin: 0`, `valueMax: 100`, `valueNow`, `valueText`).
 * - `ChannelSlider`: 1D slider for `'Hue'` (`0..360`) or `'Alpha'` (`0..100`) (`role="slider"`).
 * - `Swatch`: preset color swatch button (`role="button"`, `isSelected`, `SelectSwatch`).
 * - `Input`: text input for hex/RGB/HSL/HSB notation (`role="textbox"`, `isInvalid`, `isReadOnly`, `isDisabled`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ToggleColorPicker' }],
  },
  Content: {
    role: 'Dialog',
    focus: 'None',
    gestures: [],
  },
  Area: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  AreaThumb: {
    role: 'Slider',
    focus: 'None',
    gestures: [],
  },
  ChannelSlider: {
    role: 'Slider',
    focus: 'None',
    gestures: [],
  },
  Swatch: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'SelectSwatch' }],
  },
  Input: {
    role: 'TextBox',
    focus: 'None',
    gestures: [],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  const open = isOpen(state)
  const disabled = isDisabledOf(props)
  const readOnly = isReadOnlyOf(props)

  if (slot === 'Trigger') {
    return {
      id: triggerId(props.id),
      controls: contentId(props.id),
      hasPopup: 'dialog',
      isExpanded: open,
      label: props.label ?? `Color ${formattedValueOf(state)}`,
      ...(disabled ? { isDisabled: true } : {}),
      tabIndex: disabled ? -1 : 0,
    }
  } else if (slot === 'Content') {
    return {
      id: contentId(props.id),
      labelledBy: triggerId(props.id),
      isHidden: !open,
      ...(isModalOf(props) ? { isModal: true } : {}),
      tabIndex: -1,
    }
  } else if (slot === 'Area') {
    return {
      id: areaId(props.id),
      label: 'Color saturation and brightness',
      ...(disabled ? { isDisabled: true } : {}),
      ...(readOnly ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'AreaThumb') {
    const saturation = Math.round(state.color.s)
    const brightness = Math.round(state.color.b)
    return {
      id: areaThumbId(props.id),
      label: 'Saturation and brightness',
      valueMin: 0,
      valueMax: maxPercent,
      valueNow: saturation,
      valueText: `Saturation ${saturation.toString()}%, Brightness ${brightness.toString()}%`,
      ...(disabled ? { isDisabled: true } : {}),
      ...(readOnly ? { isReadOnly: true } : {}),
      tabIndex: disabled ? -1 : 0,
    }
  } else if (slot === 'ChannelSlider') {
    const channel: SliderChannel = Option.contains(maybeChoice, 'Alpha')
      ? 'Alpha'
      : 'Hue'
    return M.value(channel).pipe(
      M.withReturnType<SlotProps>(),
      M.when('Hue', () => {
        const hue = Math.round(state.color.h)
        return {
          id: channelSliderId(props.id, 'Hue'),
          label: 'Hue',
          orientation: 'Horizontal',
          valueMin: 0,
          valueMax: maxHue,
          valueNow: hue,
          valueText: `${hue.toString()}°`,
          ...(disabled ? { isDisabled: true } : {}),
          ...(readOnly ? { isReadOnly: true } : {}),
          tabIndex: disabled ? -1 : 0,
        }
      }),
      M.when('Alpha', () => {
        const alphaPercent = Math.round(state.color.a * maxPercent)
        return {
          id: channelSliderId(props.id, 'Alpha'),
          label: 'Alpha',
          orientation: 'Horizontal',
          valueMin: 0,
          valueMax: maxPercent,
          valueNow: alphaPercent,
          valueText: `${alphaPercent.toString()}%`,
          ...(disabled ? { isDisabled: true } : {}),
          ...(readOnly ? { isReadOnly: true } : {}),
          tabIndex: disabled ? -1 : 0,
        }
      }),
      M.exhaustive,
    )
  } else if (slot === 'Swatch') {
    return Option.match(maybeChoice, {
      onNone: () => ({}),
      onSome: swatch => ({
        id: swatchId(props.id, swatch),
        label: swatch,
        isSelected: isSwatchSelected(state, swatch),
        ...(disabled || readOnly ? { isDisabled: true } : {}),
        tabIndex: disabled || readOnly ? -1 : 0,
      }),
    })
  } else if (slot === 'Input') {
    return {
      id: inputId(props.id),
      label: `Color value (${state.format})`,
      ...(disabled ? { isDisabled: true } : {}),
      ...(readOnly ? { isReadOnly: true } : {}),
      ...(isInputInvalid(state) ? { isInvalid: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a ColorPicker Part on: closed with any active drag and
 * uncommitted text draft cleared while preserving the settled `color` and `format`.
 */
export const atRest = (state: State): State =>
  Closed({
    color: state.color,
    format: state.format,
    maybeInputDraft: Option.none(),
  })

// PART FACTORY

/** Options for customizing a ColorPicker Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (such as `'OwnView'`) to keep ColorPicker device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial HSBA color (`#000000` by default). */
  defaultColor?: HsbaColor
  /** Initial color notation format (`'Hex'` by default). */
  defaultFormat?: ColorFormat
  /** Pointer-move sync sampling interval in milliseconds (`50` by default). */
  sampleMs?: number
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a ColorPicker {@link Part.Part}. Synced by default
 * (`category: 'Domain'`, `MoveAreaDrag` and `MoveChannelDrag` at
 * `Pace.Sampled({ everyMs: 50 })`). Use {@link deviceOnly} for local-only
 * pickers.
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const sampleMs = options.sampleMs ?? defaultSampleMs
  const initialState =
    options.defaultColor === undefined && options.defaultFormat === undefined
      ? initial
      : initialColor(
          options.defaultColor ?? defaultColor,
          options.defaultFormat ?? defaultFormat,
        )
  return Part.define<State, Message, Props>({
    name: options.name ?? 'ColorPicker',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? syncOf(sampleMs)
        : deviceSync(options.sync),
    category: options.category ?? 'Domain',
    slots,
    atRest,
    project: projectSlot,
    configuration: options.configuration ?? {
      base: {
        pace: {
          ...defaultPace,
          dragSampleMs: sampleMs,
        },
      },
      presets: {},
    },
  })
}

/**
 * Shorthand for a ColorPicker Part whose state stays on the device and is
 * omitted from the synced log and encoded Model.
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> => {
  const { because, ...rest } = options
  return make({
    ...rest,
    sync: because ?? 'OwnView',
  })
}

/** The default synced ColorPicker Part (`name: 'ColorPicker'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
