import { Array, Option } from 'effect'

/**
 * Deterministic expo-router file generation from the Program route table.
 *
 * One source of truth: the same routers that print deep-link paths decide
 * which files exist. Regeneration is idempotent; tests assert byte equality
 * across runs so checked-in output cannot drift silently.
 */

/** One generated expo-router screen file. */
export type ExpoRouteFile = Readonly<{
  /** Path relative to the expo app directory, e.g. app/counters/index.tsx. */
  readonly path: string
  readonly content: string
}>

const indexRedirect = `import { Redirect } from 'expo-router'

export default function CountersIndexRedirect() {
  return <Redirect href="/counters" />
}
`

const listScreen = `import { CountersRouteScreen } from '../routerRuntime'

export default function CountersListRoute() {
  return <CountersRouteScreen path="/counters" />
}
`

const detailScreen = `import {
  counterPathFromProps,
  CountersRouteScreen,
} from '../../routerRuntime'

export default function CounterDetailRoute(props: {
  readonly params?: { readonly counterId?: string }
}) {
  return (
    <CountersRouteScreen path={counterPathFromProps(props.params)} />
  )
}
`

const modalScreen = (options: {
  readonly componentName: string
  readonly helperName: string
  readonly presentation: 'modal' | 'transparentModal'
}): string => `import {
  ${options.helperName},
  CountersRouteScreen,
} from '../../../routerRuntime'

export default function ${options.componentName}(props: {
  readonly params?: { readonly counterId?: string }
}) {
  return (
    <CountersRouteScreen
      path={${options.helperName}(props.params)}
      presentation="${options.presentation}"
    />
  )
}
`

/** Sheet presents as a content modal; Dialog presents as a transparent decision layer. */
const factModalScreen = modalScreen({
  componentName: 'CounterFactAlertRoute',
  helperName: 'factPathFromProps',
  presentation: 'modal',
})

const deleteModalScreen = modalScreen({
  componentName: 'DeleteCounterConfirmationRoute',
  helperName: 'deletePathFromProps',
  presentation: 'transparentModal',
})

const runtimeHelpers = `const MISSING_COUNTER_ID = ''

const counterSubPath = (
  kind: 'fact' | 'delete',
  params?: { readonly counterId?: string },
): string => \`/counters/\${params?.counterId ?? MISSING_COUNTER_ID}/\${kind}\`

export const counterPathFromProps = (
  params?: { readonly counterId?: string },
): string => \`/counters/\${params?.counterId ?? MISSING_COUNTER_ID}\`

export const factPathFromProps = (
  params?: { readonly counterId?: string },
): string => counterSubPath('fact', params)

export const deletePathFromProps = (
  params?: { readonly counterId?: string },
): string => counterSubPath('delete', params)
`

/** Every expo-router file this Program requires, in stable order. */
export const expoRouterFiles = (): ReadonlyArray<ExpoRouteFile> => [
  { path: 'app/routerRuntime.helpers.ts', content: runtimeHelpers },
  { path: 'app/index.tsx', content: indexRedirect },
  { path: 'app/counters/index.tsx', content: listScreen },
  { path: 'app/counters/[counterId].tsx', content: detailScreen },
  { path: 'app/counters/[counterId]/fact.tsx', content: factModalScreen },
  {
    path: 'app/counters/[counterId]/delete.tsx',
    content: deleteModalScreen,
  },
]

/** Finds one generated file by its app-relative path. */
export const expoRouterFileFor = (path: string): Option.Option<ExpoRouteFile> =>
  Array.findFirst(expoRouterFiles(), file => file.path === path)
