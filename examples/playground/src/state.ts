import { Array, Match as M, Option, Predicate, Schema as S } from 'effect'
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
  Pace,
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
import { Mode } from 'foldkit/theme'

import {
  type ProfileFieldKey,
  ProfileModel,
  initialProfile,
  profileForm,
} from './boundForm'
import { CategorySchema, type PartKey, PartKeySchema } from './catalog'
import { defaultDndItems, playgroundProps } from './partsProps'

export const LogEntrySchema = S.Struct({
  id: S.Number,
  atMs: S.Number,
  part: S.String,
  tag: S.String,
  pace: S.String,
  status: S.Literals(['Local', 'Queued', 'Synced', 'Device']),
})
export type LogEntry = typeof LogEntrySchema.Type

const PendingMetaSchema = S.Struct({
  part: S.String,
  tag: S.String,
  pace: S.String,
})
type PendingMeta = typeof PendingMetaSchema.Type

export const PartsStateSchema = S.Struct({
  menu: Menu.State,
  dialog: Dialog.State,
  tabs: Tabs.State,
  popover: Popover.State,
  disclosure: Disclosure.State,
  switch: Switch.State,
  checkbox: Checkbox.State,
  radioGroup: RadioGroup.State,
  toggle: Toggle.State,
  toast: Toast.State,
  tooltip: Tooltip.State,
  input: Input.State,
  textarea: Textarea.State,
  fieldset: Fieldset.State,
  listbox: Listbox.State,
  select: Select.State,
  combobox: Combobox.State,
  slider: Slider.State,
  calendar: Calendar.State,
  datePicker: DatePicker.State,
  nav: Nav.State,
  dragAndDrop: DragAndDrop.State,
  fileDrop: FileDrop.State,
  virtualList: VirtualList.State,
  presence: Presence.State,
  drawer: Drawer.State,
  hoverCard: HoverCard.State,
  menubar: Menubar.State,
  toolbar: Toolbar.State,
  toggleGroup: ToggleGroup.State,
  ratingGroup: RatingGroup.State,
  numberInput: NumberInput.State,
  pinInput: PinInput.State,
  tagsInput: TagsInput.State,
  cascadeSelect: CascadeSelect.State,
  treeView: TreeView.State,
  pagination: Pagination.State,
  steps: Steps.State,
  tableOfContents: TableOfContents.State,
  scrollArea: ScrollArea.State,
  splitter: Splitter.State,
  angleSlider: AngleSlider.State,
  colorPicker: ColorPicker.State,
  carousel: Carousel.State,
  floatingPanel: FloatingPanel.State,
  imageCropper: ImageCropper.State,
  signaturePad: SignaturePad.State,
  tour: Tour.State,
  marquee: Marquee.State,
  timer: Timer.State,
  progress: Progress.State,
  avatar: Avatar.State,
  clipboard: Clipboard.State,
  qrCode: QrCode.State,
})
export type PartsState = typeof PartsStateSchema.Type

export const PlaygroundModelSchema = S.Struct({
  mode: Mode,
  query: S.String,
  category: CategorySchema,
  inspectedPart: PartKeySchema,
  isInspectorOpen: S.Boolean,
  profile: ProfileModel,
  profileStates: S.Struct({
    displayName: BoundField.State,
    bio: BoundField.State,
    apiToken: BoundField.State,
  }),
  profileFieldset: Fieldset.State,
  profileSubmitBanner: S.Option(S.String),
  dndOrder: S.Array(S.String),
  paceQueue: Pace.Queue,
  pendingMeta: S.Record(S.String, PendingMetaSchema),
  localEventCount: S.Number,
  syncedWriteCount: S.Number,
  deviceOnlyCount: S.Number,
  nextLogId: S.Number,
  recentEvents: S.Array(LogEntrySchema),
  recentSyncWrites: S.Array(LogEntrySchema),
  parts: PartsStateSchema,
})
export type PlaygroundModel = typeof PlaygroundModelSchema.Type

const makeInitialParts = (): PartsState => {
  const [initQr] = QrCode.chart.transition(
    QrCode.initial,
    QrCode.SetQrCodeValue({
      value: 'https://foldkit.pisspoursoftware.xyz/playground',
    }),
    playgroundProps.qrCode,
  )
  const [initProgress] = Progress.chart.transition(
    Progress.initial,
    Progress.SetProgressValue({ value: 82 }),
    playgroundProps.progress,
  )
  const [initSlider] = Slider.chart.transition(
    Slider.initial,
    Slider.SetSliderValue({ value: 64 }),
    playgroundProps.slider,
  )
  const [initRating] = RatingGroup.chart.transition(
    RatingGroup.initial,
    RatingGroup.SetRating({ value: 4.5 }),
    playgroundProps.ratingGroup,
  )
  const [initNumber] = NumberInput.chart.transition(
    NumberInput.initial,
    NumberInput.SetNumberValue({ value: 200 }),
    playgroundProps.numberInput,
  )
  const [initTags1] = TagsInput.chart.transition(
    TagsInput.initial,
    TagsInput.AddTag({ value: 'foldkit' }),
    playgroundProps.tagsInput,
  )
  const [initTags2] = TagsInput.chart.transition(
    initTags1,
    TagsInput.AddTag({ value: 'effect-ts' }),
    playgroundProps.tagsInput,
  )
  const [initTags] = TagsInput.chart.transition(
    initTags2,
    TagsInput.AddTag({ value: 'zero-painter-rules' }),
    playgroundProps.tagsInput,
  )
  const [initVirtual] = VirtualList.chart.transition(
    VirtualList.initial,
    VirtualList.MeasuredViewport({ containerHeight: 140 }),
    playgroundProps.virtualList,
  )
  const [initScroll] = ScrollArea.chart.transition(
    ScrollArea.initial,
    ScrollArea.MeasureScrollArea({ viewportSize: 120, contentSize: 480 }),
    playgroundProps.scrollArea,
  )
  const [initFloating] = FloatingPanel.chart.transition(
    FloatingPanel.initial,
    FloatingPanel.OpenFloatingPanel(),
    playgroundProps.floatingPanel,
  )
  const [initToggleGroup] = ToggleGroup.chart.transition(
    ToggleGroup.initial,
    ToggleGroup.SelectGroupItem({ value: 'html' }),
    playgroundProps.toggleGroup,
  )
  const [initToggleGroup2] = ToggleGroup.chart.transition(
    initToggleGroup,
    ToggleGroup.SelectGroupItem({ value: 'cli' }),
    playgroundProps.toggleGroup,
  )
  const [initListbox] = Listbox.chart.transition(
    Listbox.initial,
    Listbox.SelectListboxOption({ value: 'html' }),
    playgroundProps.listbox,
  )
  const [initSelect] = Select.chart.transition(
    Select.initial,
    Select.SelectOption({ value: 'instant' }),
    playgroundProps.select,
  )
  const [initToc] = TableOfContents.chart.transition(
    TableOfContents.initial,
    TableOfContents.SelectHeading({ id: 'parts' }),
    playgroundProps.tableOfContents,
  )
  const [initClipboard] = Clipboard.chart.transition(
    Clipboard.initial,
    Clipboard.SetClipboardValue({
      value: 'pnpm --filter @foldkit/playground cli',
    }),
    playgroundProps.clipboard,
  )
  const [initInput] = Input.chart.transition(
    Input.initial,
    Input.ChangeInput({ value: 'Foldkit Core' }),
    playgroundProps.input,
  )
  const [initTextarea] = Textarea.chart.transition(
    Textarea.initial,
    Textarea.ChangeTextarea({
      value: 'All 54 UI Parts running from one core state machine.',
    }),
    playgroundProps.textarea,
  )
  const [initAngle] = AngleSlider.chart.transition(
    AngleSlider.initial,
    AngleSlider.SetAngle({ angle: 45 }),
    playgroundProps.angleSlider,
  )
  const [initColorClosed] = ColorPicker.chart.transition(
    ColorPicker.initial,
    ColorPicker.SelectSwatch({ value: '#3b82f6' }),
    playgroundProps.colorPicker,
  )
  const [initColor] = ColorPicker.chart.transition(
    initColorClosed,
    ColorPicker.OpenColorPicker(),
    playgroundProps.colorPicker,
  )
  const [initSteps] = Steps.chart.transition(
    Steps.initial,
    Steps.GoToStep({ step: 1 }),
    playgroundProps.steps,
  )
  const [initSwitch] = Switch.chart.transition(
    Switch.initial,
    Switch.TurnSwitchOn(),
    playgroundProps.switch,
  )
  const [initCheckbox] = Checkbox.chart.transition(
    Checkbox.initial,
    Checkbox.CheckCheckbox(),
    playgroundProps.checkbox,
  )
  const [initRadio] = RadioGroup.chart.transition(
    RadioGroup.initial,
    RadioGroup.SelectRadioOption({ value: 'shared' }),
    playgroundProps.radioGroup,
  )
  const [initTabs] = Tabs.chart.transition(
    Tabs.initial,
    Tabs.SelectTab({ value: 'core' }),
    playgroundProps.tabs,
  )
  const [initDisclosure] = Disclosure.chart.transition(
    Disclosure.initial,
    Disclosure.OpenDisclosureItem({ value: 'zero-rules' }),
    playgroundProps.disclosure,
  )
  const [initTree] = TreeView.chart.transition(
    TreeView.initial,
    TreeView.ExpandTreeBranch({ id: 'packages' }),
    playgroundProps.treeView,
  )
  const [initTree2] = TreeView.chart.transition(
    initTree,
    TreeView.ExpandTreeBranch({ id: 'foldkit' }),
    playgroundProps.treeView,
  )
  const [initCropper] = ImageCropper.chart.transition(
    ImageCropper.initial,
    ImageCropper.SetCropRect({ x: 42, y: 16, width: 152, height: 80 }),
    playgroundProps.imageCropper,
  )
  const [initSig1] = SignaturePad.chart.transition(
    SignaturePad.initial,
    SignaturePad.BeginSignatureStroke({ pointerId: 1, x: 24, y: 58 }),
    playgroundProps.signaturePad,
  )
  const [initSig2] = SignaturePad.chart.transition(
    initSig1,
    SignaturePad.MoveSignatureStroke({ pointerId: 1, x: 72, y: 24 }),
    playgroundProps.signaturePad,
  )
  const [initSig3] = SignaturePad.chart.transition(
    initSig2,
    SignaturePad.MoveSignatureStroke({ pointerId: 1, x: 126, y: 66 }),
    playgroundProps.signaturePad,
  )
  const [initSig4] = SignaturePad.chart.transition(
    initSig3,
    SignaturePad.MoveSignatureStroke({ pointerId: 1, x: 184, y: 30 }),
    playgroundProps.signaturePad,
  )
  const [initSignature] = SignaturePad.chart.transition(
    initSig4,
    SignaturePad.EndSignatureStroke({ pointerId: 1 }),
    playgroundProps.signaturePad,
  )

  return {
    menu: Menu.initial,
    dialog: Dialog.initial,
    tabs: initTabs,
    popover: Popover.initial,
    disclosure: initDisclosure,
    switch: initSwitch,
    checkbox: initCheckbox,
    radioGroup: initRadio,
    toggle: Toggle.initial,
    toast: Toast.initial,
    tooltip: Tooltip.initial,
    input: initInput,
    textarea: initTextarea,
    fieldset: Fieldset.initial,
    listbox: initListbox,
    select: initSelect,
    combobox: Combobox.initial,
    slider: initSlider,
    calendar: Calendar.initial,
    datePicker: DatePicker.initial,
    nav: Nav.initial,
    dragAndDrop: DragAndDrop.initial,
    fileDrop: FileDrop.initial,
    virtualList: initVirtual,
    presence: Presence.initial,
    drawer: Drawer.initial,
    hoverCard: HoverCard.initial,
    menubar: Menubar.initial,
    toolbar: Toolbar.initial,
    toggleGroup: initToggleGroup2,
    ratingGroup: initRating,
    numberInput: initNumber,
    pinInput: PinInput.initial,
    tagsInput: initTags,
    cascadeSelect: CascadeSelect.initial,
    treeView: initTree2,
    pagination: Pagination.initial,
    steps: initSteps,
    tableOfContents: initToc,
    scrollArea: initScroll,
    splitter: Splitter.initial,
    angleSlider: initAngle,
    colorPicker: initColor,
    carousel: Carousel.initial,
    floatingPanel: initFloating,
    imageCropper: initCropper,
    signaturePad: initSignature,
    tour: Tour.initial,
    marquee: Marquee.initial,
    timer: Timer.initial,
    progress: initProgress,
    avatar: Avatar.initial,
    clipboard: initClipboard,
    qrCode: initQr,
  }
}

export const initialModel = (): PlaygroundModel => {
  const initialStates = BoundField.initialFormStates(
    profileForm,
    initialProfile,
  )
  return {
    mode: 'Dark',
    query: '',
    category: 'All',
    inspectedPart: 'slider',
    isInspectorOpen: false,
    profile: initialProfile,
    profileStates: {
      displayName: initialStates['displayName'] ?? BoundField.initial(''),
      bio: initialStates['bio'] ?? BoundField.initial(''),
      apiToken: initialStates['apiToken'] ?? BoundField.initial(''),
    },
    profileFieldset: Fieldset.initial,
    profileSubmitBanner: Option.none(),
    dndOrder: defaultDndItems,
    paceQueue: Pace.empty,
    pendingMeta: {},
    localEventCount: 0,
    syncedWriteCount: 0,
    deviceOnlyCount: 0,
    nextLogId: 1,
    recentEvents: [],
    recentSyncWrites: [],
    parts: makeInitialParts(),
  }
}

type PartStepResult = Readonly<{
  parts: PartsState
  tag: string
  sync: Pace.Sync
}>

type PartStepper = (
  parts: PartsState,
  rawMessage: unknown,
  dndOrder: ReadonlyArray<string>,
) => PartStepResult

const tagOfUnknown = (raw: unknown): string => {
  if (Predicate.isObject(raw) && Predicate.hasProperty(raw, '_tag')) {
    const tag = raw._tag
    if (Predicate.isString(tag)) {
      return tag
    }
  }
  return 'Unknown'
}

const makeStepper = <
  Key extends PartKey,
  Msg extends Readonly<{ _tag: string }>,
  Props,
>(
  key: Key,
  isMessage: (u: unknown) => u is Msg,
  transition: (
    state: PartsState[Key],
    message: Msg,
    props: Props,
  ) => readonly [PartsState[Key], unknown],
  syncTable: Readonly<Record<string, Pace.Sync>>,
  getProps: (dndOrder: ReadonlyArray<string>) => Props,
): PartStepper => {
  return (parts, rawMessage, dndOrder) => {
    const tag = tagOfUnknown(rawMessage)
    if (!isMessage(rawMessage)) {
      return { parts, tag, sync: Pace.Synced() }
    }
    const [nextPartState] = transition(
      parts[key],
      rawMessage,
      getProps(dndOrder),
    )
    return {
      parts: { ...parts, [key]: nextPartState },
      tag: rawMessage._tag,
      sync: syncTable[rawMessage._tag] ?? Pace.Synced(),
    }
  }
}

const partSteppers: Readonly<Record<PartKey, PartStepper>> = {
  menu: makeStepper(
    'menu',
    Menu.isMessage,
    Menu.chart.transition,
    Menu.part.sync,
    () => playgroundProps.menu,
  ),
  dialog: makeStepper(
    'dialog',
    Dialog.isMessage,
    Dialog.chart.transition,
    Dialog.part.sync,
    () => playgroundProps.dialog,
  ),
  tabs: makeStepper(
    'tabs',
    Tabs.isMessage,
    Tabs.chart.transition,
    Tabs.part.sync,
    () => playgroundProps.tabs,
  ),
  popover: makeStepper(
    'popover',
    Popover.isMessage,
    Popover.chart.transition,
    Popover.part.sync,
    () => playgroundProps.popover,
  ),
  disclosure: makeStepper(
    'disclosure',
    Disclosure.isMessage,
    Disclosure.chart.transition,
    Disclosure.part.sync,
    () => playgroundProps.disclosure,
  ),
  switch: makeStepper(
    'switch',
    Switch.isMessage,
    Switch.chart.transition,
    Switch.part.sync,
    () => playgroundProps.switch,
  ),
  checkbox: makeStepper(
    'checkbox',
    Checkbox.isMessage,
    Checkbox.chart.transition,
    Checkbox.part.sync,
    () => playgroundProps.checkbox,
  ),
  radioGroup: makeStepper(
    'radioGroup',
    RadioGroup.isMessage,
    RadioGroup.chart.transition,
    RadioGroup.part.sync,
    () => playgroundProps.radioGroup,
  ),
  toggle: makeStepper(
    'toggle',
    Toggle.isMessage,
    Toggle.chart.transition,
    Toggle.part.sync,
    () => playgroundProps.toggle,
  ),
  toast: makeStepper(
    'toast',
    Toast.isMessage,
    Toast.chart.transition,
    Toast.part.sync,
    () => playgroundProps.toast,
  ),
  tooltip: makeStepper(
    'tooltip',
    Tooltip.isMessage,
    Tooltip.chart.transition,
    Tooltip.part.sync,
    () => playgroundProps.tooltip,
  ),
  input: makeStepper(
    'input',
    Input.isMessage,
    Input.chart.transition,
    Input.part.sync,
    () => playgroundProps.input,
  ),
  textarea: makeStepper(
    'textarea',
    Textarea.isMessage,
    Textarea.chart.transition,
    Textarea.part.sync,
    () => playgroundProps.textarea,
  ),
  fieldset: makeStepper(
    'fieldset',
    Fieldset.isMessage,
    Fieldset.chart.transition,
    Fieldset.part.sync,
    () => playgroundProps.fieldset,
  ),
  listbox: makeStepper(
    'listbox',
    Listbox.isMessage,
    Listbox.chart.transition,
    Listbox.part.sync,
    () => playgroundProps.listbox,
  ),
  select: makeStepper(
    'select',
    Select.isMessage,
    Select.chart.transition,
    Select.part.sync,
    () => playgroundProps.select,
  ),
  combobox: makeStepper(
    'combobox',
    Combobox.isMessage,
    Combobox.chart.transition,
    Combobox.part.sync,
    () => playgroundProps.combobox,
  ),
  slider: makeStepper(
    'slider',
    Slider.isMessage,
    Slider.chart.transition,
    Slider.part.sync,
    () => playgroundProps.slider,
  ),
  calendar: makeStepper(
    'calendar',
    Calendar.isMessage,
    Calendar.chart.transition,
    Calendar.part.sync,
    () => playgroundProps.calendar,
  ),
  datePicker: makeStepper(
    'datePicker',
    DatePicker.isMessage,
    DatePicker.chart.transition,
    DatePicker.part.sync,
    () => playgroundProps.datePicker,
  ),
  nav: makeStepper(
    'nav',
    Nav.isMessage,
    Nav.chart.transition,
    Nav.part.sync,
    () => playgroundProps.nav,
  ),
  dragAndDrop: makeStepper(
    'dragAndDrop',
    DragAndDrop.isMessage,
    DragAndDrop.chart.transition,
    DragAndDrop.part.sync,
    dndOrder => ({
      ...playgroundProps.dragAndDrop,
      containers: [
        {
          id: 'pipeline',
          label: 'Pipeline',
          itemIds: [...dndOrder],
        },
      ],
    }),
  ),
  fileDrop: makeStepper(
    'fileDrop',
    FileDrop.isMessage,
    FileDrop.chart.transition,
    FileDrop.part.sync,
    () => playgroundProps.fileDrop,
  ),
  virtualList: makeStepper(
    'virtualList',
    VirtualList.isMessage,
    VirtualList.chart.transition,
    VirtualList.part.sync,
    () => playgroundProps.virtualList,
  ),
  presence: makeStepper(
    'presence',
    Presence.isMessage,
    Presence.chart.transition,
    Presence.part.sync,
    () => playgroundProps.presence,
  ),
  drawer: makeStepper(
    'drawer',
    Drawer.isMessage,
    Drawer.chart.transition,
    Drawer.part.sync,
    () => playgroundProps.drawer,
  ),
  hoverCard: makeStepper(
    'hoverCard',
    HoverCard.isMessage,
    HoverCard.chart.transition,
    HoverCard.part.sync,
    () => playgroundProps.hoverCard,
  ),
  menubar: makeStepper(
    'menubar',
    Menubar.isMessage,
    Menubar.chart.transition,
    Menubar.part.sync,
    () => playgroundProps.menubar,
  ),
  toolbar: makeStepper(
    'toolbar',
    Toolbar.isMessage,
    Toolbar.chart.transition,
    Toolbar.part.sync,
    () => playgroundProps.toolbar,
  ),
  toggleGroup: makeStepper(
    'toggleGroup',
    ToggleGroup.isMessage,
    ToggleGroup.chart.transition,
    ToggleGroup.part.sync,
    () => playgroundProps.toggleGroup,
  ),
  ratingGroup: makeStepper(
    'ratingGroup',
    RatingGroup.isMessage,
    RatingGroup.chart.transition,
    RatingGroup.part.sync,
    () => playgroundProps.ratingGroup,
  ),
  numberInput: makeStepper(
    'numberInput',
    NumberInput.isMessage,
    NumberInput.chart.transition,
    NumberInput.part.sync,
    () => playgroundProps.numberInput,
  ),
  pinInput: makeStepper(
    'pinInput',
    PinInput.isMessage,
    PinInput.chart.transition,
    PinInput.part.sync,
    () => playgroundProps.pinInput,
  ),
  tagsInput: makeStepper(
    'tagsInput',
    TagsInput.isMessage,
    TagsInput.chart.transition,
    TagsInput.part.sync,
    () => playgroundProps.tagsInput,
  ),
  cascadeSelect: makeStepper(
    'cascadeSelect',
    CascadeSelect.isMessage,
    CascadeSelect.chart.transition,
    CascadeSelect.part.sync,
    () => playgroundProps.cascadeSelect,
  ),
  treeView: makeStepper(
    'treeView',
    TreeView.isMessage,
    TreeView.chart.transition,
    TreeView.part.sync,
    () => playgroundProps.treeView,
  ),
  pagination: makeStepper(
    'pagination',
    Pagination.isMessage,
    Pagination.chart.transition,
    Pagination.part.sync,
    () => playgroundProps.pagination,
  ),
  steps: makeStepper(
    'steps',
    Steps.isMessage,
    Steps.chart.transition,
    Steps.part.sync,
    () => playgroundProps.steps,
  ),
  tableOfContents: makeStepper(
    'tableOfContents',
    TableOfContents.isMessage,
    TableOfContents.chart.transition,
    TableOfContents.part.sync,
    () => playgroundProps.tableOfContents,
  ),
  scrollArea: makeStepper(
    'scrollArea',
    ScrollArea.isMessage,
    ScrollArea.chart.transition,
    ScrollArea.part.sync,
    () => playgroundProps.scrollArea,
  ),
  splitter: makeStepper(
    'splitter',
    Splitter.isMessage,
    Splitter.chart.transition,
    Splitter.part.sync,
    () => playgroundProps.splitter,
  ),
  angleSlider: makeStepper(
    'angleSlider',
    AngleSlider.isMessage,
    AngleSlider.chart.transition,
    AngleSlider.part.sync,
    () => playgroundProps.angleSlider,
  ),
  colorPicker: makeStepper(
    'colorPicker',
    ColorPicker.isMessage,
    ColorPicker.chart.transition,
    ColorPicker.part.sync,
    () => playgroundProps.colorPicker,
  ),
  carousel: makeStepper(
    'carousel',
    Carousel.isMessage,
    Carousel.chart.transition,
    Carousel.part.sync,
    () => playgroundProps.carousel,
  ),
  floatingPanel: makeStepper(
    'floatingPanel',
    FloatingPanel.isMessage,
    FloatingPanel.chart.transition,
    FloatingPanel.part.sync,
    () => playgroundProps.floatingPanel,
  ),
  imageCropper: makeStepper(
    'imageCropper',
    ImageCropper.isMessage,
    ImageCropper.chart.transition,
    ImageCropper.part.sync,
    () => playgroundProps.imageCropper,
  ),
  signaturePad: makeStepper(
    'signaturePad',
    SignaturePad.isMessage,
    SignaturePad.chart.transition,
    SignaturePad.part.sync,
    () => playgroundProps.signaturePad,
  ),
  tour: makeStepper(
    'tour',
    Tour.isMessage,
    Tour.chart.transition,
    Tour.part.sync,
    () => playgroundProps.tour,
  ),
  marquee: makeStepper(
    'marquee',
    Marquee.isMessage,
    Marquee.chart.transition,
    Marquee.part.sync,
    () => playgroundProps.marquee,
  ),
  timer: makeStepper(
    'timer',
    Timer.isMessage,
    Timer.chart.transition,
    Timer.part.sync,
    () => playgroundProps.timer,
  ),
  progress: makeStepper(
    'progress',
    Progress.isMessage,
    Progress.chart.transition,
    Progress.part.sync,
    () => playgroundProps.progress,
  ),
  avatar: makeStepper(
    'avatar',
    Avatar.isMessage,
    Avatar.chart.transition,
    Avatar.part.sync,
    () => playgroundProps.avatar,
  ),
  clipboard: makeStepper(
    'clipboard',
    Clipboard.isMessage,
    Clipboard.chart.transition,
    Clipboard.part.sync,
    () => playgroundProps.clipboard,
  ),
  qrCode: makeStepper(
    'qrCode',
    QrCode.isMessage,
    QrCode.chart.transition,
    QrCode.part.sync,
    () => playgroundProps.qrCode,
  ),
}

export const describeSync = (sync: Pace.Sync): string =>
  M.value(sync).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Synced: () => 'Synced',
      Settled: ({ afterMs }) => `Settled ${afterMs}ms`,
      Sampled: ({ everyMs }) => `Sampled ${everyMs}ms`,
      Device: ({ because }) => `Device (${because})`,
    }),
  )

const maxLogEntries = 18

const prependCapped = <A>(items: ReadonlyArray<A>, item: A): ReadonlyArray<A> =>
  Array.take([item, ...items], maxLogEntries)

const recordPacedDispatch = (
  model: PlaygroundModel,
  partName: string,
  tag: string,
  sync: Pace.Sync,
  nowMs: number,
): PlaygroundModel => {
  const key = `${partName}.${tag}`
  const paceLabel = describeSync(sync)
  const looked = Pace.arrived(model.paceQueue, {
    part: partName,
    key,
    sync,
    atMs: nowMs,
  })

  const nextPendingMeta: Record<string, PendingMeta> = {
    ...model.pendingMeta,
    [key]: { part: partName, tag, pace: paceLabel },
  }

  let nextLogId = model.nextLogId
  const localStatus: LogEntry['status'] =
    sync._tag === 'Device'
      ? 'Device'
      : Array.contains(looked.write, key)
        ? 'Synced'
        : 'Queued'

  const nextEvents = prependCapped(model.recentEvents, {
    id: nextLogId++,
    atMs: nowMs,
    part: partName,
    tag,
    pace: paceLabel,
    status: localStatus,
  })

  let nextSyncWrites = model.recentSyncWrites
  let syncedAdded = 0
  for (const writtenKey of looked.write) {
    const meta = nextPendingMeta[writtenKey] ?? {
      part: partName,
      tag: writtenKey,
      pace: paceLabel,
    }
    nextSyncWrites = prependCapped(nextSyncWrites, {
      id: nextLogId++,
      atMs: nowMs,
      part: meta.part,
      tag: meta.tag,
      pace: meta.pace,
      status: 'Synced',
    })
    syncedAdded += 1
  }

  return {
    ...model,
    paceQueue: looked.queue,
    pendingMeta: nextPendingMeta,
    localEventCount: model.localEventCount + 1,
    syncedWriteCount: model.syncedWriteCount + syncedAdded,
    deviceOnlyCount: model.deviceOnlyCount + (sync._tag === 'Device' ? 1 : 0),
    nextLogId,
    recentEvents: nextEvents,
    recentSyncWrites: nextSyncWrites,
  }
}

export const flushDuePace = (
  model: PlaygroundModel,
  nowMs: number,
): PlaygroundModel => {
  const looked = Pace.due(model.paceQueue, nowMs)
  if (Array.isReadonlyArrayEmpty(looked.write)) {
    return model
  }
  let nextLogId = model.nextLogId
  let nextSyncWrites = model.recentSyncWrites
  for (const writtenKey of looked.write) {
    const meta = model.pendingMeta[writtenKey] ?? {
      part: 'Pace',
      tag: writtenKey,
      pace: 'Settled/Sampled',
    }
    nextSyncWrites = prependCapped(nextSyncWrites, {
      id: nextLogId++,
      atMs: nowMs,
      part: meta.part,
      tag: meta.tag,
      pace: meta.pace,
      status: 'Synced',
    })
  }
  return {
    ...model,
    paceQueue: looked.queue,
    syncedWriteCount: model.syncedWriteCount + looked.write.length,
    nextLogId,
    recentSyncWrites: nextSyncWrites,
  }
}

export const stepPart = (
  model: PlaygroundModel,
  partKey: PartKey,
  rawMessage: unknown,
  nowMs: number,
): PlaygroundModel => {
  const stepped = partSteppers[partKey](model.parts, rawMessage, model.dndOrder)

  let nextDndOrder = model.dndOrder
  if (
    partKey === 'dragAndDrop' &&
    DragAndDrop.isMessage(rawMessage) &&
    rawMessage._tag === 'MoveDraggedItem' &&
    model.parts.dragAndDrop._tag === 'KeyboardDragging'
  ) {
    const itemId = model.parts.dragAndDrop.itemId
    const idx = model.dndOrder.indexOf(itemId)
    if (idx >= 0) {
      const targetIdx =
        rawMessage.direction === 'Up'
          ? Math.max(0, idx - 1)
          : Math.min(model.dndOrder.length - 1, idx + 1)
      if (targetIdx !== idx) {
        const copy = [...model.dndOrder]
        const [moved] = copy.splice(idx, 1)
        if (moved !== undefined) {
          copy.splice(targetIdx, 0, moved)
          nextDndOrder = copy
        }
      }
    }
  }

  let nextParts = stepped.parts

  if (partKey === 'clipboard' && nextParts.clipboard._tag === 'Copying') {
    const [copiedState] = Clipboard.chart.transition(
      nextParts.clipboard,
      Clipboard.SucceededClipboardCopy(),
      playgroundProps.clipboard,
    )
    nextParts = { ...nextParts, clipboard: copiedState }
  }

  const withPart: PlaygroundModel = {
    ...model,
    dndOrder: nextDndOrder,
    parts: nextParts,
  }

  return recordPacedDispatch(
    withPart,
    partKey,
    stepped.tag,
    stepped.sync,
    nowMs,
  )
}

export const stepBoundField = (
  model: PlaygroundModel,
  fieldKey: ProfileFieldKey,
  message: BoundField.Message,
  nowMs: number,
): PlaygroundModel => {
  const field = profileForm.fields[fieldKey]
  const currentFieldState = model.profileStates[fieldKey]
  const applied = BoundField.applyToModel(
    field,
    model.profile,
    currentFieldState,
    message,
  )
  const sync = BoundField.syncOf(field)[message._tag]

  const withField: PlaygroundModel = {
    ...model,
    profile: applied.model,
    profileStates: {
      ...model.profileStates,
      [fieldKey]: applied.state,
    },
    profileSubmitBanner: Option.none(),
  }

  return recordPacedDispatch(
    withField,
    `boundField.${fieldKey}`,
    message._tag,
    sync,
    nowMs,
  )
}

export const submitBoundForm = (
  model: PlaygroundModel,
  nowMs: number,
): PlaygroundModel => {
  const validation = BoundField.validateForm(profileForm, model.profileStates, {
    fieldset: model.profileFieldset,
  })
  const [nextFieldset] = Fieldset.chart.transition(
    model.profileFieldset,
    Fieldset.AttemptSubmit(),
    BoundField.toFieldsetProps(profileForm),
  )
  const touchedStates: Record<ProfileFieldKey, BoundField.State> = {
    displayName: BoundField.transition(
      profileForm.fields.displayName,
      model.profileStates.displayName,
      BoundField.TouchField(),
    ),
    bio: BoundField.transition(
      profileForm.fields.bio,
      model.profileStates.bio,
      BoundField.TouchField(),
    ),
    apiToken: BoundField.transition(
      profileForm.fields.apiToken,
      model.profileStates.apiToken,
      BoundField.TouchField(),
    ),
  }
  const banner =
    validation._tag === 'Valid'
      ? `Validated & committed Model for "${model.profile.profile.displayName}" (secret stayed Device-only).`
      : `Blocked submit: ${Object.keys(validation.errors).length} Schema error(s).`

  const nextModel: PlaygroundModel = {
    ...model,
    profileFieldset: nextFieldset,
    profileStates: touchedStates,
    profileSubmitBanner: Option.some(banner),
  }

  return recordPacedDispatch(
    nextModel,
    'boundForm',
    'SubmittedProfileForm',
    Pace.Synced(),
    nowMs,
  )
}

export const runBurstSimulation = (
  model: PlaygroundModel,
  baseNowMs: number,
): PlaygroundModel => {
  let current = stepPart(
    model,
    'angleSlider',
    AngleSlider.BeginAngleDrag({
      pointerId: 1,
      centerX: 50,
      centerY: 50,
      pointX: 50,
      pointY: 10,
    }),
    baseNowMs,
  )
  const dragPoints: ReadonlyArray<readonly [number, number]> = [
    [70, 18],
    [85, 35],
    [90, 50],
    [60, 88],
  ]
  for (let i = 0; i < dragPoints.length; i++) {
    const pt = Option.getOrElse(Array.get(dragPoints, i), () => [50, 10])
    const px = Option.getOrElse(Array.get(pt, 0), () => 50)
    const py = Option.getOrElse(Array.get(pt, 1), () => 10)
    current = stepPart(
      current,
      'angleSlider',
      AngleSlider.MoveAngleDrag({
        pointerId: 1,
        centerX: 50,
        centerY: 50,
        pointX: px,
        pointY: py,
      }),
      baseNowMs + (i + 1) * 8,
    )
  }
  current = stepPart(
    current,
    'angleSlider',
    AngleSlider.EndAngleDrag({ pointerId: 1 }),
    baseNowMs + 45,
  )
  const burstChars = ['F', 'o', 'l', 'd', 'k', 'i', 't', ' ', '5', '4']
  let typed = ''
  for (let i = 0; i < burstChars.length; i++) {
    typed += burstChars[i] ?? ''
    current = stepPart(
      current,
      'input',
      Input.ChangeInput({ value: typed }),
      baseNowMs + 60 + i * 12,
    )
  }
  return current
}
