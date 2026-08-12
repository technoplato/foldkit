/**
 * Catalog demo phones: single counter, calculator, forEach list.
 * Multi-counters stay in countersProduct.ts.
 */
import type { Model as CalculatorModel } from 'calculator-core-example'
import { displayForModel } from 'calculator-core-example'
import type { Model as CounterModel } from 'counter-core-example'
import type { ForEachModel } from 'foldkit/program'

import {
  CountersDetailPhone,
  CountersListPhone,
  type CountersActions,
} from './countersProduct.js'
import { Button, HStack, Phone, Spacer, Text, VStack } from './elements.js'
import type { UiNode } from './types.js'

export type CanvasNodeSpec = {
  uri: string
  title: string
  summary: string
  x: number
  y: number
  active: boolean
  tree: UiNode
}

/** Single Counter Program phone. */
export const SingleCounterPhone = (model: CounterModel): UiNode =>
  Phone(
    { cols: 22, title: 'Counter' },
    VStack(
      { gap: 0 },
      Spacer(1),
      Text(`     ${model.count}`, { mono: true }),
      Spacer(1),
      HStack(
        { gap: 2 },
        Button({
          label: '-',
          onPress: () => {},
          action: { _tag: 'singleDec' },
        }),
        Button({
          label: '+',
          onPress: () => {},
          action: { _tag: 'singleInc' },
        }),
      ),
      Spacer(1),
      Button({
        label: 'Reset',
        onPress: () => {},
        action: { _tag: 'singleReset' },
      }),
    ),
  )

const DIGITS: ReadonlyArray<{ label: string; digit: string }> = [
  { label: '7', digit: 'Seven' },
  { label: '8', digit: 'Eight' },
  { label: '9', digit: 'Nine' },
  { label: '4', digit: 'Four' },
  { label: '5', digit: 'Five' },
  { label: '6', digit: 'Six' },
  { label: '1', digit: 'One' },
  { label: '2', digit: 'Two' },
  { label: '3', digit: 'Three' },
]

/** Calculator Program phone (compact pad). */
export const CalculatorPhone = (model: CalculatorModel): UiNode => {
  const display = displayForModel(model).slice(0, 18)
  const digitBtn = (label: string, digit: string): UiNode =>
    Button({
      label,
      onPress: () => {},
      action: { _tag: 'calc', kind: 'digit', digit },
    })
  const opBtn = (label: string, operation: string): UiNode =>
    Button({
      label,
      onPress: () => {},
      action: { _tag: 'calc', kind: 'op', operation },
    })

  return Phone(
    { cols: 24, title: 'Calc' },
    VStack(
      { gap: 0 },
      Text(` ${display.padStart(18)}`, { mono: true }),
      Spacer(1),
      HStack(
        { gap: 1 },
        Button({
          label: 'C',
          onPress: () => {},
          action: { _tag: 'calc', kind: 'clear' },
        }),
        Button({
          label: '+/-',
          onPress: () => {},
          action: { _tag: 'calc', kind: 'sign' },
        }),
        Button({
          label: '%',
          onPress: () => {},
          action: { _tag: 'calc', kind: 'percent' },
        }),
        opBtn('/', 'Divide'),
      ),
      HStack(
        { gap: 1 },
        digitBtn('7', 'Seven'),
        digitBtn('8', 'Eight'),
        digitBtn('9', 'Nine'),
        opBtn('*', 'Multiply'),
      ),
      HStack(
        { gap: 1 },
        digitBtn('4', 'Four'),
        digitBtn('5', 'Five'),
        digitBtn('6', 'Six'),
        opBtn('-', 'Subtract'),
      ),
      HStack(
        { gap: 1 },
        digitBtn('1', 'One'),
        digitBtn('2', 'Two'),
        digitBtn('3', 'Three'),
        opBtn('+', 'Add'),
      ),
      HStack(
        { gap: 1 },
        digitBtn('0', 'Zero'),
        Button({
          label: '.',
          onPress: () => {},
          action: { _tag: 'calc', kind: 'dot' },
        }),
        Button({
          label: '=',
          onPress: () => {},
          action: { _tag: 'calc', kind: 'equals' },
        }),
      ),
    ),
  )
}

/** forEach list of counters. */
export const CounterListPhone = (
  model: ForEachModel<CounterModel>,
): UiNode =>
  Phone(
    { cols: 24, title: `List (${model.rows.length})` },
    VStack(
      { gap: 0 },
      ...model.rows.slice(0, 5).map(row =>
        HStack(
          { gap: 1 },
          Text(row.id.padEnd(3).slice(0, 3), { mono: true, width: 3 }),
          Text(String(row.child.count).padStart(3), { mono: true, width: 3 }),
          Button({
            label: '-',
            onPress: () => {},
            action: { _tag: 'listDec', id: row.id },
          }),
          Button({
            label: '+',
            onPress: () => {},
            action: { _tag: 'listInc', id: row.id },
          }),
          Button({
            label: 'x',
            onPress: () => {},
            action: { _tag: 'listRemove', id: row.id },
          }),
        ),
      ),
      Spacer(1),
      Button({
        label: '+ Row',
        onPress: () => {},
        action: { _tag: 'listAdd' },
      }),
    ),
  )

export type LabCanvasModels = {
  single: CounterModel
  multi: Parameters<typeof CountersListPhone>[0]
  calc: CalculatorModel
  list: ForEachModel<CounterModel>
  chrome: {
    showSingle: boolean
    showMulti: boolean
    showCalc: boolean
    showList: boolean
    focusedSlot: string
  }
}

/** All catalog phones for the map (respect chrome visibility toggles). */
export const labCanvasNodes = (
  models: LabCanvasModels,
  multiActions: CountersActions,
): CanvasNodeSpec[] => {
  const nodes: CanvasNodeSpec[] = []
  let x = 40
  const yTop = 40
  const yBot = 380
  const gap = 340

  if (models.chrome.showSingle) {
    nodes.push({
      uri: 'demos.single',
      title: 'Single',
      summary: `count=${models.single.count}`,
      x,
      y: yTop,
      active: models.chrome.focusedSlot === 'single',
      tree: SingleCounterPhone(models.single),
    })
    x += gap
  }

  if (models.chrome.showMulti) {
    nodes.push({
      uri: 'counters.list',
      title: 'Multi list',
      summary: `${models.multi.rows.length} rows`,
      x,
      y: yTop,
      active: models.chrome.focusedSlot === 'multi',
      tree: CountersListPhone(models.multi, multiActions),
    })
    nodes.push({
      uri: 'counters.detail',
      title: 'Multi detail',
      summary: 'detail / delete',
      x: x + gap,
      y: yTop,
      active: models.chrome.focusedSlot === 'multi',
      tree: CountersDetailPhone(models.multi, multiActions),
    })
    x += gap * 2
  }

  if (models.chrome.showCalc) {
    nodes.push({
      uri: 'demos.calc',
      title: 'Calculator',
      summary: displayForModel(models.calc).slice(0, 24),
      x: 40,
      y: yBot,
      active: models.chrome.focusedSlot === 'calc',
      tree: CalculatorPhone(models.calc),
    })
  }

  if (models.chrome.showList) {
    nodes.push({
      uri: 'demos.list',
      title: 'forEach list',
      summary: `${models.list.rows.length} rows`,
      x: 40 + gap,
      y: yBot,
      active: models.chrome.focusedSlot === 'list',
      tree: CounterListPhone(models.list),
    })
  }

  return nodes
}

// silence unused DIGITS if tree uses inline labels
void DIGITS
