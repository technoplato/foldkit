import {
  type CardboardCapability,
  type CardboardClientDefinition,
  type CardboardEvidenceLevel,
  type CardboardModeDefinition,
  type CardboardRouteSupport,
  type ClientDefinition,
  type ClientId,
  ClosedLiveClient,
  type LiveClientId,
  type MatrixOrientation,
  type Message,
  type Model,
  OpenedLiveClient,
  type ScreenMode,
  type ScreenModeDefinition,
  SelectedMatrixOrientation,
  SelectedScreenMode,
  type WalletClientDefinition,
  type WalletEvidenceLevel,
  type WalletIntentCarrier,
  type WalletIntentDefinition,
  type WalletRouteCapability,
  type WalletRouteDefinition,
  type WalletRouteSupport,
  capabilityForCardboardMode,
  capabilityForWalletRoute,
  cardboardCarrierForClient,
  cardboardClients,
  cardboardModes,
  cardboardProgramIdentity,
  clients,
  definitionForScreenMode,
  destinationForScreenMode,
  navigationForScreenMode,
  portableUriForScreenMode,
  screenModes,
  stateForScreenMode,
  walletClients,
  walletIntentCarriers,
  walletIntentDefinitions,
  walletProgramIdentity,
  walletRoutes,
} from 'client-matrix-core-example'
import { Array, Match as M, Option } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'

import { capturePath, carrierForClient } from './carrier.js'

const orientationLabel = (orientation: MatrixOrientation): string =>
  M.value(orientation).pipe(
    M.withReturnType<string>(),
    M.when('ModesAsRows', () => 'Modes as rows'),
    M.when('ClientsAsRows', () => 'Clients as rows'),
    M.exhaustive,
  )

const orientationButton = (
  selectedOrientation: MatrixOrientation,
  orientation: MatrixOrientation,
): Html => {
  const h = html<Message>()
  const isSelected = selectedOrientation === orientation
  return h.button(
    [
      h.Class(
        isSelected
          ? 'rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950'
          : 'rounded-full border border-stone-700 bg-stone-900 px-4 py-2 text-sm text-stone-300 hover:border-stone-500',
      ),
      h.OnClick(SelectedMatrixOrientation({ orientation })),
    ],
    [orientationLabel(orientation)],
  )
}

const modeButton = (selectedMode: ScreenMode, mode: ScreenMode): Html => {
  const h = html<Message>()
  const maybeDefinition = definitionForScreenMode(mode)
  const title = Option.isSome(maybeDefinition)
    ? maybeDefinition.value.title
    : mode
  const isSelected = selectedMode === mode
  return h.button(
    [
      h.Key(mode),
      h.Class(
        isSelected
          ? 'rounded-xl border border-amber-300 bg-amber-300/10 px-3 py-2 text-left text-sm font-medium text-amber-200'
          : 'rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-left text-sm text-stone-400 hover:border-stone-600',
      ),
      h.OnClick(SelectedScreenMode({ mode })),
    ],
    [title],
  )
}

const clientHeading = (client: ClientDefinition): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('min-w-64 space-y-2')],
    [
      h.strong([h.Class('block text-sm text-stone-100')], [client.title]),
      h.p(
        [h.Class('text-xs font-normal leading-5 text-stone-500')],
        [client.description],
      ),
      h.div(
        [h.Class('flex flex-wrap gap-1')],
        Array.map(
          [
            client.surface,
            client.renderer,
            client.platform,
            client.host,
            client.carrier,
          ],
          label =>
            h.span(
              [
                h.Key(label),
                h.Class(
                  'rounded-full border border-stone-700 bg-stone-900 px-2 py-0.5 text-[0.6rem] font-medium text-stone-400',
                ),
              ],
              [label],
            ),
        ),
      ),
    ],
  )
}

const modeHeading = (
  selectedMode: ScreenMode,
  definition: ScreenModeDefinition,
): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('min-w-56 space-y-2')],
    [
      modeButton(selectedMode, definition.mode),
      h.p(
        [h.Class('text-xs font-normal leading-5 text-stone-500')],
        [definition.description],
      ),
      h.code(
        [h.Class('block break-all text-xs text-amber-300/80')],
        [portableUriForScreenMode(definition.mode)],
      ),
    ],
  )
}

const carrierView = (clientId: ClientId, carrier: string): Html => {
  const h = html<Message>()
  const content = h.code(
    [
      h.Class(
        'block break-all text-left text-[0.68rem] leading-5 text-stone-400',
      ),
    ],
    [carrier],
  )
  const linkedCarrier = (isNewContext: boolean): Html =>
    h.a(
      [
        h.Href(carrier),
        ...(isNewContext
          ? [h.Target('_blank'), h.Rel('noopener noreferrer')]
          : []),
        h.Class(
          'block rounded-lg border border-stone-800 bg-stone-950 p-2 hover:border-amber-400/60',
        ),
      ],
      [content],
    )
  const evidenceCarrier = (): Html =>
    h.div(
      [h.Class('rounded-lg border border-stone-800 bg-stone-950 p-2')],
      [content],
    )

  return M.value(clientId).pipe(
    M.withReturnType<Html>(),
    M.whenOr('ReactWeb', 'FoldkitView', 'ExpoWeb', () => linkedCarrier(true)),
    M.whenOr('ExpoIos', 'ExpoAndroid', () => linkedCarrier(false)),
    M.whenOr('EffectTerminal', 'OpenTui', 'RawCli', evidenceCarrier),
    M.exhaustive,
  )
}

const captureImage = (
  definition: ScreenModeDefinition,
  client: ClientDefinition,
): Html => {
  const h = html<Message>()
  return h.img([
    h.Src(capturePath(definition.mode, client.clientId)),
    h.Alt(`${client.title} showing ${definition.title}`),
    h.Loading('lazy'),
    h.Width('640'),
    h.Height('400'),
    h.Class(
      'aspect-[8/5] w-full rounded-xl border border-stone-800 bg-stone-950 object-cover object-top shadow-lg shadow-black/20',
    ),
  ])
}

const liveCaptureButton = (
  definition: ScreenModeDefinition,
  client: ClientDefinition,
  clientId: LiveClientId,
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.AriaLabel(`Open ${client.title} live client from ${definition.title}`),
      h.OnClick(OpenedLiveClient({ clientId, mode: definition.mode })),
      h.Class(
        'group block w-full rounded-xl text-left outline-none ring-amber-300 focus-visible:ring-2',
      ),
    ],
    [
      captureImage(definition, client),
      h.span(
        [
          h.Class(
            'mt-2 block text-xs font-semibold text-amber-300 group-hover:text-amber-200',
          ),
        ],
        ['Open live in this cell'],
      ),
    ],
  )
}

const browserCaptureLink = (
  definition: ScreenModeDefinition,
  client: ClientDefinition,
  carrier: string,
): Html => {
  const h = html<Message>()
  return h.a(
    [
      h.Href(carrier),
      h.Target('_blank'),
      h.Rel('noopener noreferrer'),
      h.AriaLabel(`Open ${client.title} for ${definition.title}`),
      h.Class(
        'group block rounded-xl outline-none ring-amber-300 focus-visible:ring-2',
      ),
    ],
    [
      captureImage(definition, client),
      h.span(
        [
          h.Class(
            'mt-2 block text-xs font-semibold text-amber-300 group-hover:text-amber-200',
          ),
        ],
        ['Open browser client'],
      ),
    ],
  )
}

const nativeCaptureLink = (
  definition: ScreenModeDefinition,
  client: ClientDefinition,
  carrier: string,
): Html => {
  const h = html<Message>()
  return h.a(
    [
      h.Href(carrier),
      h.AriaLabel(`Open ${client.title} for ${definition.title}`),
      h.Class(
        'group block rounded-xl outline-none ring-amber-300 focus-visible:ring-2',
      ),
    ],
    [
      captureImage(definition, client),
      h.span(
        [
          h.Class(
            'mt-2 block text-xs font-semibold text-amber-300 group-hover:text-amber-200',
          ),
        ],
        ['Open native deep link'],
      ),
    ],
  )
}

const captureView = (
  definition: ScreenModeDefinition,
  client: ClientDefinition,
  carrier: string,
): Html =>
  M.value(client.clientId).pipe(
    M.withReturnType<Html>(),
    M.when('ReactWeb', () => liveCaptureButton(definition, client, 'ReactWeb')),
    M.when('FoldkitView', () =>
      liveCaptureButton(definition, client, 'FoldkitView'),
    ),
    M.when('ExpoWeb', () => browserCaptureLink(definition, client, carrier)),
    M.whenOr('ExpoIos', 'ExpoAndroid', () =>
      nativeCaptureLink(definition, client, carrier),
    ),
    M.whenOr('EffectTerminal', 'OpenTui', 'RawCli', () =>
      captureImage(definition, client),
    ),
    M.exhaustive,
  )

const liveClientView = (
  definition: ScreenModeDefinition,
  client: ClientDefinition,
  portableUri: string,
  carrier: string,
): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Class(
        'overflow-hidden rounded-xl border border-amber-300/50 bg-stone-950 shadow-lg shadow-black/20',
      ),
    ],
    [
      h.div(
        [
          h.Class(
            'grid gap-3 border-b border-stone-800 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start',
          ),
        ],
        [
          h.div(
            [h.Class('min-w-0 space-y-1')],
            [
              h.p(
                [
                  h.Class(
                    'text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-300',
                  ),
                ],
                ['Live client'],
              ),
              h.strong(
                [h.Class('block text-sm text-stone-100')],
                [`Selected matrix mode: ${definition.title}`],
              ),
              h.p(
                [h.Class('text-xs leading-5 text-stone-500')],
                [
                  'Initial deep link ',
                  h.code([h.Class('break-all text-amber-200')], [portableUri]),
                  '. The client can navigate independently after it starts.',
                ],
              ),
            ],
          ),
          h.button(
            [
              h.Type('button'),
              h.AriaLabel(
                `Return ${client.title} ${definition.title} to capture`,
              ),
              h.OnClick(ClosedLiveClient()),
              h.Class(
                'rounded-lg border border-stone-700 px-3 py-2 text-xs font-semibold text-stone-200 hover:border-amber-300 hover:text-amber-200',
              ),
            ],
            ['Return to capture'],
          ),
        ],
      ),
      h.iframe(
        [
          h.Src(carrier),
          h.Title(
            `${client.title} live client initialized from ${definition.title}`,
          ),
          h.Class('aspect-[8/5] w-full border-0 bg-white'),
        ],
        [],
      ),
    ],
  )
}

const matrixCell = (
  model: Model,
  definition: ScreenModeDefinition,
  client: ClientDefinition,
): Html => {
  const h = html<Message>()
  const portableUri = portableUriForScreenMode(definition.mode)
  const carrier = carrierForClient(client.clientId, portableUri)
  const content = M.value(model.liveClientState).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      ShowingCaptures: () => captureView(definition, client, carrier),
      ShowingLiveClient: ({ clientId, mode }) => {
        if (clientId === client.clientId && mode === definition.mode) {
          return liveClientView(definition, client, portableUri, carrier)
        } else {
          return captureView(definition, client, carrier)
        }
      },
    }),
  )
  return h.div(
    [h.Class('grid min-w-72 gap-3')],
    [content, carrierView(client.clientId, carrier)],
  )
}

const modesAsRows = (model: Model): Html => {
  const h = html<Message>()
  return h.table(
    [h.Class('min-w-[160rem] border-separate border-spacing-0')],
    [
      h.thead(
        [h.Class('sticky top-0 z-10 bg-stone-950/95 backdrop-blur')],
        [
          h.tr(
            [],
            [
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 p-4 text-left align-bottom',
                  ),
                ],
                ['Screen mode'],
              ),
              ...Array.map(clients, client =>
                h.th(
                  [
                    h.Key(client.clientId),
                    h.Class(
                      'border-b border-r border-stone-800 p-4 text-left align-bottom',
                    ),
                  ],
                  [clientHeading(client)],
                ),
              ),
            ],
          ),
        ],
      ),
      h.tbody(
        [],
        Array.map(screenModes, definition =>
          h.tr(
            [h.Key(definition.mode), h.Class('align-top')],
            [
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 bg-stone-950 p-4 text-left',
                  ),
                ],
                [modeHeading(model.selectedMode, definition)],
              ),
              ...Array.map(clients, client =>
                h.td(
                  [
                    h.Key(client.clientId),
                    h.Class(
                      'border-b border-r border-stone-800 bg-stone-900/50 p-4',
                    ),
                  ],
                  [matrixCell(model, definition, client)],
                ),
              ),
            ],
          ),
        ),
      ),
    ],
  )
}

const clientsAsRows = (model: Model): Html => {
  const h = html<Message>()
  return h.table(
    [h.Class('min-w-[88rem] border-separate border-spacing-0')],
    [
      h.thead(
        [h.Class('sticky top-0 z-10 bg-stone-950/95 backdrop-blur')],
        [
          h.tr(
            [],
            [
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 p-4 text-left align-bottom',
                  ),
                ],
                ['Client'],
              ),
              ...Array.map(screenModes, definition =>
                h.th(
                  [
                    h.Key(definition.mode),
                    h.Class(
                      'border-b border-r border-stone-800 p-4 text-left align-bottom',
                    ),
                  ],
                  [modeHeading(model.selectedMode, definition)],
                ),
              ),
            ],
          ),
        ],
      ),
      h.tbody(
        [],
        Array.map(clients, client =>
          h.tr(
            [h.Key(client.clientId), h.Class('align-top')],
            [
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 bg-stone-950 p-4 text-left',
                  ),
                ],
                [clientHeading(client)],
              ),
              ...Array.map(screenModes, definition =>
                h.td(
                  [
                    h.Key(definition.mode),
                    h.Class(
                      'border-b border-r border-stone-800 bg-stone-900/50 p-4',
                    ),
                  ],
                  [matrixCell(model, definition, client)],
                ),
              ),
            ],
          ),
        ),
      ),
    ],
  )
}

const matrixView = (model: Model): Html =>
  M.value(model.orientation).pipe(
    M.withReturnType<Html>(),
    M.when('ModesAsRows', () => modesAsRows(model)),
    M.when('ClientsAsRows', () => clientsAsRows(model)),
    M.exhaustive,
  )

const stateInspector = (model: Model): Html => {
  const h = html<Message>()
  const navigation = navigationForScreenMode(model.selectedMode)
  const state = stateForScreenMode(model.selectedMode)
  const destination = destinationForScreenMode(model.selectedMode)
  return h.section(
    [h.Class('grid gap-5 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]')],
    [
      h.div(
        [h.Class('rounded-2xl border border-amber-400/30 bg-amber-300/5 p-5')],
        [
          h.p(
            [
              h.Class(
                'text-xs font-semibold uppercase tracking-[0.2em] text-amber-300',
              ),
            ],
            ['Global portable URI'],
          ),
          h.code(
            [h.Class('mt-3 block break-all text-lg text-amber-100')],
            [portableUriForScreenMode(model.selectedMode)],
          ),
          h.p(
            [h.Class('mt-3 text-sm leading-6 text-stone-400')],
            [
              'Every client parses this same value into Navigation. Only the scheme, authority, or command-line carrier changes.',
            ],
          ),
        ],
      ),
      h.div(
        [h.Class('grid min-w-0 gap-4 md:grid-cols-3')],
        [
          inspectorValue('Navigation', navigation),
          inspectorValue('Application Model', state),
          inspectorValue('Presentation destination', destination),
        ],
      ),
    ],
  )
}

const inspectorValue = (label: string, value: unknown): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('min-w-0 rounded-2xl border border-stone-800 bg-stone-900 p-4')],
    [
      h.h3([h.Class('text-sm font-medium text-stone-200')], [label]),
      h.pre(
        [
          h.Class(
            'mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs leading-5 text-stone-500',
          ),
        ],
        [JSON.stringify(value, null, 2)],
      ),
    ],
  )
}

const cardboardSupportLabel = (support: CardboardRouteSupport): string =>
  M.value(support).pipe(
    M.withReturnType<string>(),
    M.when('DeepLink', () => 'Deep link'),
    M.when('InteractiveTransition', () => 'Interactive transition'),
    M.when('OneShot', () => 'One shot'),
    M.exhaustive,
  )

const cardboardSupportClass = (support: CardboardRouteSupport): string =>
  M.value(support).pipe(
    M.withReturnType<string>(),
    M.when(
      'DeepLink',
      () =>
        'inline-flex rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-emerald-200',
    ),
    M.when(
      'InteractiveTransition',
      () =>
        'inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-200',
    ),
    M.when(
      'OneShot',
      () =>
        'inline-flex rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-sky-200',
    ),
    M.exhaustive,
  )

const cardboardEvidenceLabel = (level: CardboardEvidenceLevel): string =>
  M.value(level).pipe(
    M.withReturnType<string>(),
    M.when('WanBrowserInteraction', () => 'WAN browser interaction'),
    M.when('LocalTerminalInteraction', () => 'Local terminal interaction'),
    M.when('IosSimulatorVisual', () => 'iOS simulator visual'),
    M.when('TypecheckedSource', () => 'Typechecked source only'),
    M.exhaustive,
  )

const cardboardModeCard = (definition: CardboardModeDefinition): Html => {
  const h = html<Message>()
  return h.article(
    [
      h.Key(definition.mode),
      h.Class('rounded-3xl border border-orange-300/30 bg-orange-300/5 p-6'),
    ],
    [
      h.p(
        [
          h.Class(
            'text-xs font-semibold uppercase tracking-[0.22em] text-orange-300',
          ),
        ],
        [definition.title],
      ),
      h.code(
        [h.Class('mt-4 block text-4xl font-semibold text-orange-100')],
        [definition.portableRoute],
      ),
      h.p(
        [h.Class('mt-4 max-w-xl text-base leading-7 text-stone-300')],
        [definition.description],
      ),
    ],
  )
}

const cardboardCapture = (
  client: CardboardClientDefinition,
  definition: CardboardModeDefinition,
  capability: CardboardCapability,
  carrier: string,
): Html => {
  const h = html<Message>()
  if (Option.isNone(capability.maybeCapturePath)) {
    return h.div(
      [
        h.Class(
          'grid aspect-[8/5] place-items-center rounded-2xl border border-dashed border-stone-700 bg-stone-950 p-6 text-center',
        ),
      ],
      [
        h.p(
          [h.Class('max-w-56 text-sm leading-6 text-stone-500')],
          ['No visual capture is claimed for this Client yet.'],
        ),
      ],
    )
  }

  const image = h.img([
    h.Src(capability.maybeCapturePath.value),
    h.Alt(`${client.title} showing ${definition.title}`),
    h.Loading('lazy'),
    h.Width('640'),
    h.Height('400'),
    h.Class(
      'aspect-[8/5] w-full rounded-2xl border border-stone-700 bg-stone-950 object-cover object-top shadow-xl shadow-black/30',
    ),
  ])
  return M.value(client.clientId).pipe(
    M.withReturnType<Html>(),
    M.whenOr('ReactWeb', 'FoldkitView', 'ExpoWeb', () =>
      h.a(
        [
          h.Href(carrier),
          h.Target('_blank'),
          h.Rel('noopener noreferrer'),
          h.AriaLabel(`Open ${client.title} at ${definition.portableRoute}`),
          h.Class('block rounded-2xl focus-visible:ring-4 ring-orange-300'),
        ],
        [image],
      ),
    ),
    M.whenOr('ExpoIos', 'ExpoAndroid', () =>
      h.a(
        [
          h.Href(carrier),
          h.AriaLabel(`Open ${client.title} at ${definition.portableRoute}`),
          h.Class('block rounded-2xl focus-visible:ring-4 ring-orange-300'),
        ],
        [image],
      ),
    ),
    M.whenOr('EffectTui', 'RawCli', () => image),
    M.exhaustive,
  )
}

const cardboardCapabilityCell = (
  client: CardboardClientDefinition,
  definition: CardboardModeDefinition,
): Html => {
  const h = html<Message>()
  const maybeCapability = capabilityForCardboardMode(client, definition.mode)
  if (Option.isNone(maybeCapability)) {
    return h.p(
      [h.Class('text-sm font-semibold text-red-300')],
      ['Missing typed capability evidence.'],
    )
  }

  const capability = maybeCapability.value
  const carrier = cardboardCarrierForClient(client.clientId, definition.mode)
  return h.div(
    [h.Class('grid min-w-80 gap-4')],
    [
      cardboardCapture(client, definition, capability, carrier),
      h.div(
        [h.Class('flex flex-wrap items-center gap-2')],
        [
          h.span(
            [h.Class(cardboardSupportClass(capability.support))],
            [cardboardSupportLabel(capability.support)],
          ),
          h.span(
            [h.Class('text-[0.68rem] font-medium text-stone-500')],
            [cardboardEvidenceLabel(capability.evidenceLevel)],
          ),
        ],
      ),
      h.code(
        [
          h.Class(
            'block break-all rounded-xl border border-stone-800 bg-stone-950 p-3 text-xs leading-5 text-orange-200',
          ),
        ],
        [carrier],
      ),
      h.p(
        [h.Class('text-xs leading-5 text-stone-400')],
        [capability.limitation],
      ),
    ],
  )
}

const cardboardClientHeading = (client: CardboardClientDefinition): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('min-w-56 space-y-2')],
    [
      h.strong([h.Class('block text-base text-stone-100')], [client.title]),
      h.p(
        [h.Class('text-xs font-normal leading-5 text-stone-500')],
        [client.description],
      ),
    ],
  )
}

const cardboardClientsAsRows = (): Html => {
  const h = html<Message>()
  return h.table(
    [h.Class('min-w-[76rem] border-separate border-spacing-0')],
    [
      h.thead(
        [h.Class('sticky top-0 z-10 bg-stone-950/95 backdrop-blur')],
        [
          h.tr(
            [],
            [
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 p-4 text-left align-bottom',
                  ),
                ],
                ['Cardboard Client'],
              ),
              ...Array.map(cardboardModes, definition =>
                h.th(
                  [
                    h.Key(definition.mode),
                    h.Class(
                      'border-b border-r border-stone-800 p-4 text-left align-bottom',
                    ),
                  ],
                  [
                    h.strong(
                      [h.Class('block text-sm text-orange-100')],
                      [definition.title],
                    ),
                    h.code(
                      [h.Class('mt-2 block text-xs text-orange-300')],
                      [definition.portableRoute],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      h.tbody(
        [],
        Array.map(cardboardClients, client =>
          h.tr(
            [h.Key(client.clientId), h.Class('align-top')],
            [
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 bg-stone-950 p-4 text-left',
                  ),
                ],
                [cardboardClientHeading(client)],
              ),
              ...Array.map(cardboardModes, definition =>
                h.td(
                  [
                    h.Key(definition.mode),
                    h.Class(
                      'border-b border-r border-stone-800 bg-stone-900/50 p-4',
                    ),
                  ],
                  [cardboardCapabilityCell(client, definition)],
                ),
              ),
            ],
          ),
        ),
      ),
    ],
  )
}

const cardboardModesAsRows = (): Html => {
  const h = html<Message>()
  return h.table(
    [h.Class('min-w-[150rem] border-separate border-spacing-0')],
    [
      h.thead(
        [h.Class('sticky top-0 z-10 bg-stone-950/95 backdrop-blur')],
        [
          h.tr(
            [],
            [
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 p-4 text-left align-bottom',
                  ),
                ],
                ['Cardboard state'],
              ),
              ...Array.map(cardboardClients, client =>
                h.th(
                  [
                    h.Key(client.clientId),
                    h.Class(
                      'border-b border-r border-stone-800 p-4 text-left align-bottom',
                    ),
                  ],
                  [cardboardClientHeading(client)],
                ),
              ),
            ],
          ),
        ],
      ),
      h.tbody(
        [],
        Array.map(cardboardModes, definition =>
          h.tr(
            [h.Key(definition.mode), h.Class('align-top')],
            [
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 bg-stone-950 p-4 text-left',
                  ),
                ],
                [
                  h.div(
                    [h.Class('min-w-56 space-y-2')],
                    [
                      h.strong(
                        [h.Class('block text-base text-orange-100')],
                        [definition.title],
                      ),
                      h.code(
                        [h.Class('block text-sm text-orange-300')],
                        [definition.portableRoute],
                      ),
                      h.p(
                        [h.Class('text-xs leading-5 text-stone-500')],
                        [definition.description],
                      ),
                    ],
                  ),
                ],
              ),
              ...Array.map(cardboardClients, client =>
                h.td(
                  [
                    h.Key(client.clientId),
                    h.Class(
                      'border-b border-r border-stone-800 bg-stone-900/50 p-4',
                    ),
                  ],
                  [cardboardCapabilityCell(client, definition)],
                ),
              ),
            ],
          ),
        ),
      ),
    ],
  )
}

const cardboardMatrix = (orientation: MatrixOrientation): Html =>
  M.value(orientation).pipe(
    M.withReturnType<Html>(),
    M.when('ModesAsRows', cardboardModesAsRows),
    M.when('ClientsAsRows', cardboardClientsAsRows),
    M.exhaustive,
  )

const cardboardAudit = (model: Model): Html => {
  const h = html<Message>()
  return h.section(
    [h.AriaLabel('Project Cardboard Client Matrix')],
    [
      h.div(
        [h.Class('border-y border-orange-300/20 bg-[#181008] px-5 py-12')],
        [
          h.div(
            [h.Class('mx-auto grid max-w-[116rem] gap-7')],
            [
              h.div(
                [
                  h.Class(
                    'grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start',
                  ),
                ],
                [
                  h.div(
                    [h.Class('space-y-4')],
                    [
                      h.p(
                        [
                          h.Class(
                            'text-xs font-semibold uppercase tracking-[0.24em] text-orange-300',
                          ),
                        ],
                        ['Project Cardboard | Portable Program'],
                      ),
                      h.h2(
                        [h.Class('text-4xl font-semibold sm:text-6xl')],
                        ['/0 across every Client'],
                      ),
                      h.p(
                        [
                          h.Class(
                            'max-w-4xl text-base leading-7 text-stone-300',
                          ),
                        ],
                        [
                          'One Model and Message protocol. Two portable routes. Every cell distinguishes implementation support from the evidence actually collected.',
                        ],
                      ),
                    ],
                  ),
                  h.div(
                    [
                      h.Class(
                        'rounded-3xl border border-orange-300/30 bg-orange-300/5 p-6',
                      ),
                    ],
                    [
                      h.p(
                        [
                          h.Class(
                            'text-xs font-semibold uppercase tracking-[0.18em] text-orange-300',
                          ),
                        ],
                        ['Program identity'],
                      ),
                      h.code(
                        [h.Class('mt-3 block text-2xl text-orange-100')],
                        [
                          `${cardboardProgramIdentity.id}@${cardboardProgramIdentity.version.toString()}`,
                        ],
                      ),
                      h.code(
                        [
                          h.Class(
                            'mt-2 block break-all text-xs text-stone-500',
                          ),
                        ],
                        [cardboardProgramIdentity.source],
                      ),
                    ],
                  ),
                ],
              ),
              h.div(
                [h.Class('grid gap-4 lg:grid-cols-2')],
                Array.map(cardboardModes, cardboardModeCard),
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class('overflow-x-auto overscroll-x-contain')],
        [cardboardMatrix(model.orientation)],
      ),
    ],
  )
}

const walletSupportLabel = (support: WalletRouteSupport): string =>
  M.value(support).pipe(
    M.withReturnType<string>(),
    M.when('Implemented', () => 'Implemented'),
    M.when('LiveBranchOnly', () => 'Live branch only'),
    M.when('AdapterReady', () => 'Adapter ready'),
    M.when('ProgramOnly', () => 'Program only'),
    M.when('Planned', () => 'Planned'),
    M.when('Unsupported', () => 'Unsupported'),
    M.exhaustive,
  )

const walletSupportClass = (support: WalletRouteSupport): string =>
  M.value(support).pipe(
    M.withReturnType<string>(),
    M.when(
      'Implemented',
      () =>
        'inline-flex rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-emerald-200',
    ),
    M.when(
      'LiveBranchOnly',
      () =>
        'inline-flex rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-sky-200',
    ),
    M.when(
      'AdapterReady',
      () =>
        'inline-flex rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-cyan-200',
    ),
    M.when(
      'ProgramOnly',
      () =>
        'inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-200',
    ),
    M.when(
      'Planned',
      () =>
        'inline-flex rounded-full border border-stone-600 bg-stone-800 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-stone-400',
    ),
    M.when(
      'Unsupported',
      () =>
        'inline-flex rounded-full border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-red-200',
    ),
    M.exhaustive,
  )

const walletEvidenceLabel = (level: WalletEvidenceLevel): string =>
  M.value(level).pipe(
    M.withReturnType<string>(),
    M.when('FocusedTest', () => 'Focused test'),
    M.when('AutomatedCapture', () => 'Automated capture'),
    M.when('SourceInspection', () => 'Source inspection'),
    M.when('Simulator', () => 'Simulator'),
    M.when('Emulator', () => 'Emulator'),
    M.when('PhysicalDevice', () => 'Physical device'),
    M.when('NoEvidence', () => 'Unverified'),
    M.when('NoHost', () => 'No host evidence'),
    M.exhaustive,
  )

const walletRouteCard = (route: WalletRouteDefinition): Html => {
  const h = html<Message>()
  return h.article(
    [
      h.Key(route.mode),
      h.Class('rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-5'),
    ],
    [
      h.p(
        [
          h.Class(
            'text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300',
          ),
        ],
        [route.title],
      ),
      h.code(
        [h.Class('mt-3 block break-all text-sm text-cyan-100')],
        [route.routeFamily],
      ),
      h.p(
        [h.Class('mt-3 text-sm leading-6 text-stone-300')],
        [route.representativeState],
      ),
      h.p(
        [h.Class('mt-2 text-xs leading-5 text-stone-500')],
        [route.semantics],
      ),
      h.details(
        [h.Class('mt-4 rounded-xl border border-stone-800 bg-stone-950 p-3')],
        [
          h.summary(
            [
              h.Class(
                'cursor-pointer text-xs font-semibold text-cyan-300 marker:text-stone-600',
              ),
            ],
            ['Exact router-generated route'],
          ),
          h.code(
            [
              h.Class(
                'mt-3 block max-h-32 overflow-auto whitespace-pre-wrap break-all text-[0.68rem] leading-5 text-stone-400',
              ),
            ],
            [route.portableRoute],
          ),
        ],
      ),
    ],
  )
}

const walletProcessorEvidence = (client: WalletClientDefinition): Html => {
  const h = html<Message>()
  const processor = client.processor
  const descriptor = Option.isSome(processor.maybeDescriptor)
    ? [
        h.code(
          [h.Class('block break-all text-[0.68rem] text-cyan-200')],
          [`Processor ${processor.maybeDescriptor.value.processorId}`],
        ),
        ...Array.map(
          processor.maybeDescriptor.value.capabilities,
          advertisedCapability =>
            h.code(
              [
                h.Key(
                  `${Array.join(advertisedCapability.id, '/')}:${advertisedCapability.version.toString()}`,
                ),
                h.Class(
                  'block break-all text-[0.65rem] leading-5 text-stone-500',
                ),
              ],
              [
                `${Array.join(advertisedCapability.id, ' / ')} v${advertisedCapability.version.toString()}`,
              ],
            ),
        ),
      ]
    : [
        h.p(
          [h.Class('text-xs font-semibold text-amber-200')],
          [`Processor descriptor: ${processor.status}`],
        ),
        h.p(
          [h.Class('text-[0.68rem] leading-5 text-stone-500')],
          ['Advertised capabilities: none'],
        ),
      ]
  return h.div(
    [h.Class('min-w-0 space-y-1')],
    [
      h.p(
        [
          h.Class(
            'text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-stone-500',
          ),
        ],
        ['Processor'],
      ),
      ...descriptor,
      h.p(
        [h.Class('break-words text-[0.68rem] leading-5 text-stone-400')],
        [
          `Runtime modes: ${Array.isReadonlyArrayNonEmpty(processor.runtimeModes) ? Array.join(processor.runtimeModes, ', ') : 'none'}`,
        ],
      ),
      h.p(
        [h.Class('break-words text-[0.68rem] leading-5 text-stone-500')],
        [processor.limitation],
      ),
    ],
  )
}

const walletCaptureEvidence = (client: WalletClientDefinition): Html => {
  const h = html<Message>()
  const capture = client.capture
  const dimensionsLabel = Option.isSome(capture.maybeDimensions)
    ? `${capture.maybeDimensions.value.width.toString()} × ${capture.maybeDimensions.value.height.toString()}`
    : 'unverified'
  const evidenceDateLabel = Option.isSome(capture.maybeEvidenceDate)
    ? capture.maybeEvidenceDate.value
    : 'unverified'
  const maybeImage =
    capture.status === 'CheckedIn' &&
    capture.kind === 'Screenshot' &&
    Option.isSome(capture.maybePath)
      ? [
          h.img([
            h.Src(capture.maybePath.value),
            h.Alt(`${client.title} Wallet state capture`),
            h.Loading('lazy'),
            h.Width('640'),
            h.Height('400'),
            h.Class(
              'mt-2 aspect-[8/5] w-full rounded-xl border border-stone-800 bg-stone-950 object-cover object-top',
            ),
          ]),
        ]
      : []
  return h.div(
    [h.Class('min-w-0 space-y-1')],
    [
      h.p(
        [
          h.Class(
            'text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-stone-500',
          ),
        ],
        ['Capture evidence'],
      ),
      h.p(
        [
          h.Class(
            capture.status === 'CheckedIn'
              ? 'text-xs font-semibold text-emerald-200'
              : 'text-xs font-semibold text-amber-200',
          ),
        ],
        [`${capture.status} ${capture.kind}`],
      ),
      h.p(
        [h.Class('text-[0.68rem] leading-5 text-stone-500')],
        [
          `${capture.routeMode} | dimensions ${dimensionsLabel} | evidence date ${evidenceDateLabel}`,
        ],
      ),
      h.details(
        [h.Class('rounded-lg border border-stone-800 bg-stone-950 p-2')],
        [
          h.summary(
            [
              h.Class(
                'cursor-pointer text-[0.68rem] font-semibold text-violet-200',
              ),
            ],
            ['Exact capture route'],
          ),
          h.code(
            [
              h.Class(
                'mt-2 block max-h-24 overflow-auto whitespace-pre-wrap break-all text-[0.62rem] leading-5 text-stone-500',
              ),
            ],
            [capture.portableRoute],
          ),
        ],
      ),
      ...(Option.isSome(capture.maybePath)
        ? [
            h.code(
              [
                h.Class(
                  'block break-all text-[0.68rem] leading-5 text-violet-200',
                ),
              ],
              [capture.maybePath.value],
            ),
          ]
        : []),
      ...(Option.isSome(capture.maybeCaptureCommand)
        ? [
            h.code(
              [
                h.Class(
                  'block break-all text-[0.65rem] leading-5 text-stone-500',
                ),
              ],
              [capture.maybeCaptureCommand.value],
            ),
          ]
        : []),
      h.p(
        [h.Class('break-words text-[0.68rem] leading-5 text-stone-500')],
        [capture.limitation],
      ),
      ...maybeImage,
    ],
  )
}

const walletClientCarrier = (client: WalletClientDefinition): Html => {
  const h = html<Message>()
  const launch = (): ReadonlyArray<Html> => {
    if (Option.isSome(client.maybeLaunchCommand)) {
      return [
        h.div(
          [h.Class('space-y-1')],
          [
            h.p(
              [
                h.Class(
                  'text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-stone-500',
                ),
              ],
              ['Launch'],
            ),
            h.code(
              [
                h.Class(
                  'block break-all text-[0.68rem] leading-5 text-stone-300',
                ),
              ],
              [client.maybeLaunchCommand.value],
            ),
          ],
        ),
      ]
    } else {
      return []
    }
  }
  const routeCarrier = (): Html => {
    if (Option.isSome(client.maybeRouteCarrier)) {
      return h.div(
        [h.Class('space-y-1')],
        [
          h.p(
            [
              h.Class(
                'text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-stone-500',
              ),
            ],
            ['Route carrier'],
          ),
          h.code(
            [h.Class('block break-all text-[0.68rem] leading-5 text-cyan-200')],
            [client.maybeRouteCarrier.value],
          ),
        ],
      )
    } else {
      return h.p(
        [h.Class('text-xs leading-5 text-amber-200')],
        ['No route carrier is wired.'],
      )
    }
  }
  return h.div(
    [h.Class('grid min-w-72 gap-4')],
    [
      ...launch(),
      routeCarrier(),
      walletProcessorEvidence(client),
      walletCaptureEvidence(client),
    ],
  )
}

const walletCapabilityView = (capability: WalletRouteCapability): Html => {
  const h = html<Message>()
  const evidence = Array.isReadonlyArrayEmpty(capability.evidence)
    ? [
        h.p(
          [h.Class('text-xs leading-5 text-stone-600')],
          ['No checked-in host evidence.'],
        ),
      ]
    : Array.map(capability.evidence, source =>
        h.code(
          [
            h.Key(source),
            h.Class('block break-all text-[0.65rem] leading-5 text-stone-500'),
          ],
          [source],
        ),
      )
  return h.div(
    [h.Class('grid min-w-72 gap-3')],
    [
      h.div(
        [h.Class('flex flex-wrap items-center gap-2')],
        [
          h.span(
            [h.Class(walletSupportClass(capability.support))],
            [walletSupportLabel(capability.support)],
          ),
          h.span(
            [h.Class('text-[0.68rem] font-medium text-stone-500')],
            [walletEvidenceLabel(capability.evidenceLevel)],
          ),
        ],
      ),
      h.p(
        [h.Class('text-xs leading-5 text-stone-300')],
        [capability.limitation],
      ),
      h.div([h.Class('space-y-1')], evidence),
    ],
  )
}

const walletCapabilityCell = (
  client: WalletClientDefinition,
  route: WalletRouteDefinition,
): Html => {
  const h = html<Message>()
  const maybeCapability = capabilityForWalletRoute(client, route.mode)
  if (Option.isSome(maybeCapability)) {
    return walletCapabilityView(maybeCapability.value)
  }
  return h.p(
    [h.Class('text-xs font-semibold text-red-300')],
    ['Missing typed capability evidence.'],
  )
}

const walletClientHeading = (client: WalletClientDefinition): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('min-w-52 space-y-1')],
    [
      h.strong([h.Class('block text-sm text-stone-100')], [client.title]),
      h.p(
        [h.Class('text-xs font-normal leading-5 text-stone-500')],
        [client.description],
      ),
      h.code(
        [
          h.Class(
            'block break-words text-[0.65rem] font-normal leading-5 text-stone-500',
          ),
        ],
        [
          `${client.surface} | ${client.renderer} | ${client.platform} | ${client.host} | ${client.carrier}`,
        ],
      ),
    ],
  )
}

const walletMatrix = (): Html => {
  const h = html<Message>()
  return h.table(
    [h.Class('min-w-[100rem] border-separate border-spacing-0')],
    [
      h.thead(
        [h.Class('sticky top-0 z-10 bg-stone-950/95 backdrop-blur')],
        [
          h.tr(
            [],
            [
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 p-4 text-left align-bottom',
                  ),
                ],
                ['Wallet client'],
              ),
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 p-4 text-left align-bottom',
                  ),
                ],
                ['Carrier'],
              ),
              ...Array.map(walletRoutes, route =>
                h.th(
                  [
                    h.Key(route.mode),
                    h.Class(
                      'border-b border-r border-stone-800 p-4 text-left align-bottom',
                    ),
                  ],
                  [
                    h.strong(
                      [h.Class('block text-sm text-cyan-100')],
                      [route.title],
                    ),
                    h.code(
                      [
                        h.Class(
                          'mt-2 block break-all text-[0.68rem] font-normal leading-5 text-stone-500',
                        ),
                      ],
                      [route.routeFamily],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      h.tbody(
        [],
        Array.map(walletClients, client =>
          h.tr(
            [h.Key(client.clientId), h.Class('align-top')],
            [
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 bg-stone-950 p-4 text-left',
                  ),
                ],
                [walletClientHeading(client)],
              ),
              h.td(
                [
                  h.Class(
                    'border-b border-r border-stone-800 bg-stone-900/50 p-4',
                  ),
                ],
                [walletClientCarrier(client)],
              ),
              ...Array.map(walletRoutes, route =>
                h.td(
                  [
                    h.Key(route.mode),
                    h.Class(
                      'border-b border-r border-stone-800 bg-stone-900/50 p-4',
                    ),
                  ],
                  [walletCapabilityCell(client, route)],
                ),
              ),
            ],
          ),
        ),
      ),
    ],
  )
}

const walletIntentCapabilityClass = (
  definition: WalletIntentDefinition,
): string =>
  definition.capability.support === 'Implemented'
    ? 'inline-flex rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-emerald-200'
    : 'inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-200'

const walletActualNetworkEvidenceClass = (
  definition: WalletIntentDefinition,
): string =>
  M.value(definition.capability.actualNetworkEvidence).pipe(
    M.withReturnType<string>(),
    M.when(
      'Verified',
      () =>
        'inline-flex rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-emerald-200',
    ),
    M.when(
      'Unverified',
      () =>
        'inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-200',
    ),
    M.when(
      'Unsupported',
      () =>
        'inline-flex rounded-full border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-red-200',
    ),
    M.exhaustive,
  )

const walletIntentCard = (definition: WalletIntentDefinition): Html => {
  const h = html<Message>()
  return h.article(
    [
      h.Key(definition.id),
      h.Class(
        'min-w-0 rounded-2xl border border-violet-400/30 bg-violet-400/5 p-5',
      ),
    ],
    [
      h.div(
        [h.Class('flex flex-wrap items-center justify-between gap-3')],
        [
          h.h3(
            [h.Class('text-lg font-semibold text-violet-100')],
            [definition.title],
          ),
          h.span(
            [h.Class(walletIntentCapabilityClass(definition))],
            [definition.capability.support],
          ),
        ],
      ),
      h.p(
        [h.Class('mt-3 text-sm leading-6 text-stone-300')],
        [definition.description],
      ),
      h.code(
        [
          h.Class(
            'mt-4 block max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-stone-800 bg-stone-950 p-3 text-[0.68rem] leading-5 text-violet-200',
          ),
        ],
        [definition.portableRoute],
      ),
      h.p(
        [h.Class('mt-3 text-xs leading-5 text-stone-500')],
        [
          `${definition.capability.network} (${definition.capability.networkId}). ${definition.capability.reason}`,
        ],
      ),
      h.div(
        [h.Class('mt-3 flex flex-wrap items-center gap-2')],
        [
          h.span(
            [h.Class(walletActualNetworkEvidenceClass(definition))],
            [`Actual network ${definition.capability.actualNetworkEvidence}`],
          ),
          h.span(
            [h.Class('text-[0.68rem] font-medium text-stone-500')],
            [`Simulation ${definition.capability.simulationEvidence}`],
          ),
        ],
      ),
      h.p(
        [h.Class('mt-3 text-xs leading-5 text-amber-100')],
        [definition.capability.limitation],
      ),
      h.div(
        [h.Class('mt-3 space-y-1')],
        Array.map(definition.capability.evidence, source =>
          h.code(
            [
              h.Key(source),
              h.Class(
                'block break-all text-[0.65rem] leading-5 text-stone-500',
              ),
            ],
            [source],
          ),
        ),
      ),
    ],
  )
}

const walletIntentCarrierRow = (carrier: WalletIntentCarrier): Html => {
  const h = html<Message>()
  const maybeClient = Array.findFirst(
    walletClients,
    client => client.clientId === carrier.clientId,
  )
  const title = Option.isSome(maybeClient)
    ? maybeClient.value.title
    : carrier.clientId
  return h.tr(
    [h.Key(carrier.clientId), h.Class('align-top')],
    [
      h.th(
        [
          h.Class(
            'border-b border-r border-stone-800 bg-stone-950 p-4 text-left text-sm text-stone-100',
          ),
        ],
        [title],
      ),
      h.td(
        [h.Class('border-b border-r border-stone-800 bg-stone-900/50 p-4')],
        [
          h.code(
            [
              h.Class(
                'block max-w-4xl break-all text-xs leading-5 text-violet-200',
              ),
            ],
            [carrier.carrier],
          ),
        ],
      ),
      h.td(
        [h.Class('border-b border-stone-800 bg-stone-900/50 p-4')],
        [
          h.span(
            [
              h.Class(
                'inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-200',
              ),
            ],
            [carrier.support],
          ),
          h.p(
            [h.Class('mt-2 text-[0.68rem] font-medium text-stone-500')],
            [`Evidence: ${carrier.evidenceLevel}`],
          ),
          h.p(
            [h.Class('mt-3 max-w-xl text-xs leading-5 text-stone-400')],
            [carrier.limitation],
          ),
          h.div(
            [h.Class('mt-3 space-y-1')],
            Array.map(carrier.evidence, source =>
              h.code(
                [
                  h.Key(source),
                  h.Class(
                    'block break-all text-[0.65rem] leading-5 text-stone-500',
                  ),
                ],
                [source],
              ),
            ),
          ),
        ],
      ),
    ],
  )
}

const walletIntentCarrierMatrix = (): Html => {
  const h = html<Message>()
  const maybeRepresentative = Array.findFirst(
    walletIntentDefinitions,
    definition => definition.id === 'eth-testnet',
  )
  if (Option.isNone(maybeRepresentative)) {
    return h.p(
      [h.Class('text-sm text-red-300')],
      ['The representative ETH Testnet intent is missing.'],
    )
  }
  const carriers = walletIntentCarriers(maybeRepresentative.value)
  return h.table(
    [h.Class('min-w-[90rem] border-separate border-spacing-0')],
    [
      h.thead(
        [h.Class('bg-stone-950/95')],
        [
          h.tr(
            [],
            [
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 p-4 text-left text-sm text-stone-200',
                  ),
                ],
                ['Client'],
              ),
              h.th(
                [
                  h.Class(
                    'border-b border-r border-stone-800 p-4 text-left text-sm text-stone-200',
                  ),
                ],
                ['Exact ETH Testnet carrier'],
              ),
              h.th(
                [
                  h.Class(
                    'border-b border-stone-800 p-4 text-left text-sm text-stone-200',
                  ),
                ],
                ['Host intake'],
              ),
            ],
          ),
        ],
      ),
      h.tbody([], Array.map(carriers, walletIntentCarrierRow)),
    ],
  )
}

const walletIntentAudit = (): Html => {
  const h = html<Message>()
  return h.section(
    [h.AriaLabel('Wallet intent portability audit')],
    [
      h.div(
        [h.Class('border-y border-stone-800 bg-stone-950 px-5 py-10')],
        [
          h.div(
            [h.Class('mx-auto grid max-w-[116rem] gap-6')],
            [
              h.div(
                [h.Class('space-y-3')],
                [
                  h.p(
                    [
                      h.Class(
                        'text-xs font-semibold uppercase tracking-[0.24em] text-violet-300',
                      ),
                    ],
                    ['Wallet Program | Portable interaction intent'],
                  ),
                  h.h2(
                    [h.Class('text-3xl font-semibold sm:text-5xl')],
                    ['Send money from any client'],
                  ),
                  h.p(
                    [h.Class('max-w-4xl text-sm leading-6 text-stone-400')],
                    [
                      'The Wallet core owns one parser-printer for the global relative path. Each Client owns only its origin, custom scheme, or command-line wrapper. All twelve native Bitcoin, Ethereum, Solana, and Sui rails are represented across Devnet, Testnet, and Live. Simulation and actual-network evidence are labeled separately. Parsing an intent never performs a side effect. It enters the Program as startup input, and update decides the resulting Commands.',
                    ],
                  ),
                ],
              ),
              h.div(
                [h.Class('grid gap-4 md:grid-cols-2 xl:grid-cols-3')],
                Array.map(walletIntentDefinitions, walletIntentCard),
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class('overflow-x-auto overscroll-x-contain')],
        [walletIntentCarrierMatrix()],
      ),
    ],
  )
}

const walletAudit = (): Html => {
  const h = html<Message>()
  return h.section(
    [h.AriaLabel('Wallet Program portability audit')],
    [
      h.div(
        [h.Class('border-y border-stone-800 bg-stone-950 px-5 py-10')],
        [
          h.div(
            [h.Class('mx-auto grid max-w-[116rem] gap-6')],
            [
              h.div(
                [h.Class('grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]')],
                [
                  h.div(
                    [h.Class('space-y-3')],
                    [
                      h.p(
                        [
                          h.Class(
                            'text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300',
                          ),
                        ],
                        ['Wallet Program | Route evidence'],
                      ),
                      h.h2(
                        [h.Class('text-3xl font-semibold sm:text-5xl')],
                        ['State and replay portability'],
                      ),
                      h.p(
                        [h.Class('max-w-3xl text-sm leading-6 text-stone-400')],
                        [
                          'Exact public state and replay paths, their host carriers, and the strongest checked-in evidence for every requested client. Missing browser and server links remain explicit gaps.',
                        ],
                      ),
                    ],
                  ),
                  h.div(
                    [
                      h.Class(
                        'rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-5',
                      ),
                    ],
                    [
                      h.p(
                        [
                          h.Class(
                            'text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300',
                          ),
                        ],
                        ['Program identity'],
                      ),
                      h.code(
                        [h.Class('mt-2 block text-lg text-cyan-100')],
                        [
                          `${walletProgramIdentity.id}@${walletProgramIdentity.version.toString()}`,
                        ],
                      ),
                      h.code(
                        [h.Class('mt-2 block text-xs text-stone-500')],
                        [walletProgramIdentity.source],
                      ),
                    ],
                  ),
                ],
              ),
              h.div(
                [h.Class('grid gap-4 xl:grid-cols-2')],
                Array.map(walletRoutes, walletRouteCard),
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class('overflow-x-auto overscroll-x-contain')],
        [walletMatrix()],
      ),
    ],
  )
}

/** Renders the live cross-client URI and screen comparison matrix. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  return {
    title: 'Foldkit | Client Matrix',
    body: h.main(
      [h.Class('min-h-screen bg-stone-950 text-stone-100')],
      [
        h.header(
          [h.Class('border-b border-stone-800 bg-stone-950 px-5 py-10')],
          [
            h.div(
              [h.Class('mx-auto grid max-w-[116rem] gap-6')],
              [
                h.div(
                  [
                    h.Class(
                      'grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end',
                    ),
                  ],
                  [
                    h.div(
                      [h.Class('space-y-3')],
                      [
                        h.p(
                          [
                            h.Class(
                              'text-xs font-semibold uppercase tracking-[0.28em] text-amber-300',
                            ),
                          ],
                          ['Multiple Counters | Eight captured clients'],
                        ),
                        h.h1(
                          [
                            h.Class(
                              'text-4xl font-semibold tracking-tight sm:text-6xl',
                            ),
                          ],
                          ['Client Matrix'],
                        ),
                        h.p(
                          [
                            h.Class(
                              'max-w-3xl text-base leading-7 text-stone-400',
                            ),
                          ],
                          [
                            'Canonical Multiple Counters state, portable URI carriers, and captured output across every implemented host.',
                          ],
                        ),
                      ],
                    ),
                    h.div(
                      [h.Class('flex flex-wrap gap-2')],
                      [
                        orientationButton(model.orientation, 'ModesAsRows'),
                        orientationButton(model.orientation, 'ClientsAsRows'),
                      ],
                    ),
                  ],
                ),
                h.div(
                  [h.Class('grid gap-2 sm:grid-cols-2 lg:grid-cols-4')],
                  Array.map(screenModes, definition =>
                    modeButton(model.selectedMode, definition.mode),
                  ),
                ),
                stateInspector(model),
              ],
            ),
          ],
        ),
        h.section(
          [
            h.AriaLabel('Client comparison matrix'),
            h.Class('overflow-x-auto overscroll-x-contain'),
          ],
          [matrixView(model)],
        ),
        cardboardAudit(model),
        walletAudit(),
        walletIntentAudit(),
      ],
    ),
  }
}
