import { Array, Option, String } from 'effect'
import { BoundField, Dialog, Drawer } from 'foldkit/behavior'
import type { Document, Html } from 'foldkit/html'
import { renderPlainCli } from 'foldkit/renderers'

import { type ProfileFieldKey, profileForm } from './boundForm'
import { type CatalogEntry, type PartKey, catalog, categories } from './catalog'
import { PlaygroundCliScreen } from './cliScreen'
import {
  ClosedInspector,
  H,
  InspectedPart,
  ResetPlayground,
  SelectedCategory,
  SubmittedProfileForm,
  ToggledThemeMode,
  TriggeredBurstTest,
  UpdatedSearchQuery,
  dispatchBoundField,
  dispatchPart,
} from './messages'
import type { PlaygroundModel } from './state'
import { renderGroup1 } from './views/group1'
import { renderGroup2 } from './views/group2'
import { renderGroup3 } from './views/group3'

const { div, button, input, textarea, span, h1, h2, p, pre, label } = H

const pacePillClass = (pace: CatalogEntry['pace']): string =>
  pace === 'Settled 200ms'
    ? 'pg-pill pg-pill-warning'
    : pace === 'Sampled 50ms'
      ? 'pg-pill pg-pill-accent'
      : pace === 'Device'
        ? 'pg-pill'
        : 'pg-pill pg-pill-positive'

const renderBoundFieldHero = (model: PlaygroundModel): Html => {
  const validation = BoundField.validateForm(profileForm, model.profileStates, {
    fieldset: model.profileFieldset,
  })
  const isFormValid = validation._tag === 'Valid'

  const renderField = (key: ProfileFieldKey): Html => {
    const field = profileForm.fields[key]
    const state = model.profileStates[key]
    const draft = BoundField.draftOf(state)
    const maybeError = BoundField.errorOf(field, state, {
      fieldset: model.profileFieldset,
    })
    const isSecret = field.kind === 'Secret'
    const isPasswordVisible = BoundField.isPasswordVisible(state)
    const inputType = BoundField.effectiveInputTypeOf(field, state)

    return div(
      [H.Class('pg-field')],
      [
        label(
          [H.Attribute('for', field.ids.input)],
          [
            span([], [field.label]),
            span(
              [
                H.Class(
                  isSecret
                    ? 'pg-pill'
                    : BoundField.isDirty(state)
                      ? 'pg-pill pg-pill-warning'
                      : 'pg-pill pg-pill-positive',
                ),
              ],
              [
                isSecret
                  ? 'Device (Secret)'
                  : BoundField.isDirty(state)
                    ? 'Settled 200ms'
                    : 'Synced',
              ],
            ),
          ],
        ),
        field.kind === 'Textarea'
          ? textarea(
              [
                H.Id(field.ids.textarea),
                H.Class(
                  Option.isSome(maybeError)
                    ? 'pg-textarea pg-input-invalid'
                    : 'pg-textarea',
                ),
                H.Attribute('rows', '2'),
                H.Value(draft),
                H.Placeholder(field.placeholder ?? ''),
                H.OnInput(value =>
                  dispatchBoundField(
                    key,
                    BoundField.ChangeFieldDraft({ value }),
                  ),
                ),
                H.OnBlur(dispatchBoundField(key, BoundField.BlurField())),
              ],
              [],
            )
          : div(
              [H.Class('pg-row')],
              [
                input([
                  H.Id(field.ids.input),
                  H.Type(inputType),
                  H.Class(
                    Option.isSome(maybeError)
                      ? 'pg-input pg-input-invalid'
                      : 'pg-input',
                  ),
                  H.Style({ flex: '1' }),
                  H.Value(draft),
                  H.Placeholder(field.placeholder ?? ''),
                  H.OnInput(value =>
                    dispatchBoundField(
                      key,
                      BoundField.ChangeFieldDraft({ value }),
                    ),
                  ),
                  H.OnBlur(dispatchBoundField(key, BoundField.BlurField())),
                ]),
                isSecret
                  ? button(
                      [
                        H.Class('pg-btn pg-btn-sm'),
                        H.OnClick(
                          dispatchBoundField(
                            key,
                            BoundField.ToggleFieldVisibility(),
                          ),
                        ),
                      ],
                      [isPasswordVisible ? 'Hide' : 'Show'],
                    )
                  : H.empty,
              ],
            ),
        Option.match(maybeError, {
          onNone: () =>
            span(
              [H.Class('pg-faint')],
              [
                isSecret
                  ? 'Pace.Device({ because: "Secret" }) — stays strictly on this device.'
                  : `Bound via ModelPath (${field.name}) · Pace.Settled(200ms).`,
              ],
            ),
          onSome: err => span([H.Class('pg-error')], [err]),
        }),
      ],
    )
  }

  return div(
    [H.Class('pg-panel')],
    [
      div(
        [H.Class('pg-panel-head')],
        [
          h2([H.Class('pg-panel-title')], ['BoundField · ModelPath + Schema']),
          span(
            [
              H.Class(
                isFormValid
                  ? 'pg-pill pg-pill-positive'
                  : 'pg-pill pg-pill-danger',
              ),
            ],
            [isFormValid ? 'Schema Valid' : 'Schema Errors'],
          ),
        ],
      ),
      renderField('displayName'),
      renderField('bio'),
      renderField('apiToken'),
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-primary'),
              H.OnClick(SubmittedProfileForm()),
            ],
            ['Validate & Commit (Causal Flush)'],
          ),
          span(
            [H.Class('pg-faint mono')],
            [
              `model.profile.displayName = "${model.profile.profile.displayName}"`,
            ],
          ),
        ],
      ),
      Option.match(model.profileSubmitBanner, {
        onNone: () => H.empty,
        onSome: banner => div([H.Class('pg-surface-box pg-muted')], [banner]),
      }),
    ],
  )
}

const renderPaceHero = (model: PlaygroundModel): Html => {
  const savedPct =
    model.localEventCount === 0
      ? 0
      : Math.max(
          0,
          Math.round(
            ((model.localEventCount - model.syncedWriteCount) /
              model.localEventCount) *
              100,
          ),
        )
  return div(
    [H.Class('pg-panel')],
    [
      div(
        [H.Class('pg-panel-head')],
        [
          h2(
            [H.Class('pg-panel-title')],
            ['Live Pace Sync Engine (Pace.Queue)'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-primary pg-btn-sm'),
              H.OnClick(TriggeredBurstTest()),
            ],
            ['⚡ Run 16-Event Burst'],
          ),
        ],
      ),
      div(
        [H.Class('pg-row')],
        [
          span([H.Class('pg-pill mono')], [`Local: ${model.localEventCount}`]),
          span(
            [H.Class('pg-pill pg-pill-positive mono')],
            [`Synced Writes: ${model.syncedWriteCount}`],
          ),
          span(
            [H.Class('pg-pill pg-pill-warning mono')],
            [`Waiting: ${model.paceQueue.waiting.length}`],
          ),
          span(
            [H.Class('pg-pill pg-pill-accent mono')],
            [`Saved: ${savedPct}%`],
          ),
        ],
      ),
      span(
        [H.Class('pg-muted')],
        [
          'Interact with any of the 54 Parts below — typing settles at 200ms, drags sample at 50ms, secrets stay Device-only, and Synced actions flush waiting writes causally.',
        ],
      ),
      div(
        [H.Class('pg-log-list mono')],
        Array.isReadonlyArrayEmpty(model.recentSyncWrites) &&
          Array.isReadonlyArrayEmpty(model.recentEvents)
          ? [
              span(
                [H.Class('pg-faint')],
                [
                  'Click any widget or run the burst test to observe Pace.Queue live…',
                ],
              ),
            ]
          : Array.map(Array.take(model.recentEvents, 8), entry =>
              div(
                [H.Class('pg-log-row')],
                [
                  span([], [`${entry.part}.${entry.tag}`]),
                  span(
                    [
                      H.Class(
                        entry.status === 'Synced'
                          ? 'pg-pill pg-pill-positive'
                          : entry.status === 'Queued'
                            ? 'pg-pill pg-pill-warning'
                            : 'pg-pill',
                      ),
                    ],
                    [`${entry.pace} · ${entry.status}`],
                  ),
                ],
              ),
            ),
      ),
    ],
  )
}

const renderCliHero = (model: PlaygroundModel): Html => {
  const validation = BoundField.validateForm(profileForm, model.profileStates, {
    fieldset: model.profileFieldset,
  })
  const uiNode = PlaygroundCliScreen({
    mode: model.mode,
    displayName: model.profile.profile.displayName,
    bio: model.profile.profile.bio,
    formValid: validation._tag === 'Valid',
    localEventCount: model.localEventCount,
    syncedWriteCount: model.syncedWriteCount,
    sliderValue: model.parts.slider.values[0] ?? 0,
    ratingValue: Option.getOrElse(model.parts.ratingGroup.maybeValue, () => 0),
    switchOn: model.parts.switch._tag === 'On',
    activeTab: Option.getOrElse(
      model.parts.tabs.maybeSelectedValue,
      () => 'core',
    ),
    qrText:
      model.parts.qrCode._tag === 'Ready'
        ? model.parts.qrCode.value
        : '(empty)',
  })
  const plainCliText = renderPlainCli(uiNode, { width: 58 })

  return div(
    [H.Class('pg-panel')],
    [
      div(
        [H.Class('pg-panel-head')],
        [
          h2([H.Class('pg-panel-title')], ['Zero-React JSX → UiNode → CLI']),
          span(
            [H.Class('pg-pill pg-pill-accent mono')],
            ['foldkit/jsx-runtime'],
          ),
        ],
      ),
      span(
        [H.Class('pg-muted')],
        [
          'Live output of src/cliScreen.tsx rendered by paintCli() — updates live as you edit the form or move controls.',
        ],
      ),
      pre([H.Class('pg-cli-pre mono')], [plainCliText]),
      span(
        [H.Class('pg-faint mono')],
        ['Terminal: pnpm --filter @foldkit/playground cli'],
      ),
    ],
  )
}

const renderCard = (
  entry: CatalogEntry,
  body: Html,
  model: PlaygroundModel,
): Html => {
  const isInspected = model.isInspectorOpen && model.inspectedPart === entry.key
  return div(
    [
      H.Id(`part-${entry.key}`),
      H.Class(isInspected ? 'pg-card pg-card-inspected' : 'pg-card'),
    ],
    [
      div(
        [H.Class('pg-card-head')],
        [
          div(
            [H.Class('pg-card-name')],
            [
              span([H.Class('pg-card-num mono')], [`#${entry.number}`]),
              span([], [entry.name]),
            ],
          ),
          span([H.Class(pacePillClass(entry.pace))], [entry.pace]),
        ],
      ),
      div(
        [H.Class('pg-badges')],
        Array.map(entry.sources, src => span([H.Class('pg-pill')], [src])),
      ),
      p([H.Class('pg-muted'), H.Style({ margin: '0' })], [entry.summary]),
      div([H.Class('pg-card-body')], [body]),
      div(
        [H.Class('pg-card-foot')],
        [
          span(
            [H.Class('mono')],
            [
              Array.isReadonlyArrayEmpty(entry.blocks)
                ? 'standalone machine'
                : Array.join(entry.blocks, ' · '),
            ],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(InspectedPart({ partKey: entry.key })),
            ],
            [isInspected ? 'Inspecting' : 'Inspect State'],
          ),
        ],
      ),
    ],
  )
}

const matchesEntry = (model: PlaygroundModel, entry: CatalogEntry): boolean => {
  const catOk = model.category === 'All' || entry.category === model.category
  if (!catOk) {
    return false
  }
  const q = String.toLowerCase(String.trim(model.query))
  if (q === '') {
    return true
  }
  const haystack = String.toLowerCase(
    `${entry.number} ${entry.name} ${entry.key} ${entry.category} ${entry.summary} ${Array.join(entry.sources, ' ')} ${Array.join(entry.blocks, ' ')}`,
  )
  return String.includes(q)(haystack)
}

const renderOverlays = (model: PlaygroundModel): Html => {
  const dialogOverlay =
    model.parts.dialog._tag === 'Open'
      ? div(
          [
            H.Class('pg-overlay-backdrop'),
            H.Role('dialog'),
            H.Attribute('aria-modal', 'true'),
          ],
          [
            div(
              [
                H.Class('pg-overlay-scrim'),
                H.OnClick(dispatchPart('dialog', Dialog.DismissDialog())),
              ],
              [],
            ),
            div(
              [H.Class('pg-overlay-card')],
              [
                h2([H.Class('pg-panel-title')], ['Dialog Part (#2) — Open']),
                p(
                  [H.Class('pg-muted'), H.Style({ margin: '0' })],
                  [
                    'Driven by packages/foldkit/src/behavior/dialog.ts composing Layers + FocusScope with zero painter logic.',
                  ],
                ),
                div(
                  [H.Class('pg-row')],
                  [
                    button(
                      [
                        H.Class('pg-btn pg-btn-primary'),
                        H.OnClick(dispatchPart('dialog', Dialog.CloseDialog())),
                      ],
                      ['Close Dialog'],
                    ),
                    button(
                      [
                        H.Class('pg-btn'),
                        H.OnClick(
                          dispatchPart('dialog', Dialog.DismissDialog()),
                        ),
                      ],
                      ['Dismiss (Escape)'],
                    ),
                  ],
                ),
              ],
            ),
          ],
        )
      : H.empty

  const drawerSnapPoint =
    model.parts.drawer._tag === 'Open' || model.parts.drawer._tag === 'Dragging'
      ? model.parts.drawer.activeSnapPoint
      : 0.75

  const drawerOverlay =
    model.parts.drawer._tag !== 'Closed'
      ? div(
          [H.Class('pg-overlay-backdrop')],
          [
            div(
              [
                H.Class('pg-overlay-scrim'),
                H.OnClick(dispatchPart('drawer', Drawer.DismissDrawer())),
              ],
              [],
            ),
            div(
              [H.Class('pg-drawer-sheet'), H.Role('dialog')],
              [
                h2([H.Class('pg-panel-title')], ['Drawer Part (#26) — Open']),
                p(
                  [H.Class('pg-muted'), H.Style({ margin: '0' })],
                  [
                    `Active snap point: ${Math.round(drawerSnapPoint * 100)}%. Composes Layers, FocusScope, and PointerDrag.`,
                  ],
                ),
                div(
                  [H.Class('pg-row')],
                  Array.map([0.4, 0.75, 1], pt =>
                    button(
                      [
                        H.Class(
                          drawerSnapPoint === pt
                            ? 'pg-btn pg-btn-sm pg-btn-primary'
                            : 'pg-btn pg-btn-sm',
                        ),
                        H.OnClick(
                          dispatchPart(
                            'drawer',
                            Drawer.SetDrawerSnapPoint({ snapPoint: pt }),
                          ),
                        ),
                      ],
                      [`${Math.round(pt * 100)}%`],
                    ),
                  ),
                ),
                button(
                  [
                    H.Class('pg-btn'),
                    H.OnClick(dispatchPart('drawer', Drawer.CloseDrawer())),
                  ],
                  ['Close Drawer'],
                ),
              ],
            ),
          ],
        )
      : H.empty

  return div([], [dialogOverlay, drawerOverlay])
}

const renderInspectorDock = (model: PlaygroundModel): Html => {
  if (!model.isInspectorOpen) {
    return H.empty
  }
  const key: PartKey = model.inspectedPart
  const partState = model.parts[key]
  const entry = Option.getOrElse(
    Array.findFirst(catalog, c => c.key === key),
    () => catalog[0]!,
  )
  return div(
    [H.Class('pg-inspector-dock')],
    [
      div(
        [H.Class('pg-panel-head')],
        [
          div(
            [H.Class('pg-row')],
            [
              span([H.Class('pg-card-num mono')], [`#${entry.number}`]),
              span(
                [H.Class('pg-panel-title')],
                [`Live Core Model · ${entry.name}`],
              ),
              span([H.Class(pacePillClass(entry.pace))], [entry.pace]),
            ],
          ),
          button(
            [H.Class('pg-btn pg-btn-sm'), H.OnClick(ClosedInspector())],
            ['Hide Inspector ✕'],
          ),
        ],
      ),
      pre(
        [H.Class('pg-inspector-pre mono')],
        [JSON.stringify(partState, null, 2)],
      ),
    ],
  )
}

export const view = (model: PlaygroundModel): Document => {
  const bodies: Readonly<Record<string, Html>> = {
    ...renderGroup1(model),
    ...renderGroup2(model),
    ...renderGroup3(model),
  }

  const visibleEntries = Array.filter(catalog, entry =>
    matchesEntry(model, entry),
  )

  return {
    title: `Foldkit Core UI · All 54 Parts (${model.mode})`,
    body: div(
      [H.Class('pg-shell')],
      [
        div(
          [H.Class('pg-header')],
          [
            div(
              [H.Class('pg-title-row')],
              [
                h1(
                  [H.Class('pg-title')],
                  [
                    'Foldkit Core UI Playground',
                    span(
                      [H.Class('pg-pill pg-pill-positive')],
                      ['54 / 54 Core Parts'],
                    ),
                    span(
                      [H.Class('pg-pill pg-pill-accent')],
                      ['Zero Painter Rules'],
                    ),
                  ],
                ),
                p(
                  [H.Class('pg-subtitle')],
                  [
                    'Every widget below runs its real core Machine from foldkit/behavior simultaneously on one page — no Storybook sidebar clicking.',
                  ],
                ),
              ],
            ),
            div(
              [H.Class('pg-controls')],
              [
                button(
                  [H.Class('pg-btn'), H.OnClick(ToggledThemeMode())],
                  [model.mode === 'Dark' ? '☀ Light Mode' : '☾ Dark Mode'],
                ),
                button(
                  [
                    H.Class(
                      model.isInspectorOpen
                        ? 'pg-btn pg-btn-primary'
                        : 'pg-btn',
                    ),
                    H.OnClick(
                      model.isInspectorOpen
                        ? ClosedInspector()
                        : InspectedPart({ partKey: model.inspectedPart }),
                    ),
                  ],
                  [
                    model.isInspectorOpen
                      ? 'Hide Model Inspector'
                      : 'Inspect Core Model',
                  ],
                ),
                button(
                  [H.Class('pg-btn'), H.OnClick(ResetPlayground())],
                  ['Reset All'],
                ),
              ],
            ),
          ],
        ),

        div(
          [H.Class('pg-hero-grid')],
          [
            renderBoundFieldHero(model),
            renderPaceHero(model),
            renderCliHero(model),
          ],
        ),

        div(
          [H.Class('pg-filter-bar')],
          [
            div(
              [H.Class('pg-search-wrap')],
              [
                input([
                  H.Class('pg-input'),
                  H.Attribute('type', 'search'),
                  H.Attribute('enterkeyhint', 'search'),
                  H.Value(model.query),
                  H.Placeholder(
                    'Filter all 54 Parts by name, block, Zag/Radix source…',
                  ),
                  H.OnInput(value => UpdatedSearchQuery({ value })),
                ]),
              ],
            ),
            div(
              [H.Class('pg-cat-strip')],
              Array.map(categories, cat =>
                button(
                  [
                    H.Class(
                      model.category === cat
                        ? 'pg-btn pg-btn-sm pg-btn-primary'
                        : 'pg-btn pg-btn-sm',
                    ),
                    H.OnClick(SelectedCategory({ category: cat })),
                  ],
                  [cat === 'All' ? `All (${catalog.length})` : cat],
                ),
              ),
            ),
            span(
              [H.Class('pg-muted mono')],
              [`Showing ${visibleEntries.length}/${catalog.length}`],
            ),
          ],
        ),

        div(
          [H.Class('pg-grid')],
          Array.map(visibleEntries, entry =>
            renderCard(entry, bodies[entry.key] ?? H.empty, model),
          ),
        ),

        renderOverlays(model),
        renderInspectorDock(model),
      ],
    ),
  }
}
