import { Array, Match as M, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import { Slot } from 'foldkit/behavior'
import {
  type BoxNode,
  type ButtonNode,
  type ReferencePart,
  type RowNode,
  type TextNode,
  type TextPart,
  type UiNode,
  resolveLazyNode,
} from 'foldkit/renderers'
import { type ReactElement, type ReactNode, memo, useMemo } from 'react'
import {
  Image,
  Linking,
  Platform,
  Pressable,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'

import { useBound, useScreen } from '@foldkit/react/interaction'

import { useLook } from '../theme/themed.js'
import { TextField, TokenField } from './field.js'
import { containerPropsOf, hostPropsOf } from './host.js'
import { Icon } from './icon.js'
import { ListFrame, ProgressBar, paintRows } from './list.js'
import { type Look, lightLook } from './look.js'
import {
  type Paint,
  type PaintHandlers,
  type PaintStyles,
  hasNodeOf,
} from './paint.js'
import { SeekBar } from './seek.js'
import { TranscriptView } from './transcript.js'

export type { Paint, PaintHandlers, PaintStyles } from './paint.js'

/**
 * Follows a screen's text link where `Navigation.linkTargetOf` decides,
 * the same decision every web adapter makes: `/counter/session` opens in
 * the Program, and anything else opens through the device.
 *
 * @example
 * ```tsx
 * paintTree(node, { onPress, onLink: openLinkOf(bound) })
 * ```
 */
export const openLinkOf =
  (
    bound: Readonly<{
      ownsUri: (uri: string) => boolean
      openUri: (uri: string, via: Navigation.UriVia) => boolean
    }>,
  ) =>
  (href: string): void =>
    M.value(
      Navigation.linkTargetOf(href, {
        ownsUri: bound.ownsUri,
        maybeCurrentUri: Option.none(),
        hostPages: 'ProgramOnly',
      }),
    ).pipe(
      M.withReturnType<void>(),
      M.tagsExhaustive({
        OpenInProgram: () => {
          bound.openUri(href, Navigation.Link())
        },
        ShowHostPage: () => {
          void Linking.openURL(href)
        },
        LoadDocument: () => {
          void Linking.openURL(href)
        },
      }),
    )

const monoFamily = Platform.select({ ios: 'Menlo', default: 'monospace' })

const gapUnit = 12

const paddingUnit = 8

const readingMeasure = 720

const minColumnGap = 8

const buttonRadius = 10

const iconSize = 22

const iconButtonSize = 44

const primaryIconButtonSize = 56

const pillHeight = 36

const tabLabelSize = 11

const disabledOpacity = 0.4

// TEXT

const styleOfText = (text: TextNode, paint: Paint): TextStyle => {
  const { colors, sizes } = paint.look
  return {
    color: colors.Text,
    fontSize: sizes.bodySize,
    ...(text.emphasis === 'Display'
      ? {
          fontSize: sizes.displaySize,
          fontVariant: ['tabular-nums'],
          fontWeight: '600',
          textAlign: 'center',
        }
      : {}),
    ...(text.emphasis === 'Headline'
      ? { fontSize: sizes.headlineSize, fontWeight: '700' }
      : {}),
    ...(text.dim === true
      ? { color: colors.QuietText, fontSize: sizes.dimSize, fontWeight: '400' }
      : {}),
    ...(text.mono === true ? { fontFamily: monoFamily } : {}),
  }
}

const paintReference = (
  reference: ReferencePart,
  key: number,
  paint: Paint,
): ReactElement => {
  const { colors } = paint.look
  const href = reference.href
  return (
    <Text
      key={key}
      accessibilityRole={href === undefined ? 'text' : 'link'}
      onPress={
        href === undefined
          ? undefined
          : () => {
              paint.onLink(href)
            }
      }
      style={{ color: href === undefined ? colors.Text : colors.Link }}
    >
      <Text style={{ fontWeight: '600' }}>{reference.label}</Text>
      {reference.title === undefined ? null : ` ${reference.title}`}
      {reference.state === undefined ? null : (
        <Text style={{ color: colors.QuietText }}>
          {` [${reference.state}]`}
        </Text>
      )}
    </Text>
  )
}

const paintPart = (part: TextPart, key: number, paint: Paint): ReactNode =>
  M.value(part).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      Plain: ({ text }) => text,
      Reference: reference => paintReference(reference, key, paint),
    }),
  )

const paintText = (text: TextNode, paint: Paint): ReactElement => {
  const { colors } = paint.look
  const href = text.href
  const image = text.image
  const follow =
    href === undefined
      ? undefined
      : () => {
          paint.onLink(href)
        }
  if (image !== undefined) {
    const picture = (
      <Image
        accessibilityLabel={text.content}
        source={{ uri: image.src }}
        style={{
          alignSelf: paint.isCentered ? 'center' : 'flex-start',
          borderRadius: 6,
          height: image.height,
          width: image.width,
        }}
      />
    )
    return follow === undefined ? (
      picture
    ) : (
      <Pressable
        accessibilityLabel={text.content}
        accessibilityRole="link"
        onPress={follow}
      >
        {picture}
      </Pressable>
    )
  }
  const style = [styleOfText(text, paint), paint.styles.Text]
  if (text.parts !== undefined) {
    return (
      <Text accessibilityLabel={text.label} style={style}>
        {Array.map(text.parts, (part, index) => paintPart(part, index, paint))}
      </Text>
    )
  } else if (follow === undefined) {
    return (
      <Text
        accessibilityLabel={text.label}
        accessibilityRole={text.emphasis === 'Headline' ? 'header' : 'text'}
        selectable={text.copyable === true}
        style={style}
      >
        {text.content}
      </Text>
    )
  } else {
    return (
      <Text
        accessibilityLabel={text.label}
        accessibilityRole="link"
        onPress={follow}
        style={[
          ...style,
          { color: colors.Link, textDecorationLine: 'underline' },
        ]}
      >
        {text.content}
      </Text>
    )
  }
}

// BUTTON

/**
 * What a screen reader says about a Button after its name: what a press
 * does, from its Action's declaration, and why it is unavailable. None
 * for a Button with nothing to add.
 *
 * @example
 * ```typescript
 * hintOf({ label: 'Reset', description: 'Sets the count to 0', disabled: true, because: 'count is already 0' })
 * // 'Sets the count to 0. Unavailable: count is already 0'
 * ```
 */
export const hintOf = (button: ButtonNode): string | undefined =>
  Option.getOrUndefined(
    Option.filter(
      Option.map(
        Interaction.controlHintOf(button, 'Touch', 'Native'),
        hint => hint.spoken,
      ),
      spoken => spoken !== '',
    ),
  )

type ButtonLook = Readonly<{
  box: ViewStyle
  label: TextStyle
  ink: string
  iconSize: number
}>

const buttonLookOf = (button: ButtonNode, look: Look): ButtonLook => {
  const { colors, sizes } = look
  const isIconOnly = button.isIconOnly === true && button.icon !== undefined
  const isDisabled = button.disabled === true
  const variant = button.variant ?? 'Primary'
  const labelBase: TextStyle = {
    fontSize: sizes.buttonLabelSize,
    fontWeight: '500',
    textAlign: 'center',
  }
  const boxBase: ViewStyle = {
    alignItems: 'center',
    borderRadius: buttonRadius,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: sizes.buttonHeight,
    minWidth: isIconOnly ? iconButtonSize : sizes.buttonMinWidth,
    paddingHorizontal: isIconOnly ? 0 : sizes.buttonPaddingX,
  }
  return M.value(variant).pipe(
    M.withReturnType<ButtonLook>(),
    M.when('Primary', () => ({
      box: {
        ...boxBase,
        backgroundColor: isDisabled ? colors.ButtonDisabled : colors.Button,
        ...(isIconOnly
          ? {
              borderRadius: primaryIconButtonSize / 2,
              height: primaryIconButtonSize,
              minHeight: primaryIconButtonSize,
              minWidth: primaryIconButtonSize,
              width: primaryIconButtonSize,
            }
          : {}),
      },
      label: { ...labelBase, color: colors.ButtonLabel },
      ink: colors.ButtonLabel,
      iconSize: isIconOnly ? 26 : 18,
    })),
    M.when('Ghost', () => ({
      box: {
        ...boxBase,
        ...(isIconOnly
          ? { minHeight: iconButtonSize }
          : { borderColor: colors.Border, borderWidth: 1 }),
        ...(isDisabled ? { opacity: disabledOpacity } : {}),
      },
      label: { ...labelBase, color: colors.Text },
      ink: colors.Text,
      iconSize: isIconOnly ? iconSize : 18,
    })),
    M.when('Destructive', () => ({
      box: {
        ...boxBase,
        backgroundColor: colors.DangerSoft,
        ...(isDisabled ? { opacity: disabledOpacity } : {}),
      },
      label: { ...labelBase, color: colors.DangerStrong },
      ink: colors.DangerStrong,
      iconSize: 18,
    })),
    M.when('Tab', () => {
      const ink = button.isCurrent === true ? colors.Accent : colors.QuietText
      return {
        box: {
          ...boxBase,
          flex: 1,
          flexDirection: 'column',
          gap: 2,
          minWidth: 0,
          ...(isDisabled ? { opacity: disabledOpacity } : {}),
        },
        label: { ...labelBase, color: ink, fontSize: tabLabelSize },
        ink,
        iconSize,
      }
    }),
    M.when('Pill', () => ({
      box: {
        ...boxBase,
        backgroundColor: colors.RaisedSurface,
        borderColor: colors.Border,
        borderRadius: pillHeight / 2,
        borderWidth: 1,
        minHeight: pillHeight,
        ...(isDisabled ? { opacity: disabledOpacity } : {}),
      },
      label: { ...labelBase, color: colors.Text },
      ink: colors.Text,
      iconSize: 16,
    })),
    M.exhaustive,
  )
}

const paintButton = (button: ButtonNode, paint: Paint): ReactElement => {
  const isDisabled = button.disabled === true
  const isIconOnly = button.isIconOnly === true && button.icon !== undefined
  const drawn = buttonLookOf(button, paint.look)
  const host = hostPropsOf(Slot.ofButton(button), paint, button.label)
  return (
    <Pressable
      accessibilityHint={hintOf(button)}
      accessibilityLabel={button.label}
      accessibilityRole={
        host.accessibilityRole ?? (button.variant === 'Tab' ? 'tab' : 'button')
      }
      accessibilityState={{
        disabled: isDisabled,
        selected: button.isCurrent === true,
        ...host.accessibilityState,
      }}
      accessibilityValue={host.accessibilityValue}
      disabled={isDisabled}
      hitSlop={isIconOnly ? 6 : 0}
      onLongPress={host.onLongPress}
      onPress={() => {
        paint.onPress(button)
      }}
      style={[drawn.box, paint.styles.Button]}
    >
      {button.icon === undefined ? null : (
        <Icon color={drawn.ink} name={button.icon} size={drawn.iconSize} />
      )}
      {isIconOnly ? null : (
        <Text numberOfLines={1} style={[drawn.label, paint.styles.ButtonLabel]}>
          {button.label}
        </Text>
      )}
    </Pressable>
  )
}

// LAYOUT

const isWide = (node: UiNode): boolean =>
  node._tag === 'List' ||
  node._tag === 'Seek' ||
  node._tag === 'Transcript' ||
  node._tag === 'TextInput' ||
  node._tag === 'Progress' ||
  ((node._tag === 'Row' || node._tag === 'Column' || node._tag === 'Box') &&
    Array.some(node.children, isWide))

const isPlatformButton = (node: UiNode, paint: Paint): boolean =>
  node._tag === 'Button' &&
  node.action !== undefined &&
  Array.contains(paint.platformActions, node.action)

const isPlatformTitle = (node: UiNode, paint: Paint): boolean =>
  node._tag === 'Text' &&
  node.emphasis === 'Headline' &&
  node.content === paint.maybePlatformTitle

const isEmptyOf = (node: UiNode, paint: Paint): boolean =>
  isPlatformButton(node, paint) ||
  isPlatformTitle(node, paint) ||
  ((node._tag === 'Row' || node._tag === 'Column') &&
    Array.every(node.children, child => isEmptyOf(child, paint)))

const hasDisplay = (children: ReadonlyArray<UiNode>): boolean =>
  Array.some(
    children,
    child => child._tag === 'Text' && child.emphasis === 'Display',
  )

const rowStyleOf = (row: RowNode, paint: Paint): ViewStyle => {
  const gap = Math.max(1, row.gap) * gapUnit
  if (row.arrange === 'Toolbar') {
    return {
      alignItems: 'center',
      flexDirection: 'row',
      gap,
      justifyContent: 'space-between',
    }
  } else if (row.arrange === 'Split' || row.isBoard === true) {
    return { alignItems: 'stretch', flexDirection: 'column', gap }
  } else {
    return {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap,
      justifyContent: paint.isCentered ? 'center' : 'flex-start',
    }
  }
}

const roots = new WeakMap<PaintHandlers, Paint>()

const centered = new WeakMap<Paint, Paint>()

const onePainters = new WeakMap<Paint, (child: UiNode) => ReactElement>()

const childrenPainters = new WeakMap<
  Paint,
  (children: ReadonlyArray<UiNode>) => ReadonlyArray<ReactElement>
>()

const keptFor = <Key extends object, Value>(
  kept: WeakMap<Key, Value>,
  key: Key,
  make: () => Value,
): Value => {
  const known = kept.get(key)
  if (known !== undefined) {
    return known
  }
  const made = make()
  kept.set(key, made)
  return made
}

// NOTE: one node of a screen, painted again only when the node is another
// object. A screen's tree keeps the parts that did not change from one
// Model to the next (`sharedWith`), so a change in one row, or one label,
// repaints that part and leaves the rest of the screen alone.
const PaintedNode = memo(
  ({
    node,
    paintOne,
  }: Readonly<{
    node: UiNode
    paintOne: (node: UiNode) => ReactElement
  }>): ReactElement => paintOne(node),
)

/**
 * Paints a Program screen tree as React Native elements, in the look it
 * is told. A Button press reports the whole node, so a Client sends its
 * Catalog `action`. A Button says what its Action declares as its hint,
 * with why it is unavailable, and a Text with a `label` announces the
 * label instead of its content. Colors come from the look's roles; a
 * tree painted with no look is light.
 *
 * @example
 * ```tsx
 * paintTree(counterScreen({ count: 3 }), {
 *   onPress: button => console.log(button.action),
 *   look: lookOf('Dark'),
 * })
 * ```
 */
export const paintTree = (
  node: UiNode,
  handlers: PaintHandlers,
): ReactElement => {
  const onLink =
    handlers.onLink ??
    ((href: string): void => {
      void Linking.openURL(href)
    })
  // NOTE: one Paint for one set of handlers, and one centered Paint for
  // each Paint, kept for as long as the handlers are: a part that is
  // painted again only when what it is given is another object is given
  // the same Paint every time.
  const root: Paint = keptFor(roots, handlers, () => ({
    look: handlers.look ?? lightLook,
    styles: handlers.styles ?? {},
    onPress: handlers.onPress,
    onInput: handlers.onInput,
    onLink,
    platformActions: handlers.platformActions ?? [],
    maybePlatformTitle: handlers.platformTitle,
    isCentered: handlers.isCentered === true,
    maybeFocusedAction: handlers.focusedAction,
  }))
  const paintOneWith = (paint: Paint): ((child: UiNode) => ReactElement) =>
    keptFor(
      onePainters,
      paint,
      () => (child: UiNode) => paintNode(child, paint),
    )
  const paintChildrenWith = (
    paint: Paint,
  ): ((children: ReadonlyArray<UiNode>) => ReadonlyArray<ReactElement>) =>
    keptFor(
      childrenPainters,
      paint,
      () => (children: ReadonlyArray<UiNode>) => paintChildren(children, paint),
    )
  const keyFor = (child: UiNode, index: number): string =>
    child._tag === 'Button' && child.action !== undefined
      ? `button-${child.action}`
      : `${child._tag}-${index.toString()}`
  const paintChildren = (
    children: ReadonlyArray<UiNode>,
    paint: Paint,
  ): ReadonlyArray<ReactElement> =>
    Array.map(
      Array.filter(children, child => !isEmptyOf(child, paint)),
      (child, index) => (
        <PaintedNode
          key={keyFor(child, index)}
          node={child}
          paintOne={paintOneWith(paint)}
        />
      ),
    )
  const paintBox = (box: BoxNode, paint: Paint): ReactElement => {
    const { colors } = paint.look
    const layer = box.layer
    const base: ViewStyle = {
      alignSelf: 'stretch',
      padding: box.padding * paddingUnit,
    }
    if (layer !== undefined) {
      return (
        <View
          accessibilityLabel={layer.label}
          accessibilityViewIsModal={layer.kind === 'Dialog'}
          style={[
            base,
            {
              backgroundColor: colors.RaisedSurface,
              borderColor: colors.Border,
              borderRadius: paint.look.sizes.panelRadius,
              borderWidth: 1,
              padding: 16,
            },
            paint.styles.Box,
          ]}
        >
          {paintChildren(box.children, paint)}
        </View>
      )
    } else {
      return (
        <View
          {...containerPropsOf(Option.fromNullishOr(box.slot))}
          style={[
            base,
            box.measure === 'Reading'
              ? { alignSelf: 'center', maxWidth: readingMeasure, width: '100%' }
              : undefined,
            box.slot?.isHidden === true ? { display: 'none' } : undefined,
            paint.styles.Box,
          ]}
        >
          {paintChildren(box.children, paint)}
        </View>
      )
    }
  }
  const paintNode = (current: UiNode, paint: Paint): ReactElement =>
    M.value(current).pipe(
      M.withReturnType<ReactElement>(),
      M.tagsExhaustive({
        Text: text => paintText(text, paint),
        Button: button => paintButton(button, paint),
        TextInput: input =>
          input.action === undefined && input.clearAction === undefined ? (
            <TokenField input={input} paint={paint} />
          ) : (
            <TextField input={input} paint={paint} />
          ),
        Spacer: spacer => (
          <View
            style={[{ height: spacer.rows * gapUnit }, paint.styles.Spacer]}
          />
        ),
        Row: row => (
          <View
            {...containerPropsOf(Option.fromNullishOr(row.slot))}
            style={[rowStyleOf(row, paint), paint.styles.Row]}
          >
            {Array.map(
              Array.filter(row.children, child => !isEmptyOf(child, paint)),
              (child, index) =>
                isWide(child) && row.arrange !== 'Split' ? (
                  <View
                    key={keyFor(child, index)}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {paintNode(child, paint)}
                  </View>
                ) : (
                  <PaintedNode
                    key={keyFor(child, index)}
                    node={child}
                    paintOne={paintOneWith(paint)}
                  />
                ),
            )}
          </View>
        ),
        Column: column => {
          const inner: Paint = hasDisplay(column.children)
            ? keptFor(centered, paint, () => ({ ...paint, isCentered: true }))
            : paint
          return (
            <View
              {...containerPropsOf(Option.fromNullishOr(column.slot))}
              style={[
                {
                  alignItems: hasDisplay(column.children)
                    ? 'center'
                    : 'stretch',
                  alignSelf: 'stretch',
                  gap: Math.max(column.gap * gapUnit, minColumnGap),
                },
                paint.styles.Column,
              ]}
            >
              {paintChildren(column.children, inner)}
            </View>
          )
        },
        Box: box => paintBox(box, paint),
        Progress: progress => (
          <View
            accessibilityLabel={progress.label}
            accessibilityRole="progressbar"
            style={[{ alignSelf: 'stretch' }, paint.styles.Progress]}
          >
            <ProgressBar
              max={progress.max}
              paint={paint}
              value={progress.value}
            />
          </View>
        ),
        List: list =>
          list.filter === undefined && list.columns === undefined ? (
            paintRows(list, list.items, paint, paintChildrenWith(paint))
          ) : (
            <ListFrame
              list={list}
              paint={paint}
              paintChildren={paintChildrenWith(paint)}
            />
          ),
        Seek: seek => <SeekBar paint={paint} seek={seek} />,
        Transcript: transcript => (
          <TranscriptView
            paint={paint}
            paintNode={paintOneWith(paint)}
            transcript={transcript}
          />
        ),
        DeviceShell: shell => (
          <View style={paint.styles.DeviceShell}>
            {paintChildren(shell.children, paint)}
          </View>
        ),
        Lazy: lazy => paintNode(resolveLazyNode(lazy), paint),
      }),
    )
  return paintNode(node, root)
}

/** True when a screen holds words to read along with. */
export const hasTranscript = (node: UiNode): boolean =>
  hasNodeOf(node, 'Transcript')

/**
 * Paints the bound Program's screen tree in the look the nearest
 * `Themed` gives, and repaints only when the tree or the look changes. A
 * Button press sends its Catalog Action, so the screen needs no token
 * table.
 *
 * @example
 * ```tsx
 * <ProgramProvider bound={counter}>
 *   <Screen />
 * </ProgramProvider>
 * ```
 */
export const Screen = ({
  styles,
}: Readonly<{ styles?: PaintStyles }>): ReactElement | null => {
  const bound = useBound()
  const look = useLook()
  const maybeTree = useScreen()
  return useMemo(
    () =>
      Option.match(maybeTree, {
        onNone: () => null,
        onSome: tree =>
          paintTree(tree, {
            look,
            styles: styles ?? {},
            onPress: button => {
              if (button.action !== undefined) {
                bound.press(button.action)
              }
            },
            onLink: openLinkOf(bound),
          }),
      }),
    [bound, look, maybeTree, styles],
  )
}
