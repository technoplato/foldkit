import { Match as M } from 'effect'
import type { ReactElement, ReactNode } from 'react'
import { Text, View } from 'react-native'

import { useStatus } from '@foldkit/react/interaction'

import { useLook } from '../theme/themed.js'

const statusPadding = 24

const StatusText = ({
  description,
}: Readonly<{ description: string }>): ReactElement => {
  const look = useLook()
  return (
    <View
      accessibilityRole="summary"
      style={{
        alignItems: 'center',
        backgroundColor: look.colors.PageGround,
        flex: 1,
        justifyContent: 'center',
        padding: statusPadding,
      }}
    >
      <Text
        style={{
          color: look.colors.Text,
          fontSize: look.sizes.bodySize,
          textAlign: 'center',
        }}
      >
        {description}
      </Text>
    </View>
  )
}

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
