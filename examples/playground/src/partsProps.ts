import { Option } from 'effect'
import {
  AngleSlider,
  Avatar,
  Calendar,
  Carousel,
  CascadeSelect,
  Checkbox,
  Clipboard,
  ColorPicker,
  Combobox,
  DateGrid,
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

export const todayDate: DateGrid.CalendarDate = {
  year: 2026,
  month: 11,
  day: 21,
}

export const defaultDndItems: ReadonlyArray<string> = [
  'Core Machine',
  'Slot Projection',
  'Pace Sync Queue',
  'Generic Host',
]

export const playgroundProps = {
  menu: {
    id: 'pg-menu',
    items: [
      { value: 'sync', label: 'Force Sync Snapshot' },
      { value: 'cli', label: 'Copy CLI Preview Command' },
      { value: 'theme', label: 'Toggle Light / Dark Theme' },
      { value: 'reset', label: 'Reset Demo State' },
    ],
  } satisfies Menu.Props,

  dialog: {
    id: 'pg-dialog',
    isModal: true,
    label: 'Confirm Architecture Review',
  } satisfies Dialog.Props,

  tabs: {
    id: 'pg-tabs',
    defaultValue: 'core',
    items: [
      { value: 'core', label: 'Foldkit Core' },
      { value: 'sync', label: 'Pace Sync' },
      { value: 'hosts', label: 'HTML · React · RN · CLI' },
    ],
  } satisfies Tabs.Props,

  popover: {
    id: 'pg-popover',
    label: 'Placement Details',
  } satisfies Popover.Props,

  disclosure: {
    id: 'pg-disclosure',
    isMultiple: true,
    defaultOpenValues: ['zero-rules'],
    items: [
      { value: 'zero-rules', label: 'Zero Painter Rules' },
      { value: 'sync-default', label: 'Synced by Default' },
      { value: 'device-only', label: 'Opt-out with deviceOnly()' },
    ],
  } satisfies Disclosure.Props,

  switch: {
    id: 'pg-switch',
    label: 'Mirror navigation across sessions',
  } satisfies Switch.Props,

  checkbox: {
    id: 'pg-checkbox',
    label: 'Include derived ARIA attributes',
  } satisfies Checkbox.Props,

  radioGroup: {
    id: 'pg-radio-group',
    defaultValue: 'shared',
    label: 'Session Mode',
    options: [
      { value: 'shared', label: 'SharedDomain' },
      { value: 'mirror', label: 'Mirror' },
      { value: 'local', label: 'DeviceOnly' },
    ],
  } satisfies RadioGroup.Props,

  toggle: {
    id: 'pg-toggle',
    label: 'Pin Inspector',
  } satisfies Toggle.Props,

  toast: {
    id: 'pg-toast',
    defaultDurationMs: 4000,
    maxVisible: 3,
  } satisfies Toast.Props,

  tooltip: {
    id: 'pg-tooltip',
    showDelayMs: 0,
    closeDelayMs: 0,
  } satisfies Tooltip.Props,

  input: {
    id: 'pg-input',
    label: 'Workspace Name',
    placeholder: 'Type fast to watch Pace.Settled…',
  } satisfies Input.Props,

  textarea: {
    id: 'pg-textarea',
    label: 'Release Notes',
    placeholder: 'Multiline FieldDraft with 200ms settle…',
  } satisfies Textarea.Props,

  fieldset: {
    id: 'pg-fieldset',
    label: 'Deploy Settings',
    fieldOrder: ['hostname', 'port'],
    hasLegend: true,
    hasError: true,
  } satisfies Fieldset.Props,

  listbox: {
    id: 'pg-listbox',
    selectionMode: 'Multiple',
    items: [
      { value: 'html', label: 'HTML Painter' },
      { value: 'react', label: 'React Painter' },
      { value: 'rn', label: 'React Native Host' },
      { value: 'cli', label: 'Static CLI ANSI' },
    ],
  } satisfies Listbox.Props,

  select: {
    id: 'pg-select',
    placeholder: 'Pick a sync engine…',
    items: [
      { value: 'instant', label: 'InstantDB SyncEngine' },
      { value: 'memory', label: 'Runtime.Memory (Tests)' },
      { value: 'sqlite', label: 'SQLite Journal' },
    ],
  } satisfies Select.Props,

  combobox: {
    id: 'pg-combobox',
    placeholder: 'Filter 8 Foldkit blocks…',
    items: [
      { value: 'layers', label: 'Layers (dismiss stack)' },
      { value: 'placement', label: 'Placement (flip & shift)' },
      { value: 'rovingFocus', label: 'RovingFocus (keyboard)' },
      { value: 'typeahead', label: 'Typeahead (prefix jump)' },
      { value: 'fieldDraft', label: 'FieldDraft (200ms settle)' },
      { value: 'pointerDrag', label: 'PointerDrag (50ms sample)' },
      { value: 'dateGrid', label: 'DateGrid (calendar math)' },
      { value: 'listFilter', label: 'ListFilter (diacritics)' },
    ],
  } satisfies Combobox.Props,

  slider: {
    id: 'pg-slider',
    min: 0,
    max: 100,
    step: 1,
    largeStep: 10,
    label: 'Playback Gain',
  } satisfies Slider.Props,

  calendar: {
    id: 'pg-calendar',
    today: todayDate,
    label: 'Release Calendar',
  } satisfies Calendar.Props,

  datePicker: {
    id: 'pg-date-picker',
    today: todayDate,
    placeholder: 'YYYY-MM-DD',
    label: 'Launch Date',
  } satisfies DatePicker.Props,

  nav: {
    id: 'pg-nav',
    openDelayMs: 0,
    closeDelayMs: 0,
    items: [
      { value: 'core', label: 'Core', hasSubmenu: true },
      { value: 'painters', label: 'Painters', hasSubmenu: true },
      { value: 'sync', label: 'Sync Engine', hasSubmenu: true },
    ],
  } satisfies Nav.Props,

  dragAndDrop: {
    id: 'pg-dnd',
    containers: [
      {
        id: 'pipeline',
        label: 'Pipeline',
        itemIds: [...defaultDndItems],
      },
    ],
  } satisfies DragAndDrop.Props,

  fileDrop: {
    id: 'pg-file-drop',
    accept: ['image/*', '.md', '.json'],
    multiple: true,
    maxFiles: 4,
    maxFileSize: 5_000_000,
  } satisfies FileDrop.Props,

  virtualList: {
    id: 'pg-virtual-list',
    itemCount: 10_000,
    rowHeightPx: 28,
    overscan: 3,
    label: '10,000 Virtual Rows',
  } satisfies VirtualList.Props,

  presence: {
    id: 'pg-presence',
    isAnimated: true,
  } satisfies Presence.Props,

  drawer: {
    id: 'pg-drawer',
    edge: 'Right',
    snapPoints: [0.4, 0.75, 1],
    defaultSnapPoint: 0.75,
    label: 'Core Architecture Drawer',
  } satisfies Drawer.Props,

  hoverCard: {
    id: 'pg-hover-card',
    openDelayMs: 0,
    closeDelayMs: 0,
  } satisfies HoverCard.Props,

  menubar: {
    id: 'pg-menubar',
    menus: [
      {
        value: 'file',
        label: 'File',
        items: [
          { value: 'new-part', label: 'New Part' },
          { value: 'export-cli', label: 'Render CLI' },
        ],
      },
      {
        value: 'view',
        label: 'View',
        items: [
          { value: 'light', label: 'Light Mode' },
          { value: 'dark', label: 'Dark Mode' },
        ],
      },
    ],
  } satisfies Menubar.Props,

  toolbar: {
    id: 'pg-toolbar',
    items: [
      { value: 'bold', label: 'Bold' },
      { value: 'italic', label: 'Italic' },
      { value: 'code', label: 'Code' },
      { value: 'link', label: 'Link' },
    ],
  } satisfies Toolbar.Props,

  toggleGroup: {
    id: 'pg-toggle-group',
    mode: 'Multiple',
    items: [
      { value: 'html', label: 'HTML' },
      { value: 'react', label: 'React' },
      { value: 'rn', label: 'RN' },
      { value: 'cli', label: 'CLI' },
    ],
  } satisfies ToggleGroup.Props,

  ratingGroup: {
    id: 'pg-rating-group',
    count: 5,
    allowHalf: true,
    label: 'Ergonomics Rating',
  } satisfies RatingGroup.Props,

  numberInput: {
    id: 'pg-number-input',
    min: 0,
    max: 500,
    step: 5,
    largeStep: 25,
    defaultValue: 200,
    label: 'Settle Window (ms)',
  } satisfies NumberInput.Props,

  pinInput: {
    id: 'pg-pin-input',
    length: 4,
    pinType: 'Numeric',
    label: 'Pair Code',
  } satisfies PinInput.Props,

  tagsInput: {
    id: 'pg-tags-input',
    maxTags: 8,
    placeholder: 'Add tag & Enter…',
    label: 'Surface Tags',
  } satisfies TagsInput.Props,

  cascadeSelect: {
    id: 'pg-cascade-select',
    placeholder: 'Pick Layer → Package → Module',
    nodes: [
      {
        id: 'core',
        label: 'Foldkit Core',
        children: [
          {
            id: 'behavior',
            label: 'behavior/',
            children: [
              { id: 'part', label: 'part.ts' },
              { id: 'pace', label: 'pace.ts' },
              { id: 'boundField', label: 'boundField.ts' },
            ],
          },
          {
            id: 'renderers',
            label: 'renderers/',
            children: [
              { id: 'jsx', label: 'jsx.ts' },
              { id: 'cliPaint', label: 'cliPaint.ts' },
            ],
          },
        ],
      },
      {
        id: 'clients',
        label: 'Client Adapters',
        children: [
          {
            id: 'web',
            label: 'Web',
            children: [
              { id: 'htmlHost', label: 'htmlHost.ts' },
              { id: 'reactHost', label: '@foldkit/react' },
            ],
          },
          {
            id: 'native',
            label: 'Mobile & Terminal',
            children: [
              { id: 'rnHost', label: '@foldkit/react-native' },
              { id: 'cliHost', label: 'foldkit/cli' },
            ],
          },
        ],
      },
    ],
  } satisfies CascadeSelect.Props,

  treeView: {
    id: 'pg-tree-view',
    defaultExpandedIds: ['packages', 'foldkit'],
    nodes: [
      {
        id: 'packages',
        label: 'packages/',
        children: [
          {
            id: 'foldkit',
            label: 'foldkit/src/',
            children: [
              { id: 'behavior-dir', label: 'behavior/ (54 Parts)' },
              { id: 'runtime-dir', label: 'runtime/ (Pace sync)' },
              { id: 'renderers-dir', label: 'renderers/ (JSX + CLI)' },
            ],
          },
          { id: 'ui-pkg', label: 'ui/ (25 HTML wrappers)' },
          { id: 'react-pkg', label: 'react/ (generic host)' },
          { id: 'rn-pkg', label: 'react-native/ (generic host)' },
        ],
      },
    ],
  } satisfies TreeView.Props,

  pagination: {
    id: 'pg-pagination',
    count: 140,
    defaultPageSize: 10,
    siblingCount: 1,
    boundaryCount: 1,
  } satisfies Pagination.Props,

  steps: {
    id: 'pg-steps',
    count: 4,
    items: [
      { label: 'Model' },
      { label: 'Machine' },
      { label: 'Slots' },
      { label: 'Painters' },
    ],
  } satisfies Steps.Props,

  tableOfContents: {
    id: 'pg-toc',
    headings: [
      { id: 'intro', label: '1. Pure Core Model', depth: 1 },
      { id: 'parts', label: '2. 54 Composable Parts', depth: 1 },
      { id: 'pace', label: '3. Settled & Sampled Pace', depth: 2 },
      { id: 'painters', label: '4. Dumb Edge Painters', depth: 1 },
    ],
  } satisfies TableOfContents.Props,

  scrollArea: {
    id: 'pg-scroll-area',
    scrollbarVisibility: 'Auto',
    trackSize: 120,
    minThumbPx: 24,
  } satisfies ScrollArea.Props,

  splitter: {
    id: 'pg-splitter',
    defaultSizes: [38, 62],
    panels: [
      { id: 'left', minSize: 20, maxSize: 75, collapsible: true },
      { id: 'right', minSize: 25, maxSize: 80 },
    ],
  } satisfies Splitter.Props,

  angleSlider: {
    id: 'pg-angle-slider',
    step: 15,
    defaultValue: 45,
    label: 'Gradient Angle',
  } satisfies AngleSlider.Props,

  colorPicker: {
    id: 'pg-color-picker',
    swatches: [
      '#3b82f6',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#ec4899',
    ],
  } satisfies ColorPicker.Props,

  carousel: {
    id: 'pg-carousel',
    slideCount: 4,
    loop: true,
    autoplayIntervalMs: 2200,
  } satisfies Carousel.Props,

  floatingPanel: {
    id: 'pg-floating-panel',
    defaultPosition: { x: 16, y: 12 },
    defaultSize: { width: 170, height: 86 },
    minSize: { width: 110, height: 56 },
    maxSize: { width: 250, height: 108 },
    boundaryRect: { x: 0, y: 0, width: 268, height: 114 },
    label: 'Inspector Window',
  } satisfies FloatingPanel.Props,

  imageCropper: {
    id: 'pg-image-cropper',
    viewportSize: { width: 260, height: 114 },
    minSize: { width: 48, height: 40 },
    maxSize: { width: 260, height: 114 },
  } satisfies ImageCropper.Props,

  signaturePad: {
    id: 'pg-signature-pad',
    minPointDistancePx: 3,
    label: 'Sign below',
  } satisfies SignaturePad.Props,

  tour: {
    id: 'pg-tour',
    steps: [
      {
        id: 'step-1',
        title: 'All 54 Parts in Core',
        description:
          'Every state machine lives in packages/foldkit/src/behavior/ with zero DOM or React imports.',
      },
      {
        id: 'step-2',
        title: 'BoundField & Schema',
        description:
          'Bind ModelPath lenses directly to Effect Schema without manual value, onChange, or ARIA props.',
      },
      {
        id: 'step-3',
        title: 'Live Pace Sync Queue',
        description:
          'Typing settles at 200ms, drags sample at 50ms, and secrets stay strictly Device-only.',
      },
    ],
  } satisfies Tour.Props,

  marquee: {
    id: 'pg-marquee',
    direction: 'Left',
    speedPxPerSec: 48,
    pauseOnHover: true,
  } satisfies Marquee.Props,

  timer: {
    id: 'pg-timer',
    countdown: true,
    startMs: 90_000,
    targetMs: 0,
    intervalMs: 1000,
  } satisfies Timer.Props,

  progress: {
    id: 'pg-progress',
    kind: 'Meter',
    min: 0,
    max: 100,
    low: 35,
    high: 75,
    optimum: 85,
  } satisfies Progress.Props,

  avatar: {
    id: 'pg-avatar',
    name: 'Michael Foldkit',
    src: Option.none(),
  } satisfies Avatar.Props,

  clipboard: {
    id: 'pg-clipboard',
    defaultValue: 'pnpm --filter @foldkit/playground cli',
    timeoutMs: 2000,
  } satisfies Clipboard.Props,

  qrCode: {
    id: 'pg-qr-code',
    level: 'M',
  } satisfies QrCode.Props,
}
