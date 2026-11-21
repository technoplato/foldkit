import { Array, Option } from 'effect'
import {
  Checkbox,
  Combobox,
  Dialog,
  Disclosure,
  Fieldset,
  Input,
  Listbox,
  Menu,
  Popover,
  RadioGroup,
  Select,
  Slider,
  Switch,
  Tabs,
  Textarea,
  Toast,
  Toggle,
  Tooltip,
} from 'foldkit/behavior'
import type { Html } from 'foldkit/html'

import { H, dispatchPart } from '../messages'
import { playgroundProps } from '../partsProps'
import type { PlaygroundModel } from '../state'

const { div, button, input, textarea, span } = H

export const renderGroup1 = (
  model: PlaygroundModel,
): Readonly<Record<string, Html>> => {
  const { parts } = model

  // 1. Menu
  const menuOpen = parts.menu._tag === 'Open'
  const menuLast =
    parts.menu._tag === 'Closed'
      ? Option.getOrElse(parts.menu.maybeLastSelected, () => 'none')
      : 'open'
  const menuView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-primary'),
              H.OnClick(dispatchPart('menu', Menu.ToggleMenu())),
            ],
            [menuOpen ? 'Close Menu ▴' : 'Open Menu ▾'],
          ),
          span([H.Class('pg-muted')], [`Last: ${menuLast}`]),
        ],
      ),
      menuOpen
        ? div(
            [H.Class('pg-popup'), H.Role('menu')],
            Array.map(playgroundProps.menu.items, item =>
              button(
                [
                  H.Class('pg-menu-item'),
                  H.OnClick(
                    dispatchPart(
                      'menu',
                      Menu.SelectMenuItem({ value: item.value }),
                    ),
                  ),
                ],
                [item.label],
              ),
            ),
          )
        : H.empty,
    ],
  )

  // 2. Dialog
  const dialogOpen = parts.dialog._tag === 'Open'
  const dialogView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-primary'),
              H.OnClick(dispatchPart('dialog', Dialog.OpenDialog())),
            ],
            ['Open Modal Dialog'],
          ),
          span(
            [H.Class('pg-pill')],
            [dialogOpen ? 'State: Open (modal)' : 'State: Closed'],
          ),
        ],
      ),
      span(
        [H.Class('pg-muted')],
        [
          'Opens a real backdrop overlay driven by Dialog + Layers + FocusScope.',
        ],
      ),
    ],
  )

  // 3. Tabs
  const activeTab = Option.getOrElse(
    parts.tabs.maybeSelectedValue,
    () => 'core',
  )
  const tabCopy: Readonly<Record<string, string>> = {
    core: 'All 54 Parts live in packages/foldkit/src/behavior/ with zero DOM or React imports.',
    sync: 'Typing settles at 200ms, drags sample at 50ms, and Submit flushes causally.',
    hosts:
      'HTML, React, React Native, and Static CLI consume the same SlotBindings.',
  }
  const tabsView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row'), H.Role('tablist')],
        Array.map(playgroundProps.tabs.items, item =>
          button(
            [
              H.Class(
                activeTab === item.value
                  ? 'pg-btn pg-btn-sm pg-btn-active'
                  : 'pg-btn pg-btn-sm',
              ),
              H.Role('tab'),
              H.OnClick(
                dispatchPart('tabs', Tabs.SelectTab({ value: item.value })),
              ),
            ],
            [item.label],
          ),
        ),
      ),
      div([H.Class('pg-surface-box pg-muted')], [tabCopy[activeTab] ?? '']),
    ],
  )

  // 4. Popover
  const popoverOpen = parts.popover._tag === 'Open'
  const popoverView = div(
    [H.Class('pg-col')],
    [
      button(
        [
          H.Class('pg-btn'),
          H.OnClick(dispatchPart('popover', Popover.TogglePopover())),
        ],
        [popoverOpen ? 'Hide Popover' : 'Show Anchored Popover'],
      ),
      popoverOpen
        ? div(
            [H.Class('pg-popup')],
            [
              span([H.Class('mono')], ['Placement: flip + shift + Layers']),
              button(
                [
                  H.Class('pg-btn pg-btn-sm'),
                  H.OnClick(dispatchPart('popover', Popover.ClosePopover())),
                ],
                ['Dismiss'],
              ),
            ],
          )
        : H.empty,
    ],
  )

  // 5. Disclosure & Accordion
  const disclosureItems = playgroundProps.disclosure.items ?? []
  const disclosureCopy: Readonly<Record<string, string>> = {
    'zero-rules': 'Painters hold zero timers, thresholds, or gesture branches.',
    'sync-default': 'Every Part syncs across sessions out of the box.',
    'device-only': 'Call Part.deviceOnly() to keep transient state local.',
  }
  const disclosureView = div(
    [H.Class('pg-col')],
    Array.map(disclosureItems, item => {
      const isOpen = Disclosure.isItemOpen(
        parts.disclosure,
        playgroundProps.disclosure,
        item.value,
      )
      return div(
        [H.Class('pg-surface-box')],
        [
          button(
            [
              H.Class('pg-menu-item'),
              H.OnClick(
                dispatchPart(
                  'disclosure',
                  Disclosure.ToggleDisclosureItem({ value: item.value }),
                ),
              ),
            ],
            [span([], [item.label]), span([], [isOpen ? '▾' : '▸'])],
          ),
          isOpen
            ? div([H.Class('pg-muted')], [disclosureCopy[item.value] ?? ''])
            : H.empty,
        ],
      )
    }),
  )

  // 6. Switch
  const switchOn = parts.switch._tag === 'On'
  const switchView = div(
    [H.Class('pg-row')],
    [
      button(
        [
          H.Class(switchOn ? 'pg-switch pg-switch-on' : 'pg-switch'),
          H.Role('switch'),
          H.Attribute('aria-checked', switchOn ? 'true' : 'false'),
          H.OnClick(dispatchPart('switch', Switch.ToggleSwitch())),
        ],
        [span([H.Class('pg-switch-thumb')], [])],
      ),
      span([], [switchOn ? 'Mirror Navigation: ON' : 'Mirror Navigation: OFF']),
    ],
  )

  // 7. Checkbox
  const cbTag = parts.checkbox._tag
  const checkboxView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class(
                cbTag === 'Checked'
                  ? 'pg-btn pg-btn-primary pg-btn-sm'
                  : 'pg-btn pg-btn-sm',
              ),
              H.OnClick(dispatchPart('checkbox', Checkbox.ToggleCheckbox())),
            ],
            [
              cbTag === 'Checked'
                ? '☑ Checked'
                : cbTag === 'Indeterminate'
                  ? '⊟ Indeterminate'
                  : '☐ Unchecked',
            ],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart('checkbox', Checkbox.SetCheckboxIndeterminate()),
              ),
            ],
            ['Set Indeterminate'],
          ),
        ],
      ),
      span([H.Class('pg-muted')], [`Core variant: Checkbox.${cbTag}()`]),
    ],
  )

  // 8. RadioGroup
  const selectedRadio = Option.getOrElse(
    parts.radioGroup.maybeSelectedValue,
    () => 'shared',
  )
  const radioGroupView = div(
    [H.Class('pg-row'), H.Role('radiogroup')],
    Array.map(playgroundProps.radioGroup.options, opt =>
      button(
        [
          H.Class(
            selectedRadio === opt.value
              ? 'pg-btn pg-btn-sm pg-btn-active'
              : 'pg-btn pg-btn-sm',
          ),
          H.Role('radio'),
          H.OnClick(
            dispatchPart(
              'radioGroup',
              RadioGroup.SelectRadioOption({ value: opt.value }),
            ),
          ),
        ],
        [selectedRadio === opt.value ? `◉ ${opt.label}` : `○ ${opt.label}`],
      ),
    ),
  )

  // 9. Button & Toggle
  const togglePressed = parts.toggle._tag === 'Pressed'
  const toggleView = div(
    [H.Class('pg-row')],
    [
      button(
        [
          H.Class(togglePressed ? 'pg-btn pg-btn-primary' : 'pg-btn'),
          H.Attribute('aria-pressed', togglePressed ? 'true' : 'false'),
          H.OnClick(dispatchPart('toggle', Toggle.ToggleButton())),
        ],
        [togglePressed ? '★ Starred (Pressed)' : '☆ Star Part (Unpressed)'],
      ),
      span([H.Class('pg-muted')], [`Variant: ${parts.toggle._tag}`]),
    ],
  )

  // 10. Toast
  const toastEntries = Toast.entriesOf(parts.toast)
  const toastView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-primary pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'toast',
                  Toast.ShowToast({
                    title: 'Snapshot synced',
                    description: `Entry #${toastEntries.length + 1} via TimedHint`,
                    variant: 'Success',
                  }),
                ),
              ),
            ],
            ['+ Push Toast'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('toast', Toast.DismissAllToasts())),
            ],
            ['Clear All'],
          ),
        ],
      ),
      Array.isReadonlyArrayEmpty(toastEntries)
        ? span([H.Class('pg-muted')], ['Queue empty — push a toast above.'])
        : div(
            [H.Class('pg-col')],
            Array.map(toastEntries, entry =>
              H.keyed('div')(
                entry.id,
                [H.Class('pg-surface-box pg-row')],
                [
                  span([], [entry.title]),
                  button(
                    [
                      H.Class('pg-btn pg-btn-sm'),
                      H.OnClick(
                        dispatchPart(
                          'toast',
                          Toast.DismissToast({ entryId: entry.id }),
                        ),
                      ),
                    ],
                    ['✕'],
                  ),
                ],
              ),
            ),
          ),
    ],
  )

  // 11. Tooltip
  const tooltipOpen = Tooltip.isOpen(parts.tooltip)
  const tooltipView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn'),
              H.OnMouseEnter(dispatchPart('tooltip', Tooltip.ShowTooltip())),
              H.OnMouseLeave(dispatchPart('tooltip', Tooltip.HideTooltip())),
              H.OnClick(
                dispatchPart(
                  'tooltip',
                  tooltipOpen ? Tooltip.HideTooltip() : Tooltip.ShowTooltip(),
                ),
              ),
            ],
            ['Hover or Click for Tooltip'],
          ),
        ],
      ),
      tooltipOpen
        ? div(
            [H.Class('pg-popup'), H.Role('tooltip')],
            ['Pure HoverIntent + Placement tooltip (Device-only).'],
          )
        : span([H.Class('pg-muted')], ['Hover or tap the trigger above.']),
    ],
  )

  // 12. Input
  const inputDraft = Input.draftOf(parts.input)
  const inputDirty = Input.isDirty(parts.input)
  const inputView = div(
    [H.Class('pg-col')],
    [
      input([
        H.Class('pg-input'),
        H.Value(inputDraft),
        H.Placeholder(playgroundProps.input.placeholder ?? ''),
        H.OnInput(value => dispatchPart('input', Input.ChangeInput({ value }))),
        H.OnBlur(dispatchPart('input', Input.CommitInput())),
      ]),
      div(
        [H.Class('pg-row')],
        [
          span(
            [
              H.Class(
                inputDirty
                  ? 'pg-pill pg-pill-warning'
                  : 'pg-pill pg-pill-positive',
              ),
            ],
            [inputDirty ? 'Dirty Draft (Settled 200ms)' : 'Committed'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('input', Input.CommitInput())),
            ],
            ['Commit'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('input', Input.CancelInput())),
            ],
            ['Cancel'],
          ),
        ],
      ),
    ],
  )

  // 13. Textarea
  const taDraft = Textarea.draftOf(parts.textarea)
  const textareaView = div(
    [H.Class('pg-col')],
    [
      textarea(
        [
          H.Class('pg-textarea'),
          H.Attribute('rows', '2'),
          H.Value(taDraft),
          H.OnInput(value =>
            dispatchPart('textarea', Textarea.ChangeTextarea({ value })),
          ),
        ],
        [],
      ),
      span(
        [H.Class('pg-muted')],
        [`${taDraft.length} chars · Pace.Settled(200ms)`],
      ),
    ],
  )

  // 14. Fieldset
  const fsDisabled = parts.fieldset.isDisabled
  const fsErrors = Fieldset.errorsOf(parts.fieldset)
  const fsErrorCount = Object.keys(fsErrors).length
  const fieldsetView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'fieldset',
                  Fieldset.SetFieldError({
                    field: 'hostname',
                    message: 'Hostname must end in .pisspoursoftware.xyz',
                  }),
                ),
              ),
            ],
            ['Inject Error'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'fieldset',
                  Fieldset.SetDisabled({ isDisabled: !fsDisabled }),
                ),
              ),
            ],
            [fsDisabled ? 'Enable' : 'Disable'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('fieldset', Fieldset.ResetFieldset())),
            ],
            ['Reset'],
          ),
        ],
      ),
      span(
        [H.Class(fsErrorCount > 0 ? 'pg-error' : 'pg-muted')],
        [
          fsErrorCount > 0
            ? `${fsErrorCount} error: ${fsErrors['hostname'] ?? ''}`
            : `Disabled: ${String(fsDisabled)} · Clean fieldset`,
        ],
      ),
    ],
  )

  // 15. Listbox
  const listboxSelected = Listbox.selectedValuesOf(parts.listbox)
  const listboxView = div(
    [H.Class('pg-col'), H.Role('listbox')],
    Array.map(playgroundProps.listbox.items, item => {
      const isSelected = Array.contains(listboxSelected, item.value)
      return button(
        [
          H.Class(
            isSelected ? 'pg-menu-item pg-menu-item-active' : 'pg-menu-item',
          ),
          H.OnClick(
            dispatchPart(
              'listbox',
              Listbox.SelectListboxOption({ value: item.value }),
            ),
          ),
        ],
        [span([], [item.label]), span([], [isSelected ? '✓' : ''])],
      )
    }),
  )

  // 16. Select
  const selectOpen = parts.select._tag === 'Open'
  const selectValues = Select.selectedValuesOf(parts.select)
  const selectedLabel = Option.getOrElse(
    Array.findFirst(playgroundProps.select.items, i =>
      Array.contains(selectValues, i.value),
    ),
    () => ({ value: '', label: playgroundProps.select.placeholder ?? 'Pick…' }),
  ).label
  const selectView = div(
    [H.Class('pg-col')],
    [
      button(
        [
          H.Class('pg-btn'),
          H.OnClick(dispatchPart('select', Select.ToggleSelect())),
        ],
        [`${selectedLabel} ${selectOpen ? '▴' : '▾'}`],
      ),
      selectOpen
        ? div(
            [H.Class('pg-popup')],
            Array.map(playgroundProps.select.items, item =>
              button(
                [
                  H.Class(
                    Array.contains(selectValues, item.value)
                      ? 'pg-menu-item pg-menu-item-active'
                      : 'pg-menu-item',
                  ),
                  H.OnClick(
                    dispatchPart(
                      'select',
                      Select.SelectOption({ value: item.value }),
                    ),
                  ),
                ],
                [item.label],
              ),
            ),
          )
        : H.empty,
    ],
  )

  // 17. Combobox
  const comboQuery = Combobox.inputValueOf(parts.combobox)
  const comboFiltered = Combobox.filteredItemsOf(
    parts.combobox,
    playgroundProps.combobox,
  )
  const comboSelected = Combobox.selectedValuesOf(parts.combobox)
  const comboboxView = div(
    [H.Class('pg-col')],
    [
      input([
        H.Class('pg-input'),
        H.Value(comboQuery),
        H.Placeholder(playgroundProps.combobox.placeholder ?? ''),
        H.OnFocus(dispatchPart('combobox', Combobox.OpenCombobox())),
        H.OnInput(value =>
          dispatchPart('combobox', Combobox.ChangeComboboxInput({ value })),
        ),
      ]),
      div(
        [H.Class('pg-row')],
        Array.map(Array.take(comboFiltered, 4), item =>
          button(
            [
              H.Class(
                Array.contains(comboSelected, item.value)
                  ? 'pg-btn pg-btn-sm pg-btn-active'
                  : 'pg-btn pg-btn-sm',
              ),
              H.OnClick(
                dispatchPart(
                  'combobox',
                  Combobox.SelectComboboxOption({ value: item.value }),
                ),
              ),
            ],
            [item.label.split(' ')[0] ?? item.label],
          ),
        ),
      ),
    ],
  )

  // 18. Slider
  const sliderVal = parts.slider.values[0] ?? 0
  const sliderView = div(
    [H.Class('pg-col')],
    [
      input([
        H.Type('range'),
        H.Min('0'),
        H.Max('100'),
        H.Step('1'),
        H.Value(String(sliderVal)),
        H.OnInput(raw =>
          dispatchPart('slider', Slider.SetSliderValue({ value: Number(raw) })),
        ),
      ]),
      div(
        [H.Class('pg-row')],
        [
          span(
            [H.Class('pg-pill pg-pill-accent mono')],
            [`${sliderVal} / 100`],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'slider',
                  Slider.StepSlider({ direction: 'StepIncrement' }),
                ),
              ),
            ],
            ['+1'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('slider', Slider.ResetSlider())),
            ],
            ['Reset'],
          ),
        ],
      ),
    ],
  )

  return {
    menu: menuView,
    dialog: dialogView,
    tabs: tabsView,
    popover: popoverView,
    disclosure: disclosureView,
    switch: switchView,
    checkbox: checkboxView,
    radioGroup: radioGroupView,
    toggle: toggleView,
    toast: toastView,
    tooltip: tooltipView,
    input: inputView,
    textarea: textareaView,
    fieldset: fieldsetView,
    listbox: listboxView,
    select: selectView,
    combobox: comboboxView,
    slider: sliderView,
  }
}
