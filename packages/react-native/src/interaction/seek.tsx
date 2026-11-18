import { Option } from 'effect'
import { type SeekNode, seekLandingAt } from 'foldkit/renderers'
import { type ReactElement, useMemo, useRef, useState } from 'react'
import { PanResponder, Text, View } from 'react-native'

import { percentOf } from './look.js'
import { type Paint, pressOf } from './paint.js'

const trackHeight = 4

const thumbSize = 18

const touchHeight = 32

/**
 * The value a seek bar holds at a fraction of its width: between its
 * `min` and `max`, on one of its steps.
 *
 * @example
 * ```typescript
 * seekValueAt({ min: 0, max: 4_800_000, step: 1000 }, 0.5) // 2_400_000
 * seekValueAt({ max: 100, step: 30 }, 1.4) // 100
 * ```
 */
export const seekValueAt = (
  seek: Pick<SeekNode, 'min' | 'max' | 'step'>,
  fraction: number,
): number => {
  const min = seek.min ?? 0
  const within = Math.min(1, Math.max(0, fraction))
  const raw = min + within * (seek.max - min)
  const step = seek.step > 0 ? seek.step : 1
  const stepped = min + Math.round((raw - min) / step) * step
  return Math.min(seek.max, Math.max(min, stepped))
}

/** How far along its bar a seek's value is, from 0 to 1. */
export const seekFractionOf = (
  seek: Pick<SeekNode, 'min' | 'max'>,
  value: number,
): number => {
  const min = seek.min ?? 0
  const span = seek.max - min
  return span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0
}

/**
 * A seek bar. It follows the Program's place until a person grabs it,
 * shows where they drag and what the drag will land on, and presses
 * `SeekTo:<value>` once, when they let go, so a drag never restarts the
 * audio at every step.
 */
export const SeekBar = ({
  seek,
  paint,
}: Readonly<{ seek: SeekNode; paint: Paint }>): ReactElement => {
  const { colors, sizes } = paint.look
  const [maybeDragged, setMaybeDragged] = useState<Option.Option<number>>(
    Option.none(),
  )
  const width = useRef(0)
  const live = useRef({ seek, onPress: paint.onPress })
  live.current = { seek, onPress: paint.onPress }
  const isDisabled = seek.disabled === true
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isDisabled,
        onMoveShouldSetPanResponder: () => !isDisabled,
        onPanResponderGrant: event => {
          setMaybeDragged(
            Option.some(
              seekValueAt(
                live.current.seek,
                event.nativeEvent.locationX / Math.max(1, width.current),
              ),
            ),
          )
        },
        onPanResponderMove: event => {
          setMaybeDragged(
            Option.some(
              seekValueAt(
                live.current.seek,
                event.nativeEvent.locationX / Math.max(1, width.current),
              ),
            ),
          )
        },
        onPanResponderRelease: event => {
          const now = live.current
          const value = seekValueAt(
            now.seek,
            event.nativeEvent.locationX / Math.max(1, width.current),
          )
          setMaybeDragged(Option.none())
          now.onPress(
            pressOf(`${now.seek.action}:${value.toString()}`, now.seek.label),
          )
        },
        onPanResponderTerminate: () => {
          setMaybeDragged(Option.none())
        },
      }),
    [isDisabled],
  )
  const value = Option.getOrElse(maybeDragged, () => seek.value)
  const maybeLanding = Option.flatMap(maybeDragged, dragged =>
    seekLandingAt(seek, dragged),
  )
  const fraction = seekFractionOf(seek, value)
  const valueText = Option.match(maybeLanding, {
    onNone: () => seek.valueText,
    onSome: landing => landing.text,
  })
  return (
    <View
      accessibilityLabel={seek.label}
      accessibilityRole="adjustable"
      accessibilityState={{ disabled: isDisabled }}
      accessibilityValue={{ text: valueText }}
      style={[{ alignSelf: 'stretch', gap: 4 }, paint.styles.Seek]}
    >
      <View
        {...responder.panHandlers}
        onLayout={event => {
          width.current = event.nativeEvent.layout.width
        }}
        style={{ height: touchHeight, justifyContent: 'center' }}
      >
        <View
          pointerEvents="none"
          style={{
            backgroundColor: colors.Rule,
            borderRadius: trackHeight / 2,
            height: trackHeight,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              backgroundColor: colors.Accent,
              height: trackHeight,
              width: percentOf(fraction),
            }}
          />
        </View>
        <View
          pointerEvents="none"
          style={{
            backgroundColor: isDisabled ? colors.ButtonDisabled : colors.Accent,
            borderRadius: thumbSize / 2,
            height: thumbSize,
            left: percentOf(fraction),
            marginLeft: -thumbSize / 2,
            position: 'absolute',
            width: thumbSize,
          }}
        />
      </View>
      {Option.match(maybeLanding, {
        onNone: () => null,
        onSome: landing => (
          <Text
            numberOfLines={2}
            style={{
              color: colors.Text,
              fontSize: sizes.codeSize,
              fontVariant: ['tabular-nums'],
            }}
          >
            {landing.text}
          </Text>
        ),
      })}
    </View>
  )
}
