import { Array, Effect, Option, Schema as S } from 'effect'
import { Processor } from 'foldkit'
import * as Program from 'foldkit/program'
import {
  fromHost,
  fromJournal,
  makeProgramJournal,
} from 'foldkit/program-runtime'
import {
  BalanceSnapshot,
  ImportedAddressBookEntries,
  LoadedPortfolio,
  PortfolioSnapshot,
  WalletProgram,
  initialModel,
} from 'wallet-core-example'

/** One portable Wallet route mode audited across client hosts. */
export const WalletRouteMode = S.Literals(['StateRoute', 'ReplayRoute'])
/** One portable Wallet route mode audited across client hosts. */
export type WalletRouteMode = typeof WalletRouteMode.Type

/** One client surface expected to carry the Wallet Program. */
export const WalletClientId = S.Literals([
  'ReactWeb',
  'FoldkitView',
  'RawCli',
  'EffectTerminal',
  'OpenTui',
  'ExpoWeb',
  'ExpoIos',
  'ExpoAndroid',
  'FutureServer',
])
/** One client surface expected to carry the Wallet Program. */
export type WalletClientId = typeof WalletClientId.Type

/** How a person or caller interacts with one Wallet Client. */
export const WalletInteractionSurface = S.Literals([
  'Graphical',
  'TerminalUI',
  'LineTerminal',
  'OneShotCLI',
  'ServerRequest',
])
/** How a person or caller interacts with one Wallet Client. */
export type WalletInteractionSurface = typeof WalletInteractionSurface.Type

/** The presentation technology used by one Wallet Client. */
export const WalletRenderer = S.Literals([
  'React',
  'FoldkitView',
  'ReactNative',
  'OpenTuiReact',
  'Text',
  'None',
])
/** The presentation technology used by one Wallet Client. */
export type WalletRenderer = typeof WalletRenderer.Type

/** The execution platform used by one Wallet Client. */
export const WalletPlatform = S.Literals([
  'Web',
  'Node',
  'Ios',
  'Android',
  'Server',
])
/** The execution platform used by one Wallet Client. */
export type WalletPlatform = typeof WalletPlatform.Type

/** The composition and launch owner of one Wallet Client. */
export const WalletHost = S.Literals([
  'Vite',
  'Expo',
  'EffectPlatform',
  'ServerProcess',
])
/** The composition and launch owner of one Wallet Client. */
export type WalletHost = typeof WalletHost.Type

/** The Client-owned carrier around a portable Wallet URI. */
export const WalletUriCarrier = S.Literals([
  'HttpsUrl',
  'CustomSchemeUrl',
  'CommandLineArgument',
  'RequestUrl',
  'None',
])
/** The Client-owned carrier around a portable Wallet URI. */
export type WalletUriCarrier = typeof WalletUriCarrier.Type

/** Runtime behavior one Wallet Processor occurrence can expose. */
export const WalletProcessorRuntimeMode = S.Literals([
  'Live',
  'InertReplay',
  'LiveBranchFromReplay',
  'OneShot',
])
/** Runtime behavior one Wallet Processor occurrence can expose. */
export type WalletProcessorRuntimeMode = typeof WalletProcessorRuntimeMode.Type

/** Whether the current Client advertises a runtime Processor Descriptor. */
export const WalletProcessorStatus = S.Literals([
  'HostedUnadvertised',
  'CaptiveUnadvertised',
  'NoHost',
])
/** Whether the current Client advertises a runtime Processor Descriptor. */
export type WalletProcessorStatus = typeof WalletProcessorStatus.Type

/** Exact Processor evidence for one Wallet Client. */
export const WalletProcessorDefinition = S.Struct({
  status: WalletProcessorStatus,
  runtimeModes: S.Array(WalletProcessorRuntimeMode),
  maybeDescriptor: S.Option(Processor.Descriptor),
  limitation: S.String,
})
/** Exact Processor evidence for one Wallet Client. */
export type WalletProcessorDefinition = typeof WalletProcessorDefinition.Type

/** The rendering artifact expected from one Wallet Client. */
export const WalletCaptureKind = S.Literals(['Screenshot', 'TextCapture'])
/** The rendering artifact expected from one Wallet Client. */
export type WalletCaptureKind = typeof WalletCaptureKind.Type

/** Whether a Wallet rendering artifact is checked in. */
export const WalletCaptureStatus = S.Literals([
  'CheckedIn',
  'Missing',
  'Unsupported',
])
/** Whether a Wallet rendering artifact is checked in. */
export type WalletCaptureStatus = typeof WalletCaptureStatus.Type

/** Pixel dimensions of one checked-in Wallet rendering artifact. */
export const WalletCaptureDimensions = S.Struct({
  width: S.Int,
  height: S.Int,
})
/** Pixel dimensions of one checked-in Wallet rendering artifact. */
export type WalletCaptureDimensions = typeof WalletCaptureDimensions.Type

/** Exact capture path and reproduction evidence for one Wallet Client. */
export const WalletCaptureDefinition = S.Struct({
  kind: WalletCaptureKind,
  status: WalletCaptureStatus,
  routeMode: WalletRouteMode,
  portableRoute: S.String,
  maybePath: S.Option(S.String),
  maybeCaptureCommand: S.Option(S.String),
  maybeDimensions: S.Option(WalletCaptureDimensions),
  maybeEvidenceDate: S.Option(S.String),
  limitation: S.String,
})
/** Exact capture path and reproduction evidence for one Wallet Client. */
export type WalletCaptureDefinition = typeof WalletCaptureDefinition.Type

/** The implementation boundary reached by one Wallet route mode. */
export const WalletRouteSupport = S.Literals([
  'Implemented',
  'LiveBranchOnly',
  'AdapterReady',
  'ProgramOnly',
  'Planned',
  'Unsupported',
])
/** The implementation boundary reached by one Wallet route mode. */
export type WalletRouteSupport = typeof WalletRouteSupport.Type

/** The strongest checked-in evidence supporting one Wallet route claim. */
export const WalletEvidenceLevel = S.Literals([
  'FocusedTest',
  'AutomatedCapture',
  'SourceInspection',
  'Simulator',
  'Emulator',
  'PhysicalDevice',
  'NoEvidence',
  'NoHost',
])
/** The strongest checked-in evidence supporting one Wallet route claim. */
export type WalletEvidenceLevel = typeof WalletEvidenceLevel.Type

/** Program identity that every Wallet host must consume unchanged. */
export const WalletProgramIdentity = S.Struct({
  id: S.String,
  version: S.Int,
  source: S.String,
})
/** Program identity that every Wallet host must consume unchanged. */
export type WalletProgramIdentity = typeof WalletProgramIdentity.Type

/** One exact portable Wallet route generated by the shared Program router. */
export const WalletRouteDefinition = S.Struct({
  mode: WalletRouteMode,
  title: S.String,
  routeFamily: S.String,
  portableRoute: S.String,
  representativeState: S.String,
  semantics: S.String,
})
/** One exact portable Wallet route generated by the shared Program router. */
export type WalletRouteDefinition = typeof WalletRouteDefinition.Type

/** Evidence and limitations for one client carrying one Wallet route mode. */
export const WalletRouteCapability = S.Struct({
  mode: WalletRouteMode,
  support: WalletRouteSupport,
  evidenceLevel: WalletEvidenceLevel,
  evidence: S.Array(S.String),
  limitation: S.String,
})
/** Evidence and limitations for one client carrying one Wallet route mode. */
export type WalletRouteCapability = typeof WalletRouteCapability.Type

/** Route-carrier metadata for one Wallet client surface. */
export const WalletClientDefinition = S.Struct({
  clientId: WalletClientId,
  title: S.String,
  description: S.String,
  surface: WalletInteractionSurface,
  renderer: WalletRenderer,
  platform: WalletPlatform,
  host: WalletHost,
  carrier: WalletUriCarrier,
  maybeLaunchCommand: S.Option(S.String),
  maybeRouteCarrier: S.Option(S.String),
  processor: WalletProcessorDefinition,
  capture: WalletCaptureDefinition,
  capabilities: S.Array(WalletRouteCapability),
})
/** Route-carrier metadata for one Wallet client surface. */
export type WalletClientDefinition = typeof WalletClientDefinition.Type

/** The canonical Wallet Program identity audited by this matrix. */
export const walletProgramIdentity = WalletProgramIdentity.make({
  id: WalletProgram.id,
  version: WalletProgram.version,
  source: 'examples/wallet/core/src/program.ts',
})

const representativeWalletModel = {
  ...initialModel,
  portfolio: LoadedPortfolio.make({
    snapshot: PortfolioSnapshot.make({
      dataSource: 'Fixture',
      chains: [],
      networks: [],
      assets: [],
      accounts: [],
      balanceSnapshot: BalanceSnapshot.make({
        observedAt: 0,
        balances: [],
      }),
      receivingInstructions: [],
    }),
  }),
}

const walletRouter = Program.makeRouter(WalletProgram)
const representativeWalletStateRoute = Effect.runSync(
  walletRouter.print(Program.state(representativeWalletModel)),
)
const representativeWalletJournal = makeProgramJournal({
  program: WalletProgram,
  initialModel: representativeWalletModel,
  now: () => 0,
})
representativeWalletJournal.record({
  message: ImportedAddressBookEntries.make({ entries: [] }),
  source: fromHost(),
  isOperationSettled: true,
  commands: [],
  model: representativeWalletModel,
})
const representativeWalletReplayRoute = Effect.runSync(
  walletRouter.print(
    Program.replay(
      fromJournal(WalletProgram, representativeWalletJournal.read()),
    ),
  ),
)

/** Exact representative Wallet state and replay routes generated by WalletProgram. */
export const walletRoutes: ReadonlyArray<WalletRouteDefinition> = [
  WalletRouteDefinition.make({
    mode: 'StateRoute',
    title: 'State snapshot',
    routeFamily: '/wallet/state?model=<encoded Wallet Model>',
    portableRoute: representativeWalletStateRoute,
    representativeState:
      'Loaded public portfolio with zero accounts, an idle transaction, an idle signature, and no observed transactions.',
    semantics:
      'Starts from the exact public Model in the route. State routes do not restore Commands that preceded the snapshot.',
  }),
  WalletRouteDefinition.make({
    mode: 'ReplayRoute',
    title: 'Replay frame',
    routeFamily: `/wallet/replay?tape=<encoded wallet@${WalletProgram.version.toString()} ReplayTape>&frame=<frame>`,
    portableRoute: representativeWalletReplayRoute,
    representativeState:
      'One settled ImportedAddressBookEntries transition at frame 1 over the same public Wallet Model.',
    semantics:
      'Historical Messages reconstruct the frame while historical Commands remain inert. Live continuation requires a settled branch point.',
  }),
]

const capability = (
  mode: WalletRouteMode,
  support: WalletRouteSupport,
  evidenceLevel: WalletEvidenceLevel,
  evidence: ReadonlyArray<string>,
  limitation: string,
): WalletRouteCapability =>
  WalletRouteCapability.make({
    mode,
    support,
    evidenceLevel,
    evidence,
    limitation,
  })

const implemented = (
  mode: WalletRouteMode,
  evidenceLevel: WalletEvidenceLevel,
  evidence: ReadonlyArray<string>,
  limitation: string,
): WalletRouteCapability =>
  capability(mode, 'Implemented', evidenceLevel, evidence, limitation)

const hostedUnadvertisedProcessor = (
  runtimeModes: ReadonlyArray<WalletProcessorRuntimeMode>,
  limitation: string,
): WalletProcessorDefinition =>
  WalletProcessorDefinition.make({
    status: 'HostedUnadvertised',
    runtimeModes,
    maybeDescriptor: Option.none(),
    limitation,
  })

const captiveUnadvertisedProcessor = (
  runtimeModes: ReadonlyArray<WalletProcessorRuntimeMode>,
  limitation: string,
): WalletProcessorDefinition =>
  WalletProcessorDefinition.make({
    status: 'CaptiveUnadvertised',
    runtimeModes,
    maybeDescriptor: Option.none(),
    limitation,
  })

const missingWalletCapture = (
  kind: WalletCaptureKind,
  path: string,
  maybeCaptureCommand: Option.Option<string>,
): WalletCaptureDefinition =>
  WalletCaptureDefinition.make({
    kind,
    status: 'Missing',
    routeMode: 'StateRoute',
    portableRoute: representativeWalletStateRoute,
    maybePath: Option.some(path),
    maybeCaptureCommand,
    maybeDimensions: Option.none(),
    maybeEvidenceDate: Option.none(),
    limitation:
      'This is the reserved stable evidence path. No artifact is checked in, so the matrix must render it as missing rather than as visual proof.',
  })

const noHostProcessor = WalletProcessorDefinition.make({
  status: 'NoHost',
  runtimeModes: [],
  maybeDescriptor: Option.none(),
  limitation:
    'No runnable Client or Processor occurrence exists, so no identity or capability advertisement is available.',
})

const unsupportedServerCapture = WalletCaptureDefinition.make({
  kind: 'TextCapture',
  status: 'Unsupported',
  routeMode: 'StateRoute',
  portableRoute: representativeWalletStateRoute,
  maybePath: Option.none(),
  maybeCaptureCommand: Option.none(),
  maybeDimensions: Option.none(),
  maybeEvidenceDate: Option.none(),
  limitation:
    'No server Client exists, so there is no output artifact or reproducible capture command.',
})

/** The Wallet client surfaces and their independently audited route support. */
export const walletClients: ReadonlyArray<WalletClientDefinition> = [
  WalletClientDefinition.make({
    clientId: 'ReactWeb',
    title: 'React',
    description:
      'Shared React bindings and the standalone React web presenter.',
    surface: 'Graphical',
    renderer: 'React',
    platform: 'Web',
    host: 'Vite',
    carrier: 'HttpsUrl',
    maybeLaunchCommand: Option.some('pnpm --filter wallet-react-example dev'),
    maybeRouteCarrier: Option.some(
      '<react-wallet-origin><portable-wallet-route>',
    ),
    processor: hostedUnadvertisedProcessor(
      ['Live', 'InertReplay'],
      'The Client hosts live and inert replay ProgramRuntime occurrences, but it does not yet publish a Processor Descriptor. No runtime capability advertisement is claimed.',
    ),
    capture: missingWalletCapture(
      'Screenshot',
      '/captures/wallet/state/react-web.webp',
      Option.none(),
    ),
    capabilities: [
      implemented(
        'StateRoute',
        'FocusedTest',
        [
          'examples/wallet/react-bindings/src/walletRoute.ts',
          'examples/wallet/react-bindings/src/wallet.test.tsx',
          'examples/wallet/react/src/main.tsx',
        ],
        'The standalone origin is a substitution point, not a deployment claim.',
      ),
      implemented(
        'ReplayRoute',
        'FocusedTest',
        [
          'examples/wallet/react-bindings/src/walletRoute.ts',
          'examples/wallet/react-bindings/src/wallet.test.tsx',
          'examples/wallet/react/src/main.tsx',
        ],
        'Inline replay opens the shared inert controller. Saved replay still requires an injected ReplayTapeStore.',
      ),
    ],
  }),
  WalletClientDefinition.make({
    clientId: 'FoldkitView',
    title: 'Foldkit',
    description: 'The canonical Foldkit view renderer over WalletProgram.',
    surface: 'Graphical',
    renderer: 'FoldkitView',
    platform: 'Web',
    host: 'Vite',
    carrier: 'HttpsUrl',
    maybeLaunchCommand: Option.some('pnpm --filter wallet-foldkit-example dev'),
    maybeRouteCarrier: Option.some(
      '<foldkit-wallet-origin><portable-wallet-route>',
    ),
    processor: hostedUnadvertisedProcessor(
      ['Live'],
      'The Client hosts a live Foldkit application occurrence, but it does not advertise a Processor Descriptor. Replay remains Program-only in this host.',
    ),
    capture: missingWalletCapture(
      'Screenshot',
      '/captures/wallet/state/foldkit-view.webp',
      Option.none(),
    ),
    capabilities: [
      implemented(
        'StateRoute',
        'FocusedTest',
        [
          'examples/wallet/foldkit/src/application.ts',
          'examples/wallet/foldkit/src/route.ts',
          'examples/wallet/foldkit/src/route.test.ts',
        ],
        'The standalone origin is a substitution point, not a deployment claim.',
      ),
      capability(
        'ReplayRoute',
        'ProgramOnly',
        'SourceInspection',
        [
          'examples/wallet/foldkit/src/application.ts',
          'examples/wallet/foldkit/src/route.ts',
          'examples/wallet/foldkit/src/route.test.ts',
        ],
        'The carrier rejects replay explicitly because makeFoldkitApplication cannot mount an inert ReplayController. Runtime.fromReplay would create a live branch instead.',
      ),
    ],
  }),
  WalletClientDefinition.make({
    clientId: 'RawCli',
    title: 'Raw CLI',
    description: 'A one-shot stdout host with explicit portable route input.',
    surface: 'OneShotCLI',
    renderer: 'Text',
    platform: 'Node',
    host: 'EffectPlatform',
    carrier: 'CommandLineArgument',
    maybeLaunchCommand: Option.none(),
    maybeRouteCarrier: Option.some(
      "pnpm --filter wallet-cli-example wallet show --uri '<portable-wallet-route>' --verbose",
    ),
    processor: captiveUnadvertisedProcessor(
      ['OneShot', 'InertReplay'],
      'Each invocation creates a captive occurrence and exits. The CLI does not advertise a Processor Descriptor or address a durable remote Processor.',
    ),
    capture: missingWalletCapture(
      'TextCapture',
      '/captures/wallet/state/raw-cli.txt',
      Option.some(
        "pnpm --filter wallet-cli-example wallet show --uri '<portable-wallet-route>' --verbose > examples/client-matrix/foldkit/public/captures/wallet/state/raw-cli.txt",
      ),
    ),
    capabilities: [
      implemented(
        'StateRoute',
        'SourceInspection',
        ['examples/wallet/cli/src/host.ts'],
        'State routes are one-shot CLI input, not an interactive replay session.',
      ),
      implemented(
        'ReplayRoute',
        'FocusedTest',
        [
          'examples/wallet/cli/src/host.ts',
          'examples/wallet/cli/src/host.test.ts',
        ],
        'The CLI inspects one inert replay frame and exits.',
      ),
    ],
  }),
  WalletClientDefinition.make({
    clientId: 'EffectTerminal',
    title: 'Effect Terminal',
    description: 'An interactive line-oriented Effect Terminal host.',
    surface: 'LineTerminal',
    renderer: 'Text',
    platform: 'Node',
    host: 'EffectPlatform',
    carrier: 'CommandLineArgument',
    maybeLaunchCommand: Option.none(),
    maybeRouteCarrier: Option.some(
      "pnpm --filter wallet-terminal-example terminal -- '<portable-wallet-route>'",
    ),
    processor: hostedUnadvertisedProcessor(
      ['Live', 'LiveBranchFromReplay'],
      'The terminal owns a live occurrence and branches validated replay input into live execution. It does not advertise a Processor Descriptor.',
    ),
    capture: missingWalletCapture(
      'TextCapture',
      '/captures/wallet/state/effect-terminal.txt',
      Option.some(
        "printf 'q' | pnpm --filter wallet-terminal-example terminal -- '<portable-wallet-route>' > examples/client-matrix/foldkit/public/captures/wallet/state/effect-terminal.txt",
      ),
    ),
    capabilities: [
      implemented(
        'StateRoute',
        'SourceInspection',
        ['examples/wallet/terminal/src/host.ts'],
        'The route starts a live runtime directly from the decoded Model.',
      ),
      capability(
        'ReplayRoute',
        'LiveBranchOnly',
        'SourceInspection',
        ['examples/wallet/terminal/src/host.ts'],
        'The route is validated at its selected settled frame, then branched into a live runtime. It does not open inert playback.',
      ),
    ],
  }),
  WalletClientDefinition.make({
    clientId: 'OpenTui',
    title: 'OpenTUI',
    description: 'The OpenTUI React terminal reconciler.',
    surface: 'TerminalUI',
    renderer: 'OpenTuiReact',
    platform: 'Node',
    host: 'EffectPlatform',
    carrier: 'CommandLineArgument',
    maybeLaunchCommand: Option.none(),
    maybeRouteCarrier: Option.some(
      "pnpm --filter wallet-tui-example dev -- '<portable-wallet-route>'",
    ),
    processor: hostedUnadvertisedProcessor(
      ['Live', 'InertReplay'],
      'The OpenTUI Client hosts live and inert replay occurrences through shared React bindings, but does not advertise a Processor Descriptor.',
    ),
    capture: missingWalletCapture(
      'Screenshot',
      '/captures/wallet/state/open-tui.webp',
      Option.none(),
    ),
    capabilities: [
      implemented(
        'StateRoute',
        'SourceInspection',
        ['examples/wallet/tui/src/entry.tsx'],
        'No terminal capture is claimed for the Wallet route in this matrix.',
      ),
      implemented(
        'ReplayRoute',
        'SourceInspection',
        [
          'examples/wallet/tui/src/entry.tsx',
          'examples/wallet/tui/src/host.tsx',
        ],
        'The shared React replay controller opens the route inertly. The process test only proves clean startup and teardown.',
      ),
    ],
  }),
  WalletClientDefinition.make({
    clientId: 'ExpoWeb',
    title: 'Expo Web',
    description: 'The universal Expo Showcase running in a browser.',
    surface: 'Graphical',
    renderer: 'ReactNative',
    platform: 'Web',
    host: 'Expo',
    carrier: 'HttpsUrl',
    maybeLaunchCommand: Option.some(
      'pnpm --filter react-native-showcase-example web',
    ),
    maybeRouteCarrier: Option.some('<expo-web-origin><portable-wallet-route>'),
    processor: hostedUnadvertisedProcessor(
      ['Live', 'InertReplay'],
      'Expo Web hosts live and inert replay occurrences through the shared Wallet bindings, but does not publish a Processor Descriptor.',
    ),
    capture: missingWalletCapture(
      'Screenshot',
      '/captures/wallet/state/expo-web.webp',
      Option.none(),
    ),
    capabilities: [
      implemented(
        'StateRoute',
        'FocusedTest',
        [
          'examples/react-native-showcase/src/App.tsx',
          'examples/react-native-showcase/src/wallet/walletProgram.test.ts',
        ],
        'The matrix has no Wallet browser capture and does not claim a deployed Expo Web origin.',
      ),
      implemented(
        'ReplayRoute',
        'SourceInspection',
        ['examples/react-native-showcase/src/App.tsx'],
        'Replay route intake is source-backed but does not yet have a focused Expo replay-route test.',
      ),
    ],
  }),
  WalletClientDefinition.make({
    clientId: 'ExpoIos',
    title: 'Expo iOS',
    description: 'The universal Expo Showcase on iOS.',
    surface: 'Graphical',
    renderer: 'ReactNative',
    platform: 'Ios',
    host: 'Expo',
    carrier: 'CustomSchemeUrl',
    maybeLaunchCommand: Option.some(
      'pnpm --filter react-native-showcase-example ios',
    ),
    maybeRouteCarrier: Option.some('foldkit://showcase<portable-wallet-route>'),
    processor: hostedUnadvertisedProcessor(
      ['Live', 'InertReplay'],
      'The native Client source hosts live and inert replay occurrences, but no runtime Processor Descriptor or physical-device identity evidence is available.',
    ),
    capture: missingWalletCapture(
      'Screenshot',
      '/captures/wallet/state/expo-ios.webp',
      Option.none(),
    ),
    capabilities: [
      implemented(
        'StateRoute',
        'SourceInspection',
        ['examples/react-native-showcase/src/App.tsx'],
        'Source wiring is present. No physical iOS behavior is claimed.',
      ),
      implemented(
        'ReplayRoute',
        'SourceInspection',
        ['examples/react-native-showcase/src/App.tsx'],
        'Source wiring opens the shared inert replay controller. No physical iOS behavior is claimed.',
      ),
    ],
  }),
  WalletClientDefinition.make({
    clientId: 'ExpoAndroid',
    title: 'Expo Android',
    description: 'The universal Expo Showcase on Android.',
    surface: 'Graphical',
    renderer: 'ReactNative',
    platform: 'Android',
    host: 'Expo',
    carrier: 'CustomSchemeUrl',
    maybeLaunchCommand: Option.some(
      'pnpm --filter react-native-showcase-example android',
    ),
    maybeRouteCarrier: Option.some('foldkit://showcase<portable-wallet-route>'),
    processor: hostedUnadvertisedProcessor(
      ['Live', 'InertReplay'],
      'The native Client source hosts live and inert replay occurrences, but no runtime Processor Descriptor or emulator identity evidence is available.',
    ),
    capture: missingWalletCapture(
      'Screenshot',
      '/captures/wallet/state/expo-android.webp',
      Option.none(),
    ),
    capabilities: [
      implemented(
        'StateRoute',
        'SourceInspection',
        ['examples/react-native-showcase/src/App.tsx'],
        'Source wiring is present. No physical Android behavior is claimed.',
      ),
      implemented(
        'ReplayRoute',
        'SourceInspection',
        ['examples/react-native-showcase/src/App.tsx'],
        'Source wiring opens the shared inert replay controller. No physical Android behavior is claimed.',
      ),
    ],
  }),
  WalletClientDefinition.make({
    clientId: 'FutureServer',
    title: 'Future server',
    description: 'A future non-visual host over the portable Program runtime.',
    surface: 'ServerRequest',
    renderer: 'None',
    platform: 'Server',
    host: 'ServerProcess',
    carrier: 'None',
    maybeLaunchCommand: Option.none(),
    maybeRouteCarrier: Option.none(),
    processor: noHostProcessor,
    capture: unsupportedServerCapture,
    capabilities: [
      capability(
        'StateRoute',
        'Planned',
        'NoHost',
        [],
        'No server package, carrier endpoint, or execution test exists.',
      ),
      capability(
        'ReplayRoute',
        'Planned',
        'NoHost',
        [],
        'No ReplayTapeStore, server carrier endpoint, or execution test exists.',
      ),
    ],
  }),
]

/** Finds one route capability for one Wallet client. */
export const capabilityForWalletRoute = (
  client: WalletClientDefinition,
  mode: WalletRouteMode,
) =>
  Array.findFirst(client.capabilities, capability => capability.mode === mode)
