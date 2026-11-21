import { Array, Option } from 'effect'
import { Slot } from 'foldkit/behavior'
import {
  type ItemCheck,
  type ListItem,
  type ListNode,
  type UiNode,
  filterListItems,
  groupedItemsOf,
} from 'foldkit/renderers'
import { type ReactElement, memo, useMemo, useState } from 'react'
import {
  Image,
  TextInput as NativeTextInput,
  Pressable,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'

import { useLaidOut } from '../telemetry/paintReporter.js'
import { fieldStyleOf } from './field.js'
import { hostPropsOf } from './host.js'
import { percentOf } from './look.js'
import { MenuSheetOverlay } from './menuSheet.js'
import { type Paint, pressOf } from './paint.js'

const rowPaddingY = 10

const rowGap = 12

const bodyGap = 3

const lineSize = 14

const columnWidth = 56

const badgeSize = 12

const groupSize = 12

const barHeight = 4

/** A thin bar showing how far along something is. */
export const ProgressBar = ({
  value,
  max,
  paint,
}: Readonly<{ value: number; max: number; paint: Paint }>): ReactElement => {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <View
      style={{
        alignSelf: 'stretch',
        backgroundColor: paint.look.colors.Rule,
        borderRadius: barHeight / 2,
        height: barHeight,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          backgroundColor: paint.look.colors.Accent,
          height: barHeight,
          width: percentOf(fraction),
        }}
      />
    </View>
  )
}

/** The round box at the start of a list row a person ticks. */
const CheckBox = ({
  check,
  paint,
}: Readonly<{ check: ItemCheck; paint: Paint }>): ReactElement => {
  const { colors, sizes } = paint.look
  const action = check.action
  const boxStyle: ViewStyle = {
    alignItems: 'center',
    borderColor: check.isChecked ? colors.Accent : colors.Border,
    borderRadius: sizes.checkSize / 2,
    borderWidth: 2,
    height: sizes.checkSize,
    justifyContent: 'center',
    width: sizes.checkSize,
    ...(check.isChecked ? { backgroundColor: colors.Accent } : {}),
  }
  return (
    <Pressable
      accessibilityLabel={check.label}
      accessibilityRole="checkbox"
      accessibilityState={{
        checked: check.isChecked,
        disabled: action === undefined,
      }}
      disabled={action === undefined}
      hitSlop={10}
      onPress={() => {
        if (action !== undefined) {
          paint.onPress(pressOf(action, check.label))
        }
      }}
      style={boxStyle}
    >
      {check.isChecked ? (
        <Text
          style={{ color: colors.PageGround, fontSize: 13, fontWeight: '700' }}
        >
          ✓
        </Text>
      ) : null}
    </Pressable>
  )
}

const titleOf = (item: ListItem, paint: Paint): ReactElement => {
  const { colors, sizes } = paint.look
  const titleStyle: TextStyle = {
    color: item.isCurrent === true ? colors.Accent : colors.Text,
    fontSize: sizes.bodySize,
    fontWeight: '600',
    ...(item.check?.isChecked === true
      ? { color: colors.QuietText, fontWeight: '500' }
      : {}),
  }
  const mark = item.titleMark
  const badge = item.badge
  return (
    <Text numberOfLines={2} style={titleStyle}>
      {mark === undefined ? (
        item.title
      ) : (
        <>
          {item.title.slice(0, mark.start)}
          <Text
            style={{ backgroundColor: colors.MarkSoft, color: colors.Mark }}
          >
            {item.title.slice(mark.start, mark.end)}
          </Text>
          {item.title.slice(mark.end)}
        </>
      )}
      {badge === undefined ? null : (
        <Text
          accessibilityLabel={badge.label}
          style={{
            color: colors.QuietText,
            fontSize: badgeSize,
            fontVariant: ['tabular-nums'],
            fontWeight: '600',
          }}
        >
          {`  ${badge.text}`}
        </Text>
      )}
    </Text>
  )
}

/**
 * One row of a List: a box to tick, a picture, the title with its mark
 * and badge, the lines under it, how far along it is, the columns at its
 * end, and its trailing buttons. Pressing the row presses its Action, or
 * follows its link. A hold on a row a part bound, or one with a
 * `menuAction`, sends the press its binding gives, through the host.
 */
export const paintRow = (
  item: ListItem,
  paint: Paint,
  paintChildren: (
    children: ReadonlyArray<UiNode>,
  ) => ReadonlyArray<ReactElement>,
): ReactElement => {
  const { colors, sizes } = paint.look
  const action = item.action
  const href = item.href
  const isFocused =
    item.focused === true ||
    (paint.maybeFocusedAction !== undefined &&
      (action === paint.maybeFocusedAction ||
        href === paint.maybeFocusedAction))
  const host = hostPropsOf(Slot.ofItem(item), paint, item.title)
  return (
    <View
      key={item.key}
      style={{
        alignItems: 'center',
        backgroundColor: isFocused ? colors.Surface : undefined,
        borderBottomColor: colors.Rule,
        borderBottomWidth: 1,
        borderLeftColor: isFocused ? colors.SelectedMark : 'transparent',
        borderLeftWidth: isFocused ? bodyGap : 0,
        flexDirection: 'row',
        gap: rowGap,
        paddingLeft: isFocused ? rowGap : 0,
        paddingVertical: rowPaddingY,
      }}
    >
      {item.check === undefined ? null : (
        <CheckBox check={item.check} paint={paint} />
      )}
      <Pressable
        accessibilityLabel={item.title}
        accessibilityRole={href === undefined ? 'button' : 'link'}
        accessibilityState={{
          selected: item.isCurrent === true || isFocused,
          ...host.accessibilityState,
        }}
        disabled={
          action === undefined &&
          href === undefined &&
          host.onLongPress === undefined
        }
        onLongPress={host.onLongPress}
        onPress={() => {
          if (href !== undefined) {
            paint.onLink(href)
          } else if (action !== undefined) {
            paint.onPress(pressOf(action, item.title))
          }
        }}
        style={{
          alignItems: 'center',
          flex: 1,
          flexDirection: 'row',
          gap: rowGap,
        }}
      >
        {item.image === undefined ? null : (
          <Image
            accessibilityLabel={item.image.alt}
            source={{ uri: item.image.src }}
            style={{
              borderRadius: 6,
              height: sizes.itemImageSize,
              width: sizes.itemImageSize,
            }}
          />
        )}
        <View style={{ flex: 1, gap: bodyGap }}>
          {titleOf(item, paint)}
          {Array.map(item.lines ?? [], (line, index) => (
            <Text
              key={index}
              numberOfLines={2}
              style={{ color: colors.QuietText, fontSize: lineSize }}
            >
              {line}
            </Text>
          ))}
          {item.progress === undefined ? null : (
            <ProgressBar
              max={item.progress.max}
              paint={paint}
              value={item.progress.value}
            />
          )}
        </View>
        {Array.map(item.columns ?? [], (column, index) => (
          <Text
            key={index}
            style={{
              color: colors.QuietText,
              fontSize: lineSize,
              fontVariant: ['tabular-nums'],
              textAlign: 'right',
              width: columnWidth,
            }}
          >
            {column}
          </Text>
        ))}
      </Pressable>
      {paintChildren(item.trailing ?? [])}
    </View>
  )
}

// NOTE: one row of a List, painted again only when the row is another
// object: a screen's tree keeps the rows that did not change, so a change
// in one row of a long list repaints that row.
const PaintedRow = memo(
  ({
    item,
    paint,
    paintChildren,
  }: Readonly<{
    item: ListItem
    paint: Paint
    paintChildren: (
      children: ReadonlyArray<UiNode>,
    ) => ReadonlyArray<ReactElement>
  }>): ReactElement => paintRow(item, paint, paintChildren),
)

const menuHeadingOf = (list: ListNode, key: string): string =>
  Option.getOrElse(
    Option.map(
      Array.findFirst(list.items, item => item.key === key),
      item => item.title,
    ),
    () => list.label,
  )

/**
 * The rows of a List, each group headed once by its name and how many
 * rows it has, and the menu the Program holds open on one of them, as a
 * sheet named for that row.
 */
export const paintRows = (
  list: ListNode,
  items: ReadonlyArray<ListItem>,
  paint: Paint,
  paintChildren: (
    children: ReadonlyArray<UiNode>,
  ) => ReadonlyArray<ReactElement>,
): ReactElement => {
  const { colors } = paint.look
  return (
    <View
      accessibilityLabel={list.label}
      style={[{ alignSelf: 'stretch' }, paint.styles.List]}
    >
      {Array.flatMap(groupedItemsOf(items), (section, index) => [
        ...(section.group === undefined
          ? []
          : [
              <View
                key={`group-${index.toString()}-${section.group}`}
                accessibilityRole="header"
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  paddingBottom: 4,
                  paddingTop: 16,
                }}
              >
                <Text
                  style={{
                    color: colors.QuietText,
                    fontSize: groupSize,
                    fontWeight: '700',
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                  }}
                >
                  {section.group}
                </Text>
                <Text
                  style={{
                    color: colors.FaintText,
                    fontSize: groupSize,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {section.items.length}
                </Text>
              </View>,
            ]),
        ...Array.map(section.items, item => (
          <PaintedRow
            key={item.key}
            item={item}
            paint={paint}
            paintChildren={paintChildren}
          />
        )),
      ])}
      {list.menu === undefined ? null : (
        <MenuSheetOverlay
          dismissAction={list.menu.dismissAction}
          heading={menuHeadingOf(list, list.menu.key)}
          items={list.menu.items}
          paint={paint}
        />
      )}
    </View>
  )
}

/**
 * A List with a head over its rows: a field that narrows the rows as a
 * person types, when the List has a `filter`, and the names of the rows'
 * columns, when it has `columns`. What is typed lives here, like a text
 * field's draft: the Program hears nothing until a row is pressed.
 */
export const ListFrame = ({
  list,
  paint,
  paintChildren,
}: Readonly<{
  list: ListNode
  paint: Paint
  paintChildren: (
    children: ReadonlyArray<UiNode>,
  ) => ReadonlyArray<ReactElement>
}>): ReactElement => {
  const { colors } = paint.look
  const [typed, setTyped] = useState('')
  const filter = list.filter
  const isOverLines = filter?.isOverLines === true
  const items = useMemo(
    () => filterListItems(list.items, typed, isOverLines),
    [list.items, typed, isOverLines],
  )
  useLaidOut({ rows: items.length })
  return (
    <View style={{ alignSelf: 'stretch', gap: 8 }}>
      {filter === undefined ? null : (
        <NativeTextInput
          accessibilityLabel={filter.label}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setTyped}
          placeholder={filter.placeholder}
          placeholderTextColor={colors.FaintText}
          returnKeyType="search"
          style={fieldStyleOf(paint)}
          value={typed}
        />
      )}
      {list.columns === undefined ? null : (
        <View
          accessibilityElementsHidden
          style={{
            flexDirection: 'row',
            gap: rowGap,
            justifyContent: 'flex-end',
          }}
        >
          {Array.map(list.columns, name => (
            <Text
              key={name}
              style={{
                color: colors.FaintText,
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 0.6,
                textAlign: 'right',
                textTransform: 'uppercase',
                width: columnWidth,
              }}
            >
              {name}
            </Text>
          ))}
        </View>
      )}
      {filter !== undefined && Array.isReadonlyArrayEmpty(items) ? (
        <Text
          accessibilityRole="text"
          style={{ color: colors.QuietText, paddingVertical: 12 }}
        >
          {filter.emptyText}
        </Text>
      ) : null}
      {paintRows(list, items, paint, paintChildren)}
    </View>
  )
}
