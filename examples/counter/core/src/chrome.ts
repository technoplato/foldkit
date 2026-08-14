import { Array, Option, Schema as S } from 'effect'

import { type Model } from './model.js'
import { productView } from './product.js'
import { buttonsOf, textsOf } from './tree.js'

/** Form factors that `show` can paint in one row. */
export const Device = S.Literals(['watch', 'phone', 'tablet', 'laptop', 'tv'])
/** A form factor that `show` can paint. */
export type Device = typeof Device.Type

const WATCH_INNER = 14
const PHONE_INNER = 22
const TABLET_INNER = 24
const LAPTOP_INNER = 26
const TV_INNER = 26

const center = (content: string, width: number): string => {
  const remaining = Math.max(0, width - content.length)
  const left = Math.floor(remaining / 2)
  const right = remaining - left
  return `${' '.repeat(left)}${content}${' '.repeat(right)}`
}

const pad = (content: string, width: number): string => {
  if (content.length >= width) {
    return content.slice(0, width)
  }
  return content.padEnd(width, ' ')
}

const box = (
  sides: Readonly<{
    topLeft: string
    topRight: string
    bottomLeft: string
    bottomRight: string
    horizontal: string
    vertical: string
  }>,
  innerWidth: number,
  rows: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const top = `${sides.topLeft}${sides.horizontal.repeat(innerWidth)}${sides.topRight}`
  const bottom = `${sides.bottomLeft}${sides.horizontal.repeat(innerWidth)}${sides.bottomRight}`
  const body = Array.map(
    rows,
    row => `${sides.vertical}${pad(row, innerWidth)}${sides.vertical}`,
  )
  return [top, ...body, bottom]
}

const rounded = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
}

const square = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
}

const double = {
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  horizontal: '═',
  vertical: '║',
}

const watchButtons = (isResetValid: boolean): string => {
  if (isResetValid) {
    return ' [-] [r] [+]  '
  }
  return ' [-]     [+]  '
}

const phoneButtons = (isResetValid: boolean): string => {
  if (isResetValid) {
    return ' [ - ] [reset] [ + ]  '
  }
  return ' [ - ]          [ + ] '
}

const tabletButtons = (isResetValid: boolean): string => {
  if (isResetValid) {
    return ' [ - ]  [reset]  [ + ]  '
  }
  return ' [ - ]            [ + ] '
}

const laptopButtons = (isResetValid: boolean): string => {
  if (isResetValid) {
    return '  [ - ]  [reset]  [ + ]   '
  }
  return '  [ - ]            [ + ]  '
}

const tvButtons = (isResetValid: boolean): string => {
  if (isResetValid) {
    return '  [ - ]  [reset]  [ + ]   '
  }
  return '  [ - ]            [ + ]  '
}

const renderWatch = (
  count: string,
  isResetValid: boolean,
): ReadonlyArray<string> =>
  box(rounded, WATCH_INNER, [
    '9:41        ● ',
    '              ',
    center(count, WATCH_INNER),
    watchButtons(isResetValid),
    '              ',
  ])

const renderPhone = (
  count: string,
  isResetValid: boolean,
): ReadonlyArray<string> =>
  box(square, PHONE_INNER, [
    '• • •            9:41 ',
    '                      ',
    center(count, PHONE_INNER),
    '                      ',
    phoneButtons(isResetValid),
    '                      ',
    '        ─────         ',
  ])

const renderTablet = (
  count: string,
  isResetValid: boolean,
): ReadonlyArray<string> =>
  box(square, TABLET_INNER, [
    '• • •              9:41 ',
    '                        ',
    center(count, TABLET_INNER),
    '                        ',
    tabletButtons(isResetValid),
    '                        ',
  ])

const renderLaptop = (
  count: string,
  isResetValid: boolean,
): ReadonlyArray<string> => {
  const frame = box(square, LAPTOP_INNER, [
    '● ● ●  /counter           ',
    '                          ',
    center(count, LAPTOP_INNER),
    '                          ',
    laptopButtons(isResetValid),
    '                          ',
  ])
  return [...frame, ' ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ ']
}

const renderTv = (
  count: string,
  isResetValid: boolean,
): ReadonlyArray<string> =>
  box(double, TV_INNER, [
    '                          ',
    center(count, TV_INNER),
    '                          ',
    tvButtons(isResetValid),
    '                    ██    ',
    '    focus  increment      ',
    '                          ',
  ])

const deviceWidth = (device: Device): number => {
  if (device === 'watch') {
    return 16
  }
  if (device === 'phone') {
    return 24
  }
  if (device === 'tablet') {
    return 26
  }
  return 28
}

const renderDevice = (
  device: Device,
  count: string,
  isResetValid: boolean,
): ReadonlyArray<string> => {
  if (device === 'watch') {
    return renderWatch(count, isResetValid)
  }
  if (device === 'phone') {
    return renderPhone(count, isResetValid)
  }
  if (device === 'tablet') {
    return renderTablet(count, isResetValid)
  }
  if (device === 'laptop') {
    return renderLaptop(count, isResetValid)
  }
  return renderTv(count, isResetValid)
}

const headerLabel = (device: Device, width: number): string =>
  center(device, width)

const rowCount = (targets: ReadonlyArray<Device>): number =>
  Array.reduce(targets, 0, (max, device) =>
    Math.max(max, renderDevice(device, '0', false).length),
  )

const countFromTree = (model: Model): string => {
  const maybeText = Array.head(textsOf(productView(model)))
  if (Option.isSome(maybeText)) {
    return maybeText.value.content
  }
  return model.count.toString()
}

const isResetOffered = (model: Model): boolean =>
  Array.some(buttonsOf(productView(model)), button => button.token === 'reset')

/** Paints device chrome as a shell around the product tree. */
export const renderChrome = (
  model: Model,
  targets: ReadonlyArray<Device>,
): string => {
  if (Option.isNone(Array.head(targets))) {
    return ''
  }

  const count = countFromTree(model)
  const isResetValid = isResetOffered(model)
  const frames = Array.map(targets, device => ({
    device,
    width: deviceWidth(device),
    lines: renderDevice(device, count, isResetValid),
  }))
  const height = rowCount(targets)
  const header = Array.map(frames, frame =>
    headerLabel(frame.device, frame.width),
  )
    .join('  ')
    .trimEnd()
  const rows = Array.map(Array.range(0, height - 1), index =>
    Array.map(frames, frame => {
      const maybeLine = Array.get(frame.lines, index)
      if (Option.isSome(maybeLine)) {
        return maybeLine.value
      }
      return ' '.repeat(frame.width)
    }).join('  '),
  )

  return [header, ...rows].join('\n')
}
