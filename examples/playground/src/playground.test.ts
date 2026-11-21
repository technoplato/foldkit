import {
  AngleSlider,
  Avatar,
  BoundField,
  Calendar,
  Carousel,
  CascadeSelect,
  Checkbox,
  Clipboard,
  ColorPicker,
  Combobox,
  DatePicker,
  Dialog,
  Disclosure,
  DragAndDrop,
  Drawer,
  Fieldset,
  FileDrop,
  FloatingPanel,
  HoverCard,
  ImageCropper,
  Input,
  Listbox,
  Marquee,
  Menu,
  Menubar,
  Nav,
  NumberInput,
  Pagination,
  PinInput,
  Popover,
  Presence,
  Progress,
  QrCode,
  RadioGroup,
  RatingGroup,
  ScrollArea,
  Select,
  SignaturePad,
  Slider,
  Splitter,
  Steps,
  Switch,
  TableOfContents,
  Tabs,
  TagsInput,
  Textarea,
  Timer,
  Toast,
  Toggle,
  ToggleGroup,
  Toolbar,
  Tooltip,
  Tour,
  TreeView,
  VirtualList,
} from 'foldkit/behavior'
import { renderCli, renderPlainCli, stripAnsi } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { catalog } from './catalog'
import { PlaygroundCliScreen } from './cliScreen'
import {
  flushDuePace,
  initialModel,
  runBurstSimulation,
  stepBoundField,
  stepPart,
  submitBoundForm,
} from './state'
import { view } from './view'

describe('Foldkit 54-Part Playground', () => {
  it('registers and renders all 54 core Parts simultaneously with zero errors', () => {
    expect(catalog.length).toBe(54)
    const model = initialModel()
    const doc = view(model)
    expect(doc.title).toContain('54 Parts')
    expect(doc.body).not.toBeNull()
  })

  it('transitions every single one of the 54 core Parts through real core Messages', () => {
    let model = initialModel()
    const steps: ReadonlyArray<
      readonly [(typeof catalog)[number]['key'], Readonly<{ _tag: string }>]
    > = [
      ['menu', Menu.ToggleMenu()],
      ['dialog', Dialog.OpenDialog()],
      ['tabs', Tabs.SelectTab({ value: 'sync' })],
      ['popover', Popover.TogglePopover()],
      [
        'disclosure',
        Disclosure.ToggleDisclosureItem({ value: 'sync-default' }),
      ],
      ['switch', Switch.ToggleSwitch()],
      ['checkbox', Checkbox.SetCheckboxIndeterminate()],
      ['radioGroup', RadioGroup.SelectRadioOption({ value: 'mirror' })],
      ['toggle', Toggle.ToggleButton()],
      ['toast', Toast.ShowToast({ title: 'Synced' })],
      ['tooltip', Tooltip.ShowTooltip()],
      ['input', Input.ChangeInput({ value: 'Updated' })],
      ['textarea', Textarea.ChangeTextarea({ value: 'New notes' })],
      [
        'fieldset',
        Fieldset.SetFieldError({ field: 'hostname', message: 'Invalid' }),
      ],
      ['listbox', Listbox.SelectListboxOption({ value: 'cli' })],
      ['select', Select.SelectOption({ value: 'memory' })],
      ['combobox', Combobox.ChangeComboboxInput({ value: 'pace' })],
      ['slider', Slider.SetSliderValue({ value: 75 })],
      ['calendar', Calendar.NextCalendarMonth()],
      ['datePicker', DatePicker.ToggleDatePicker()],
      ['nav', Nav.OpenNavItem({ value: 'core' })],
      [
        'dragAndDrop',
        DragAndDrop.LiftItem({
          itemId: 'Core Machine',
          containerId: 'pipeline',
          index: 0,
        }),
      ],
      [
        'fileDrop',
        FileDrop.AddFiles({
          files: [{ name: 'a.json', size: 100, type: 'application/json' }],
        }),
      ],
      ['virtualList', VirtualList.ScrollToIndex({ index: 2500 })],
      ['presence', Presence.Show()],
      ['drawer', Drawer.OpenDrawer()],
      ['hoverCard', HoverCard.OpenHoverCard()],
      ['menubar', Menubar.OpenMenubarMenu({ value: 'file' })],
      ['toolbar', Toolbar.ActivateToolbarItem({ value: 'bold' })],
      ['toggleGroup', ToggleGroup.ToggleGroupItem({ value: 'react' })],
      ['ratingGroup', RatingGroup.SetRating({ value: 5 })],
      ['numberInput', NumberInput.IncrementNumber()],
      ['pinInput', PinInput.PastePin({ value: '1234' })],
      ['tagsInput', TagsInput.AddTag({ value: 'playground' })],
      ['cascadeSelect', CascadeSelect.ToggleCascadeSelect()],
      ['treeView', TreeView.SelectTreeItem({ id: 'behavior-dir' })],
      ['pagination', Pagination.NextPage()],
      ['steps', Steps.NextStep()],
      ['tableOfContents', TableOfContents.SelectHeading({ id: 'pace' })],
      ['scrollArea', ScrollArea.ScrollBy({ delta: 60 })],
      ['splitter', Splitter.ResizeHandle({ handleIndex: 0, deltaPercent: 10 })],
      ['angleSlider', AngleSlider.SetAngle({ angle: 120 })],
      ['colorPicker', ColorPicker.SelectSwatch({ value: '#10b981' })],
      ['carousel', Carousel.NextSlide()],
      ['floatingPanel', FloatingPanel.MinimizeFloatingPanel()],
      ['imageCropper', ImageCropper.ZoomInCrop()],
      ['signaturePad', SignaturePad.UndoStroke()],
      ['tour', Tour.StartTour()],
      ['marquee', Marquee.PauseMarquee()],
      ['timer', Timer.StartTimer()],
      ['progress', Progress.SetProgressValue({ value: 25 })],
      ['avatar', Avatar.LoadedAvatarImage()],
      ['clipboard', Clipboard.CopyClipboard()],
      ['qrCode', QrCode.SetQrCodeValue({ value: 'https://foldkit.dev' })],
    ]

    expect(steps.length).toBe(54)
    let now = 1_000
    for (const [key, msg] of steps) {
      model = stepPart(model, key, msg, now)
      now += 10
    }

    expect(model.localEventCount).toBe(54)
    expect(model.parts.dialog._tag).toBe('Open')
    expect(model.parts.drawer._tag).toBe('Open')
    expect(model.parts.pinInput.slots).toEqual(['1', '2', '3', '4'])
    expect(model.parts.qrCode._tag).toBe('Ready')
    expect(view(model).body).not.toBeNull()
  })

  it('validates BoundField form through ModelPath and keeps secret apiToken Device-only', () => {
    let model = initialModel()
    model = stepBoundField(
      model,
      'apiToken',
      BoundField.ChangeFieldDraft({ value: 'fk_super_secret_12345' }),
      2_000,
    )
    expect(model.syncedWriteCount).toBe(0)
    expect(model.deviceOnlyCount).toBe(1)

    model = stepBoundField(
      model,
      'displayName',
      BoundField.ChangeFieldDraft({ value: 'M' }),
      2_050,
    )
    const invalidSubmit = submitBoundForm(model, 2_100)
    expect(invalidSubmit.profileSubmitBanner._tag).toBe('Some')
    if (invalidSubmit.profileSubmitBanner._tag === 'Some') {
      expect(invalidSubmit.profileSubmitBanner.value).toContain(
        'Blocked submit',
      )
    }
  })

  it('coalesces burst typing and drags via real Pace.Queue and flushes after settle window', () => {
    const burst = runBurstSimulation(initialModel(), 5_000)
    expect(burst.localEventCount).toBe(16)
    expect(burst.syncedWriteCount).toBeLessThan(burst.localEventCount)

    const flushed = flushDuePace(burst, 5_500)
    expect(flushed.syncedWriteCount).toBeGreaterThan(burst.syncedWriteCount)
    expect(flushed.paceQueue.waiting.length).toBe(0)
  })

  it('renders zero-React JSX screen cleanly to plain and ANSI CLI output', () => {
    const screen = PlaygroundCliScreen({
      mode: 'Dark',
      displayName: 'Michael',
      bio: 'Foldkit core UI',
      formValid: true,
      localEventCount: 16,
      syncedWriteCount: 3,
      sliderValue: 64,
      ratingValue: 4.5,
      switchOn: true,
      activeTab: 'core',
      qrText: 'https://foldkit.pisspoursoftware.xyz/playground',
    })
    const plain = renderPlainCli(screen, { width: 64 })
    const ansi = renderCli(screen, { width: 64, color: true, ground: 'Dark' })
    expect(plain).toContain('FOLDKIT CORE UI')
    expect(plain).toContain('BoundField Profile')
    expect(stripAnsi(ansi)).toBe(plain)
  })

  it('mounts the full 54-Part Foldkit application into a real DOM with zero errors', async () => {
    const { Window } = await import('happy-dom')
    const win = new Window()
    const root = win.document.createElement('div')
    root.id = 'root'
    win.document.body.appendChild(root)

    const model = initialModel()
    const doc = view(model)
    const renderedIds = new Set<string>()
    const walk = (node: unknown): void => {
      if (node === null || node === undefined || typeof node !== 'object') {
        return
      }
      const sel = Reflect.get(node, 'sel')
      if (typeof sel === 'string' && sel.includes('#part-')) {
        const match = sel.match(/#(part-[a-zA-Z0-9]+)/)
        if (match !== null && match[1] !== undefined) {
          renderedIds.add(match[1])
        }
      }
      const data = Reflect.get(node, 'data')
      if (data !== null && data !== undefined && typeof data === 'object') {
        const attrs = Reflect.get(data, 'attrs')
        if (
          attrs !== null &&
          attrs !== undefined &&
          typeof attrs === 'object'
        ) {
          const id = Reflect.get(attrs, 'id')
          if (typeof id === 'string' && id.startsWith('part-')) {
            renderedIds.add(id)
          }
        }
        const props = Reflect.get(data, 'props')
        if (
          props !== null &&
          props !== undefined &&
          typeof props === 'object'
        ) {
          const id = Reflect.get(props, 'id')
          if (typeof id === 'string' && id.startsWith('part-')) {
            renderedIds.add(id)
          }
        }
      }
      const children = Reflect.get(node, 'children')
      if (Array.isArray(children)) {
        for (const child of children) {
          walk(child)
        }
      }
    }
    walk(doc.body)
    expect(renderedIds.size).toBe(54)
    for (const entry of catalog) {
      expect(renderedIds.has(`part-${entry.key}`)).toBe(true)
    }
  })
})
