import { Match as M } from 'effect'
import { Interaction } from 'foldkit'
import type { ReactElement, ReactNode } from 'react'
import { Text, type TextStyle, View, type ViewStyle } from 'react-native'

import { useStatus } from '@foldkit/react/interaction'

const statusPadding = 24

const statusViewStyle: ViewStyle = {
  alignItems: 'center',
  flex: 1,
  justifyContent: 'center',
  padding: statusPadding,
}

const statusTextStyle: TextStyle = {
  color: Interaction.screenLook.textColor,
  fontSize: Interaction.screenLook.bodySize,
  textAlign: 'center',
}

const StatusText = ({
  description,
}: Readonly<{ description: string }>): ReactElement => (
  <View accessibilityRole="summary" style={statusViewStyle}>
    <Text style={statusTextStyle}>{description}</Text>
  </View>
)

/**
 * Paints `children` once the Program is Ready, and the Program's own
 * description while it is Starting or Failed, so a native host writes no
 * status text: `Starting Counter…`, then the count.
 *
 * @example
 * ```tsx
 * <WhenReady>
 *   <FoldkitStack />
 * </WhenReady>
 * ```
 */
export const WhenReady = ({
  children,
}: Readonly<{ children: ReactNode }>): ReactElement =>
  M.value(useStatus()).pipe(
    M.withReturnType<ReactElement>(),
    M.tagsExhaustive({
      Ready: () => <>{children}</>,
      Starting: ({ description }) => <StatusText description={description} />,
      Failed: ({ description }) => <StatusText description={description} />,
    }),
  )
