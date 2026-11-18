import { Array } from 'effect'
import { type IconName, iconDrawings } from 'foldkit/renderers'
import type { ReactElement } from 'react'
import { Path, Svg, Text as SvgText } from 'react-native-svg'

const gridSize = 24

const strokeWidth = 2

const figureSize = 7

/**
 * One icon from the shared set, drawn from the same paths every graphical
 * painter draws, in one color.
 *
 * @example
 * ```tsx
 * <Icon name="Play" size={22} color={look.colors.ButtonLabel} />
 * ```
 */
export const Icon = ({
  name,
  size,
  color,
}: Readonly<{ name: IconName; size: number; color: string }>): ReactElement => {
  const drawing = iconDrawings[name]
  return (
    <Svg
      accessibilityElementsHidden
      height={size}
      importantForAccessibility="no-hide-descendants"
      viewBox={`0 0 ${gridSize.toString()} ${gridSize.toString()}`}
      width={size}
    >
      {Array.map(drawing.strokes, (path, index) => (
        <Path
          key={`stroke-${index.toString()}`}
          d={path}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
        />
      ))}
      {Array.map(drawing.fills, (path, index) => (
        <Path key={`fill-${index.toString()}`} d={path} fill={color} />
      ))}
      {drawing.figure === undefined ? null : (
        <SvgText
          fill={color}
          fontSize={figureSize}
          fontWeight="700"
          textAnchor="middle"
          x={gridSize / 2}
          y={14.5}
        >
          {drawing.figure}
        </SvgText>
      )}
    </Svg>
  )
}
