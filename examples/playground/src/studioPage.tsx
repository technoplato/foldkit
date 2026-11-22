/** @jsxImportSource react */
import { Array, Match as M, Option, String } from 'effect'
import { Navigation } from 'foldkit'
import {
  type CliDaemonPaintedResult,
  offeredCommandsOf,
  paintProgram,
  parseProgramArgv,
  programUsage,
  runProgramCommand,
} from 'foldkit/cli/program'
import { renderPlainCli } from 'foldkit/renderers'
import { paintModeOnPage } from 'foldkit/theme'
import {
  type FormEvent,
  type ReactElement,
  StrictMode,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { createRoot } from 'react-dom/client'

import {
  ActionMenuButton,
  ProgramProvider,
  WhenReady,
  useKeyBindings,
} from '@foldkit/react/interaction'
import {
  NavigationFrame,
  useBrowserHistory,
  useDocumentTitle,
  useNavigationFrame,
  useNavigationPlan,
} from '@foldkit/react/navigation'

import {
  type BoundStudio,
  type StudioTapeMode,
  createBoundStudio,
  startSyncedStudio,
} from './studioProgram'

type TerminalEntry = Readonly<{
  id: number
  command: string
  result: CliDaemonPaintedResult
}>

type OutputTab = 'Show' | 'Help' | 'ScreenOnly'

const tokenizeCliLine = (raw: string): ReadonlyArray<string> => {
  const trimmed = String.trim(raw)
    .replace(/^\$\s*/u, '')
    .replace(/^studio\s+/iu, '')
    .replace(/^studio$/iu, 'show')
  if (String.isEmpty(trimmed)) {
    return []
  }
  const tokens: Array<string> = []
  let current = ''
  let maybeQuote: '"' | "'" | undefined = undefined
  for (const char of trimmed) {
    if (maybeQuote !== undefined) {
      if (char === maybeQuote) {
        maybeQuote = undefined
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      maybeQuote = char
    } else if (/\s/u.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }
  if (current.length > 0) {
    tokens.push(current)
  }
  return tokens
}

export const executeStudioCliLine = (
  bound: BoundStudio,
  rawLine: string,
): CliDaemonPaintedResult => {
  const argv = tokenizeCliLine(rawLine)
  const parsed = parseProgramArgv(argv)
  return M.value(parsed).pipe(
    M.withReturnType<CliDaemonPaintedResult>(),
    M.tagsExhaustive({
      Show: ({ flags }) => runProgramCommand(bound, 'studio', ['show'], flags),
      Do: ({ token, flags }) =>
        runProgramCommand(bound, 'studio', token.split(' '), flags),
      Tail: () => runProgramCommand(bound, 'studio', ['where'], {}),
      Watch: () => runProgramCommand(bound, 'studio', ['show'], {}),
    }),
  )
}

const formatPresentationStyle = (
  maybeStyle: Option.Option<Navigation.PresentationStyle>,
): string =>
  Option.match(maybeStyle, {
    onNone: () => 'Base / Push',
    onSome: style =>
      M.value(style).pipe(
        M.withReturnType<string>(),
        M.tagsExhaustive({
          Push: () => 'Push',
          Sheet: () => 'Sheet Overlay',
          BottomSheet: () => 'Bottom Sheet',
          FullScreenCover: () => 'Full Screen',
          Dialog: () => 'Modal Dialog',
          Popover: () => 'Popover',
          Drawer: ({ from }) => `Drawer (${from})`,
        }),
      ),
  })

const NavigationInspector = (
  props: Readonly<{ bound: BoundStudio }>,
): ReactElement => {
  const { bound } = props
  const maybeFrame = useNavigationFrame()
  const maybePlan = useNavigationPlan()

  const currentUri = Option.match(maybeFrame, {
    onNone: () => '/studio',
    onSome: frame => frame.uri,
  })

  const stackDepth = Option.match(maybePlan, {
    onNone: () => 1,
    onSome: plan => plan.entries.length,
  })

  const quickRoutes: ReadonlyArray<
    Readonly<{ label: string; badge: string; uri: string }>
  > = [
    { label: 'Issues Root', badge: 'Root', uri: '/studio' },
    { label: 'Releases', badge: 'Tab', uri: '/studio/releases' },
    {
      label: 'Issue Detail',
      badge: 'Push',
      uri: '/studio/issues/mobile-touch',
    },
    { label: 'New Issue', badge: 'Sheet', uri: '/studio/new' },
    {
      label: 'Stacked Priority',
      badge: 'Push + Sheet',
      uri: '/studio/issues/mobile-touch/priority/mobile-touch',
    },
    {
      label: 'Activity Log',
      badge: 'Drawer (Left)',
      uri: '/studio/activity',
    },
    {
      label: 'Confirm Archive',
      badge: 'Dialog',
      uri: '/studio/archive/surface-drag',
    },
    {
      label: 'Session Policy',
      badge: 'Session Sheet',
      uri: '/studio/session',
    },
  ]

  return (
    <div className="pg-panel st-inspector-card">
      <div className="pg-panel-head">
        <h2 className="pg-panel-title">Navigation Carrier &amp; Stack</h2>
        <span className="pg-pill pg-pill-accent mono" data-testid="studio-uri">
          {currentUri}
        </span>
      </div>
      <p className="pg-muted">
        Live readings from <code>useNavigationFrame()</code> &amp;{' '}
        <code>useNavigationPlan()</code>. Every carrier transition syncs with{' '}
        <code>window.history</code> and the CLI below.
      </p>

      <div className="st-layer-stack" data-testid="studio-layer-stack">
        {Option.match(maybeFrame, {
          onNone: () => <span className="pg-muted">Starting frame…</span>,
          onSome: frame => (
            <>
              <div className="st-layer-row">
                <span className="pg-pill pg-pill-positive">Base</span>
                <span className="mono">{frame.base.identity}</span>
                <span className="pg-faint mono">depth {stackDepth}</span>
              </div>
              {Array.map(frame.overlays, overlay => (
                <div
                  key={overlay.key}
                  className="st-layer-row st-layer-overlay"
                >
                  <span className="pg-pill pg-pill-warning">
                    {formatPresentationStyle(overlay.maybeStyle)}
                  </span>
                  <span className="mono">{overlay.key}</span>
                </div>
              ))}
            </>
          ),
        })}
      </div>

      <div className="st-quick-heading mono pg-faint">
        1-TAP PRIMITIVE TRANSITIONS
      </div>
      <div className="st-route-grid">
        {Array.map(quickRoutes, item => (
          <button
            key={item.uri}
            type="button"
            className={
              currentUri === item.uri
                ? 'pg-btn pg-btn-sm pg-btn-primary st-route-btn'
                : 'pg-btn pg-btn-sm st-route-btn'
            }
            onClick={() => {
              bound.openUri(item.uri, Navigation.Link())
            }}
          >
            <span>{item.label}</span>
            <span className="pg-pill mono">{item.badge}</span>
          </button>
        ))}
        <button
          type="button"
          className="pg-btn pg-btn-sm st-route-btn"
          onClick={() => {
            bound.openMenu()
          }}
        >
          <span>Command Menu</span>
          <span className="pg-pill mono">⌘K</span>
        </button>
        <button
          type="button"
          className="pg-btn pg-btn-sm st-route-btn"
          onClick={() => {
            Navigation.backOneEntry(bound)
          }}
        >
          <span>← Back One Entry</span>
          <span className="pg-pill mono">Pop</span>
        </button>
      </div>
    </div>
  )
}

const LiveCliSection = (
  props: Readonly<{ bound: BoundStudio }>,
): ReactElement => {
  const { bound } = props
  useSyncExternalStore(bound.subscribe, bound.readModel, bound.readModel)

  const [outputTab, setOutputTab] = useState<OutputTab>('Show')
  const [commandInput, setCommandInput] = useState(
    'open /studio/issues/mobile-touch',
  )
  const [history, setHistory] = useState<ReadonlyArray<TerminalEntry>>([])

  const livePaintedOutput = M.value(outputTab).pipe(
    M.withReturnType<string>(),
    M.when('Show', () => paintProgram(bound, 'studio')),
    M.when('Help', () => programUsage(bound, 'studio')),
    M.when('ScreenOnly', () =>
      Option.match(bound.screen(), {
        onNone: () => '',
        onSome: tree => renderPlainCli(tree, { width: 72 }),
      }),
    ),
    M.exhaustive,
  )

  const dynamicOffers = offeredCommandsOf(
    bound,
    'studio',
    [
      'CutRelease',
      'ToggleIssueStatus:surface-drag',
      'RaisePriority:cli-bridge',
      'CreateIssue:Verify iOS OTP autofill',
      'ResetStudio',
    ],
    {
      limit: 5,
      hostCommands: [
        { command: 'open /studio/new', what: 'Present Sheet' },
        { command: 'open /studio/activity', what: 'Present Left Drawer' },
        { command: 'open /studio/archive/cli-bridge', what: 'Present Dialog' },
        { command: 'menu type priority', what: 'Filter ActionMenu' },
        { command: 'back', what: 'Step back' },
        { command: 'help', what: 'Derived usage' },
        { command: 'opne /studio', what: 'Typo refusal demo' },
      ],
    },
  )

  const runLine = (rawLine: string): void => {
    const label = String.isEmpty(String.trim(rawLine))
      ? 'show'
      : String.trim(rawLine).replace(/^studio\s+/iu, '')
    const result = executeStudioCliLine(bound, rawLine)
    setHistory(prev =>
      Array.take(
        [
          {
            id: prev.length + 1,
            command: label,
            result,
          },
          ...prev,
        ],
        8,
      ),
    )
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    runLine(commandInput)
  }

  return (
    <section className="st-cli-section" aria-label="Live CLI Output and Input">
      <div className="st-section-banner">
        <div>
          <h2 className="st-section-title">
            Live CLI Output &amp; Interactive Command Runner
          </h2>
          <p className="pg-subtitle">
            Bound to the <strong>exact same running Program</strong> via{' '}
            <code>foldkit/cli/program</code>. Click in the React frame above to
            watch <code>paintProgram</code> update live, or run{' '}
            <code>$ studio …</code> commands below to drive React navigation and
            state!
          </p>
        </div>
        <span className="pg-pill pg-pill-positive mono">
          Shared BoundInteraction
        </span>
      </div>

      <div className="st-two-col">
        <div className="pg-panel">
          <div className="pg-panel-head">
            <h3 className="pg-panel-title">
              Live Terminal View (
              <code>$ studio {outputTab.toLowerCase()}</code>)
            </h3>
            <div className="pg-row">
              <button
                type="button"
                className={
                  outputTab === 'Show'
                    ? 'pg-btn pg-btn-sm pg-btn-primary'
                    : 'pg-btn pg-btn-sm'
                }
                onClick={() => {
                  setOutputTab('Show')
                }}
              >
                studio show
              </button>
              <button
                type="button"
                className={
                  outputTab === 'Help'
                    ? 'pg-btn pg-btn-sm pg-btn-primary'
                    : 'pg-btn pg-btn-sm'
                }
                onClick={() => {
                  setOutputTab('Help')
                }}
              >
                studio help
              </button>
              <button
                type="button"
                className={
                  outputTab === 'ScreenOnly'
                    ? 'pg-btn pg-btn-sm pg-btn-primary'
                    : 'pg-btn pg-btn-sm'
                }
                onClick={() => {
                  setOutputTab('ScreenOnly')
                }}
              >
                renderPlainCli(72 cols)
              </button>
            </div>
          </div>
          <pre
            className="pg-cli-pre st-cli-live-pre mono"
            data-testid="studio-live-cli"
          >
            {livePaintedOutput}
          </pre>
        </div>

        <div className="pg-panel">
          <div className="pg-panel-head">
            <h3 className="pg-panel-title">Interactive CLI Input</h3>
            <button
              type="button"
              className="pg-btn pg-btn-sm"
              onClick={() => {
                setHistory([])
              }}
            >
              Clear Transcript
            </button>
          </div>

          <form className="st-cli-form" onSubmit={handleSubmit}>
            <span className="st-cli-prompt mono">$ studio</span>
            <input
              aria-label="Studio CLI command"
              className="pg-input mono st-cli-input"
              type="text"
              inputMode="text"
              enterKeyHint="send"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={commandInput}
              placeholder="open /studio/new, toggle-issue-status mobile-touch, help…"
              onChange={event => {
                setCommandInput(event.target.value)
              }}
            />
            <button type="submit" className="pg-btn pg-btn-primary">
              Run
            </button>
          </form>

          <div className="st-quick-heading mono pg-faint">
            DERIVED &amp; NAVIGATION COMMAND CHIPS (TAP TO RUN)
          </div>
          <div className="st-chip-wrap">
            {Array.map(dynamicOffers, offered => {
              const shortCmd = offered.replace(/^studio\s+/u, '')
              return (
                <button
                  key={offered}
                  type="button"
                  className="pg-btn pg-btn-sm mono st-cli-chip"
                  onClick={() => {
                    setCommandInput(shortCmd)
                    runLine(shortCmd)
                  }}
                >
                  $ {offered}
                </button>
              )
            })}
          </div>

          <div
            className="st-transcript"
            data-testid="studio-cli-transcript"
            role="log"
            aria-label="CLI command transcript"
          >
            {Array.match(history, {
              onEmpty: () => (
                <span className="pg-muted">
                  No commands run yet. Submit a command or tap a chip above.
                </span>
              ),
              onNonEmpty: entries =>
                Array.map(entries, entry => (
                  <div key={entry.id} className="st-transcript-item">
                    <div className="st-transcript-head">
                      <span className="mono">$ studio {entry.command}</span>
                      <span
                        className={
                          entry.result.exitCode === 0
                            ? 'pg-pill pg-pill-positive mono'
                            : 'pg-pill pg-pill-danger mono'
                        }
                      >
                        exit {entry.result.exitCode}
                      </span>
                    </div>
                    {entry.result.stderr !== undefined &&
                    String.isNonEmpty(entry.result.stderr) ? (
                      <pre className="st-stderr mono">
                        {entry.result.stderr}
                      </pre>
                    ) : null}
                    {String.isNonEmpty(entry.result.stdout) ? (
                      <pre className="st-stdout mono">
                        {entry.result.stdout}
                      </pre>
                    ) : null}
                  </div>
                )),
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

export const StudioDemoShell = (
  props: Readonly<{
    bound: BoundStudio
    syncLabel: string
    onToggleTape?: () => void
  }>,
): ReactElement => {
  const { bound, syncLabel, onToggleTape } = props
  useSyncExternalStore(bound.subscribe, bound.readModel, bound.readModel)
  const statusTag = bound.status()._tag

  const [mode, setMode] = useState<'Dark' | 'Light'>(() =>
    typeof document !== 'undefined' &&
    document.documentElement.dataset['mode'] === 'light'
      ? 'Light'
      : 'Dark',
  )

  useKeyBindings()
  useBrowserHistory({ isCarried: uri => uri.startsWith('/studio') })
  useDocumentTitle()

  const toggleTheme = (): void => {
    const nextMode: 'Dark' | 'Light' = mode === 'Dark' ? 'Light' : 'Dark'
    setMode(nextMode)
    if (typeof document !== 'undefined') {
      paintModeOnPage(nextMode, {
        root: document.documentElement,
        storage: window.localStorage,
      })
    }
  }

  return (
    <div className="pg-shell st-shell">
      <header className="pg-header">
        <div className="pg-title-row">
          <h1 className="pg-title">
            Foldkit React Navigation &amp; Live CLI Studio
            <span className="pg-pill pg-pill-positive">@foldkit/react</span>
            <span className="pg-pill pg-pill-accent">foldkit/cli/program</span>
            <span
              className={
                statusTag === 'Ready'
                  ? 'pg-pill pg-pill-positive mono'
                  : 'pg-pill pg-pill-warning mono'
              }
              data-testid="studio-sync-status"
            >
              {statusTag === 'Ready'
                ? `● ${syncLabel}`
                : `◌ Connecting ${syncLabel}…`}
            </span>
          </h1>
          <p className="pg-subtitle">
            One pure Foldkit Program declared once — synced live across devices
            via <code>@foldkit/instant</code> and rendered simultaneously by{' '}
            <code>&lt;NavigationFrame /&gt;</code> in React and{' '}
            <code>paintProgram</code> / <code>runProgramCommand</code> in the
            CLI.
          </p>
        </div>
        <div className="pg-controls">
          <a className="pg-btn" href="/playground">
            ← All 54 Core UI Parts
          </a>
          {onToggleTape !== undefined ? (
            <button type="button" className="pg-btn" onClick={onToggleTape}>
              {syncLabel.includes('InstantDB')
                ? 'Switch to Local Memory'
                : 'Switch to InstantDB Sync'}
            </button>
          ) : null}
          <button type="button" className="pg-btn" onClick={toggleTheme}>
            {mode === 'Dark' ? '☀ Light Mode' : '☾ Dark Mode'}
          </button>
          <button
            type="button"
            className="pg-btn"
            onClick={() => {
              bound.openUri('/studio', Navigation.Link())
              bound.press('ResetStudio')
            }}
          >
            Reset Studio
          </button>
        </div>
      </header>

      <section
        className="st-nav-section"
        aria-label="React Navigation Primitives"
      >
        <div className="st-two-col">
          <div className="pg-panel st-react-stage">
            <div className="pg-panel-head">
              <h2 className="pg-panel-title">
                Live <code>&lt;NavigationFrame /&gt;</code> (@foldkit/react)
              </h2>
              <WhenReady>
                <ActionMenuButton className="pg-btn pg-btn-sm pg-btn-primary" />
              </WhenReady>
            </div>
            <div className="st-frame-viewport" data-testid="studio-react-frame">
              <WhenReady>
                <NavigationFrame />
              </WhenReady>
            </div>
          </div>

          <NavigationInspector bound={bound} />
        </div>
      </section>

      <LiveCliSection bound={bound} />
    </div>
  )
}

export const StudioAppRoot = (
  props: Readonly<{ initialUri?: string; tape?: StudioTapeMode }>,
): ReactElement => {
  const [activeTape, setActiveTape] = useState<StudioTapeMode | undefined>(
    props.tape,
  )

  const session = useMemo(() => {
    if (activeTape === undefined) {
      return {
        bound: createBoundStudio(props.initialUri),
        stop: () => Promise.resolve(),
        syncLabel: 'Local Memory',
      }
    }
    const started = startSyncedStudio(activeTape)
    return {
      bound: started.bound,
      stop: started.stop,
      syncLabel:
        activeTape === 'Instant' ? 'InstantDB Live Sync' : 'Local Memory',
    }
  }, [activeTape, props.initialUri])

  useEffect(
    () => () => {
      void session.stop()
    },
    [session],
  )

  return (
    <ProgramProvider bound={session.bound}>
      <StudioDemoShell
        bound={session.bound}
        syncLabel={session.syncLabel}
        onToggleTape={
          activeTape === undefined
            ? undefined
            : () => {
                setActiveTape(current =>
                  current === 'Instant' ? 'Memory' : 'Instant',
                )
              }
        }
      />
    </ProgramProvider>
  )
}

export const mountStudioPage = (container: HTMLElement): void => {
  if (
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/navigation')
  ) {
    const suffix = window.location.pathname.slice('/navigation'.length)
    window.history.replaceState(
      null,
      '',
      `/studio${suffix}${window.location.search}`,
    )
  }
  const initialUri =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/studio'
  createRoot(container).render(
    <StrictMode>
      <StudioAppRoot initialUri={initialUri} tape="Instant" />
    </StrictMode>,
  )
}
