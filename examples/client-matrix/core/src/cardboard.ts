import {
  CardboardProgram,
  conversationLedgerPortableRoute,
  ruleZeroPortableRoute,
} from 'cardboard-core-example'
import { Array, Match as M, Option, Schema as S } from 'effect'

/** One canonical Cardboard state compared across Clients. */
export const CardboardMode = S.Literals(['RuleZero', 'ConversationLedger'])
/** One canonical Cardboard state compared across Clients. */
export type CardboardMode = typeof CardboardMode.Type

/** One Client that consumes the same Cardboard Program. */
export const CardboardClientId = S.Literals([
  'ReactWeb',
  'FoldkitView',
  'ExpoWeb',
  'EffectTui',
  'RawCli',
  'ExpoIos',
  'ExpoAndroid',
])
/** One Client that consumes the same Cardboard Program. */
export type CardboardClientId = typeof CardboardClientId.Type

/** The route behavior implemented by one Cardboard Client. */
export const CardboardRouteSupport = S.Literals([
  'DeepLink',
  'InteractiveTransition',
  'OneShot',
])
/** The route behavior implemented by one Cardboard Client. */
export type CardboardRouteSupport = typeof CardboardRouteSupport.Type

/** The strongest evidence currently recorded for one Cardboard matrix cell. */
export const CardboardEvidenceLevel = S.Literals([
  'WanBrowserInteraction',
  'LocalTerminalInteraction',
  'IosSimulatorVisual',
  'TypecheckedSource',
])
/** The strongest evidence currently recorded for one Cardboard matrix cell. */
export type CardboardEvidenceLevel = typeof CardboardEvidenceLevel.Type

/** One portable Cardboard state and route. */
export const CardboardModeDefinition = S.Struct({
  mode: CardboardMode,
  title: S.String,
  description: S.String,
  portableRoute: S.String,
})
/** One portable Cardboard state and route. */
export type CardboardModeDefinition = typeof CardboardModeDefinition.Type

/** Evidence for one Client rendering one portable Cardboard state. */
export const CardboardCapability = S.Struct({
  mode: CardboardMode,
  support: CardboardRouteSupport,
  evidenceLevel: CardboardEvidenceLevel,
  evidence: S.Array(S.String),
  maybeCapturePath: S.Option(S.String),
  limitation: S.String,
})
/** Evidence for one Client rendering one portable Cardboard state. */
export type CardboardCapability = typeof CardboardCapability.Type

/** One Cardboard Client and its host-owned route carrier. */
export const CardboardClientDefinition = S.Struct({
  clientId: CardboardClientId,
  title: S.String,
  description: S.String,
  capabilities: S.Array(CardboardCapability),
})
/** One Cardboard Client and its host-owned route carrier. */
export type CardboardClientDefinition = typeof CardboardClientDefinition.Type

/** The stable Program identity every Cardboard Client consumes unchanged. */
export const CardboardProgramIdentity = S.Struct({
  id: S.String,
  version: S.Int,
  source: S.String,
})
/** The stable Program identity every Cardboard Client consumes unchanged. */
export type CardboardProgramIdentity = typeof CardboardProgramIdentity.Type

/** The renderer-independent Cardboard Program consumed by every Client. */
export const cardboardProgramIdentity = CardboardProgramIdentity.make({
  id: CardboardProgram.id,
  version: CardboardProgram.version,
  source: 'examples/cardboard/core/src/program.ts',
})

/** The two canonical Cardboard states carried across every Client. */
export const cardboardModes: ReadonlyArray<CardboardModeDefinition> = [
  CardboardModeDefinition.make({
    mode: 'RuleZero',
    title: 'Rule Zero',
    description:
      'The black control is waiting at slash zero with accessible feedback.',
    portableRoute: ruleZeroPortableRoute,
  }),
  CardboardModeDefinition.make({
    mode: 'ConversationLedger',
    title: 'When /0 is four',
    description:
      'The conversation scale and append-only public decision ledger are visible.',
    portableRoute: conversationLedgerPortableRoute,
  }),
]

const capturePath = (
  mode: CardboardMode,
  clientSlug: string,
): Option.Option<string> =>
  Option.some(
    `/captures/cardboard/${M.value(mode).pipe(
      M.withReturnType<string>(),
      M.when('RuleZero', () => 'rule-zero'),
      M.when('ConversationLedger', () => 'conversation-ledger'),
      M.exhaustive,
    )}/${clientSlug}.webp`,
  )

const capability = (
  mode: CardboardMode,
  support: CardboardRouteSupport,
  evidenceLevel: CardboardEvidenceLevel,
  evidence: ReadonlyArray<string>,
  maybeCapturePath: Option.Option<string>,
  limitation: string,
): CardboardCapability =>
  CardboardCapability.make({
    mode,
    support,
    evidenceLevel,
    evidence,
    maybeCapturePath,
    limitation,
  })

const webCapabilities = (
  clientSlug: string,
  evidence: ReadonlyArray<string>,
): ReadonlyArray<CardboardCapability> =>
  Array.map(cardboardModes, definition =>
    capability(
      definition.mode,
      'DeepLink',
      'WanBrowserInteraction',
      evidence,
      capturePath(definition.mode, clientSlug),
      'Verified through the public HTTPS carrier and browser accessibility tree.',
    ),
  )

/** Every concrete Client currently consuming the shared Cardboard Program. */
export const cardboardClients: ReadonlyArray<CardboardClientDefinition> = [
  CardboardClientDefinition.make({
    clientId: 'ReactWeb',
    title: 'React',
    description: 'Shared React bindings with the standalone web presenter.',
    capabilities: webCapabilities('react', [
      'https://cardboard.knophy.com/0',
      'https://cardboard.knophy.com/0/0',
    ]),
  }),
  CardboardClientDefinition.make({
    clientId: 'FoldkitView',
    title: 'Foldkit',
    description: 'The canonical Foldkit HTML view over the same Model.',
    capabilities: webCapabilities('foldkit', [
      'https://cardboard-foldkit.knophy.com/0',
      'https://cardboard-foldkit.knophy.com/0/0',
    ]),
  }),
  CardboardClientDefinition.make({
    clientId: 'ExpoWeb',
    title: 'Expo Web',
    description: 'The React Native Showcase running through its web carrier.',
    capabilities: Array.map(cardboardModes, definition =>
      capability(
        definition.mode,
        'DeepLink',
        'TypecheckedSource',
        [
          'examples/react-native-showcase/src/App.tsx',
          'examples/cardboard/react-bindings/src/cardboard.tsx',
        ],
        Option.none(),
        'The production WAN export and captures are completed by the next build increment.',
      ),
    ),
  }),
  CardboardClientDefinition.make({
    clientId: 'EffectTui',
    title: 'Effect TUI',
    description: 'An interactive ANSI Client using Effect Platform Terminal.',
    capabilities: Array.map(cardboardModes, definition =>
      capability(
        definition.mode,
        'InteractiveTransition',
        'LocalTerminalInteraction',
        ['pnpm demo:cardboard:tui'],
        Option.none(),
        definition.mode === 'ConversationLedger'
          ? 'Press l to enter /0/0. Direct portable route input remains a framework gap.'
          : 'Starts at /0. Direct portable route input remains a framework gap.',
      ),
    ),
  }),
  CardboardClientDefinition.make({
    clientId: 'RawCli',
    title: 'Raw CLI',
    description: 'One-shot Effect CLI Commands with stdout presentation.',
    capabilities: [
      capability(
        'RuleZero',
        'OneShot',
        'LocalTerminalInteraction',
        ['pnpm --filter cardboard-cli-example cardboard show'],
        capturePath('RuleZero', 'cli'),
        'Prints the requested state and exits.',
      ),
      capability(
        'ConversationLedger',
        'OneShot',
        'LocalTerminalInteraction',
        ['pnpm --filter cardboard-cli-example cardboard log'],
        capturePath('ConversationLedger', 'cli'),
        'Prints the requested state and exits.',
      ),
    ],
  }),
  CardboardClientDefinition.make({
    clientId: 'ExpoIos',
    title: 'Expo iOS',
    description: 'The universal Expo application inside a native iOS stack.',
    capabilities: Array.map(cardboardModes, definition =>
      capability(
        definition.mode,
        'DeepLink',
        'IosSimulatorVisual',
        [
          'examples/react-native-showcase/src/App.tsx',
          definition.mode === 'RuleZero'
            ? 'examples/client-matrix/foldkit/public/captures/cardboard/rule-zero/expo-ios.webp'
            : 'examples/client-matrix/foldkit/public/captures/cardboard/conversation-ledger/expo-ios.webp',
        ],
        capturePath(definition.mode, 'expo-ios'),
        'Native launch, deep-link reconstruction, and final rendering were observed in Simulator. Native touch and physical-device behavior remain unverified.',
      ),
    ),
  }),
  CardboardClientDefinition.make({
    clientId: 'ExpoAndroid',
    title: 'Expo Android',
    description: 'The same universal Expo application on Android.',
    capabilities: Array.map(cardboardModes, definition =>
      capability(
        definition.mode,
        'DeepLink',
        'TypecheckedSource',
        ['examples/react-native-showcase/src/App.tsx'],
        Option.none(),
        'Shared source typechecks, but no Android emulator interaction is claimed in this increment.',
      ),
    ),
  }),
]

/** Returns the exact host-owned carrier for one portable Cardboard route. */
export const cardboardCarrierForClient = (
  clientId: CardboardClientId,
  mode: CardboardMode,
): string => {
  const portableRoute = M.value(mode).pipe(
    M.withReturnType<string>(),
    M.when('RuleZero', () => ruleZeroPortableRoute),
    M.when('ConversationLedger', () => conversationLedgerPortableRoute),
    M.exhaustive,
  )
  return M.value(clientId).pipe(
    M.withReturnType<string>(),
    M.when('ReactWeb', () => `https://cardboard.knophy.com${portableRoute}`),
    M.when(
      'FoldkitView',
      () => `https://cardboard-foldkit.knophy.com${portableRoute}`,
    ),
    M.when('ExpoWeb', () => `https://expodemo.knophy.com${portableRoute}`),
    M.when('EffectTui', () => 'pnpm demo:cardboard:tui'),
    M.when('RawCli', () =>
      mode === 'RuleZero'
        ? 'pnpm --filter cardboard-cli-example cardboard show'
        : 'pnpm --filter cardboard-cli-example cardboard log',
    ),
    M.when('ExpoIos', () => `foldkit://showcase${portableRoute}`),
    M.when('ExpoAndroid', () => `foldkit://showcase${portableRoute}`),
    M.exhaustive,
  )
}

/** Finds one Client capability for one Cardboard state. */
export const capabilityForCardboardMode = (
  client: CardboardClientDefinition,
  mode: CardboardMode,
): Option.Option<CardboardCapability> =>
  Array.findFirst(client.capabilities, capability => capability.mode === mode)
