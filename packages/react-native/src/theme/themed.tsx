import {
  type AppearanceState,
  type Theme,
  contrastOfState,
  defaultTheme,
  modeOfState,
} from 'foldkit/theme'
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
  useMemo,
} from 'react'

import { type Look, lightLook, lookOf } from '../interaction/look.js'

// THEMED

const LookContext = createContext<Look>(lightLook)

/**
 * The look every painter below is told to draw with. Outside a
 * {@link Themed} it is the light look.
 */
export const useLook = (): Look => useContext(LookContext)

/**
 * Tells every painter below the look the Program resolved: the mode and
 * contrast of its appearance state, in a theme. The state is the
 * Model's; nothing here asks the system.
 *
 * @example
 * ```tsx
 * <Themed appearance={model.appearance}>
 *   <FoldkitRouterStack />
 * </Themed>
 * ```
 */
export const Themed = ({
  appearance,
  theme,
  children,
}: Readonly<{
  appearance: AppearanceState
  theme?: Theme
  children: ReactNode
}>): ReactElement => {
  const mode = modeOfState(appearance)
  const contrast = contrastOfState(appearance)
  const look = useMemo(
    () => lookOf(mode, contrast, theme ?? defaultTheme),
    [mode, contrast, theme],
  )
  return <LookContext.Provider value={look}>{children}</LookContext.Provider>
}
