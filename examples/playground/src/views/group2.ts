import { Array, Option } from 'effect'
import {
  Calendar,
  CascadeSelect,
  DatePicker,
  DragAndDrop,
  Drawer,
  FileDrop,
  HoverCard,
  Menubar,
  Nav,
  NumberInput,
  Part,
  PinInput,
  Presence,
  RatingGroup,
  TagsInput,
  ToggleGroup,
  Toolbar,
  TreeView,
  VirtualList,
} from 'foldkit/behavior'
import type { Html } from 'foldkit/html'

import { H, IgnoredKeyPress, dispatchPart, slotAttrs } from '../messages'
import { playgroundProps } from '../partsProps'
import type { PlaygroundModel } from '../state'

const { div, button, input, span } = H

export const renderGroup2 = (
  model: PlaygroundModel,
): Readonly<Record<string, Html>> => {
  const { parts } = model

  // 19. Calendar
  const calGrid = Calendar.visibleMonthGridOf(
    parts.calendar,
    playgroundProps.calendar,
  )
  const calSelected = Calendar.selectedDateOf(parts.calendar)
  const calMonth = Calendar.viewMonthOf(
    parts.calendar,
    playgroundProps.calendar,
  )
  const calFlatDays = Array.flatMap(calGrid.weeks, week => week.cells)
  const calendarView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart('calendar', Calendar.PreviousCalendarMonth()),
              ),
            ],
            ['‹'],
          ),
          span(
            [H.Class('mono')],
            [`${calMonth.year}-${String(calMonth.month).padStart(2, '0')}`],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('calendar', Calendar.NextCalendarMonth())),
            ],
            ['›'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('calendar', Calendar.JumpToToday())),
            ],
            ['Today'],
          ),
        ],
      ),
      div(
        [H.Class('pg-cal-grid')],
        Array.map(Array.take(calFlatDays, 21), cell => {
          const isSel = Option.match(calSelected, {
            onNone: () => false,
            onSome: d =>
              d.year === cell.date.year &&
              d.month === cell.date.month &&
              d.day === cell.date.day,
          })
          return button(
            [
              H.Class(
                isSel
                  ? 'pg-cal-cell pg-cal-cell-selected'
                  : cell.isOutsideMonth
                    ? 'pg-cal-cell pg-cal-cell-muted'
                    : 'pg-cal-cell',
              ),
              H.OnClick(
                dispatchPart(
                  'calendar',
                  Calendar.SelectCalendarDate({ date: cell.date }),
                ),
              ),
            ],
            [String(cell.date.day)],
          )
        }),
      ),
    ],
  )

  // 20. DatePicker
  const dpOpen = DatePicker.isOpen(parts.datePicker)
  const dpVal = DatePicker.inputValueOf(
    parts.datePicker,
    playgroundProps.datePicker,
  )
  const datePickerView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          input([
            H.Class('pg-input'),
            H.Style({ flex: '1' }),
            H.Value(dpVal),
            H.Placeholder('YYYY-MM-DD'),
            H.OnInput(value =>
              dispatchPart('datePicker', DatePicker.ChangeDateInput({ value })),
            ),
            H.OnBlur(dispatchPart('datePicker', DatePicker.CommitDateInput())),
          ]),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart('datePicker', DatePicker.ToggleDatePicker()),
              ),
            ],
            [dpOpen ? 'Close' : 'Pick'],
          ),
        ],
      ),
      dpOpen
        ? div(
            [H.Class('pg-popup pg-row')],
            [
              button(
                [
                  H.Class('pg-btn pg-btn-sm'),
                  H.OnClick(
                    dispatchPart(
                      'datePicker',
                      DatePicker.SelectDatePickerDate({
                        date: { year: 2026, month: 11, day: 21 },
                      }),
                    ),
                  ),
                ],
                ['2026-11-21'],
              ),
              button(
                [
                  H.Class('pg-btn pg-btn-sm'),
                  H.OnClick(
                    dispatchPart(
                      'datePicker',
                      DatePicker.SelectDatePickerDate({
                        date: { year: 2026, month: 12, day: 1 },
                      }),
                    ),
                  ),
                ],
                ['2026-12-01'],
              ),
              button(
                [
                  H.Class('pg-btn pg-btn-sm'),
                  H.OnClick(
                    dispatchPart('datePicker', DatePicker.ClearDatePicker()),
                  ),
                ],
                ['Clear'],
              ),
            ],
          )
        : H.empty,
    ],
  )

  // 21. Nav
  const navActive = Nav.openValueOf(parts.nav)
  const navView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        Array.map(playgroundProps.nav.items, item =>
          button(
            [
              H.Class(
                Option.contains(navActive, item.value)
                  ? 'pg-btn pg-btn-sm pg-btn-active'
                  : 'pg-btn pg-btn-sm',
              ),
              H.OnClick(
                dispatchPart('nav', Nav.ToggleNavItem({ value: item.value })),
              ),
            ],
            [`${item.label} ▾`],
          ),
        ),
      ),
      Option.match(navActive, {
        onNone: () =>
          span([H.Class('pg-muted')], ['Click a nav item to open submenu.']),
        onSome: active =>
          div(
            [H.Class('pg-popup')],
            [
              span([H.Class('mono')], [`Submenu: ${active}`]),
              button(
                [
                  H.Class('pg-btn pg-btn-sm'),
                  H.OnClick(dispatchPart('nav', Nav.CloseNav())),
                ],
                ['Close'],
              ),
            ],
          ),
      }),
    ],
  )

  // 22. DragAndDrop
  const liftedId =
    parts.dragAndDrop._tag === 'KeyboardDragging'
      ? Option.some(parts.dragAndDrop.itemId)
      : Option.none()
  const dndView = div(
    [H.Class('pg-col')],
    [
      ...Array.map(model.dndOrder, (itemId, idx) => {
        const isLifted = Option.contains(liftedId, itemId)
        return div(
          [
            H.Class(
              isLifted
                ? 'pg-surface-box pg-row pg-btn-active'
                : 'pg-surface-box pg-row',
            ),
          ],
          [
            span(
              [H.Style({ flex: '1', fontSize: '12px' })],
              [`${idx + 1}. ${itemId}`],
            ),
            isLifted
              ? div(
                  [H.Class('pg-row')],
                  [
                    button(
                      [
                        H.Class('pg-btn pg-btn-sm'),
                        H.OnClick(
                          dispatchPart(
                            'dragAndDrop',
                            DragAndDrop.MoveDraggedItem({
                              direction: 'Up',
                            }),
                          ),
                        ),
                      ],
                      ['↑'],
                    ),
                    button(
                      [
                        H.Class('pg-btn pg-btn-sm'),
                        H.OnClick(
                          dispatchPart(
                            'dragAndDrop',
                            DragAndDrop.MoveDraggedItem({ direction: 'Down' }),
                          ),
                        ),
                      ],
                      ['↓'],
                    ),
                    button(
                      [
                        H.Class('pg-btn pg-btn-primary pg-btn-sm'),
                        H.OnClick(
                          dispatchPart('dragAndDrop', DragAndDrop.DropItem()),
                        ),
                      ],
                      ['Drop'],
                    ),
                  ],
                )
              : button(
                  [
                    H.Class('pg-btn pg-btn-sm'),
                    H.OnClick(
                      dispatchPart(
                        'dragAndDrop',
                        DragAndDrop.LiftItem({
                          itemId,
                          containerId: 'pipeline',
                          index: idx,
                        }),
                      ),
                    ),
                  ],
                  ['Lift'],
                ),
          ],
        )
      }),
    ],
  )

  // 23. FileDrop
  const acceptedFiles = FileDrop.acceptedFilesOf(parts.fileDrop)
  const rejectedFiles = FileDrop.rejectedFilesOf(parts.fileDrop)
  const fileDropView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm pg-btn-primary'),
              H.OnClick(
                dispatchPart(
                  'fileDrop',
                  FileDrop.AddFiles({
                    files: [
                      {
                        name: `snapshot-${acceptedFiles.length + 1}.json`,
                        size: 24_576,
                        type: 'application/json',
                      },
                    ],
                  }),
                ),
              ),
            ],
            ['+ Drop Valid .json'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'fileDrop',
                  FileDrop.AddFiles({
                    files: [
                      {
                        name: 'huge.bin',
                        size: 9_900_000,
                        type: 'application/octet-stream',
                      },
                    ],
                  }),
                ),
              ),
            ],
            ['Drop Oversize'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('fileDrop', FileDrop.ClearFiles())),
            ],
            ['Clear'],
          ),
        ],
      ),
      span(
        [H.Class('pg-muted')],
        [
          `Accepted: ${acceptedFiles.length} · Rejected: ${rejectedFiles.length}`,
        ],
      ),
    ],
  )

  // 24. VirtualList
  const maybeVWindow = VirtualList.visibleWindowOf(
    parts.virtualList,
    playgroundProps.virtualList,
  )
  const vWindowText = Option.match(maybeVWindow, {
    onNone: () => 'Unmeasured',
    onSome: vWindow =>
      `Window: rows ${vWindow.startIndex}..${vWindow.endIndex} of 10,000 (rendering ${Math.max(0, vWindow.endIndex - vWindow.startIndex)} DOM nodes)`,
  })
  const virtualListView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('virtualList', VirtualList.ScrollToTop())),
            ],
            ['Row 0'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'virtualList',
                  VirtualList.ScrollToIndex({ index: 5000, align: 'Center' }),
                ),
              ),
            ],
            ['Jump #5,000'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart('virtualList', VirtualList.ScrollToBottom()),
              ),
            ],
            ['Row 9,999'],
          ),
        ],
      ),
      div(
        [H.Class('pg-surface-box mono'), H.Style({ fontSize: '11px' })],
        [vWindowText],
      ),
    ],
  )

  // 25. Presence
  const presenceMounted = Presence.isMounted(parts.presence)
  const presenceView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm pg-btn-primary'),
              H.OnClick(dispatchPart('presence', Presence.Show())),
            ],
            ['Show'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('presence', Presence.Hide())),
            ],
            ['Hide (Exit)'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('presence', Presence.EndAnimation())),
            ],
            ['End Anim'],
          ),
        ],
      ),
      span(
        [H.Class('pg-pill')],
        [`Phase: ${parts.presence._tag} · Mounted: ${String(presenceMounted)}`],
      ),
    ],
  )

  // 26. Drawer
  const drawerOpen = parts.drawer._tag !== 'Closed'
  const drawerView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-primary'),
              H.OnClick(dispatchPart('drawer', Drawer.OpenDrawer())),
            ],
            ['Open Slide Drawer'],
          ),
          span([H.Class('pg-pill')], [`State: ${parts.drawer._tag}`]),
        ],
      ),
      span(
        [H.Class('pg-muted')],
        ['Snap points: 40%, 75%, 100% with swipe-to-dismiss math.'],
      ),
      drawerOpen
        ? span([H.Class('pg-pill pg-pill-positive')], ['Drawer Active →'])
        : H.empty,
    ],
  )

  // 27. HoverCard
  const hoverOpen = HoverCard.isOpen(parts.hoverCard)
  const hoverCardPartView = Part.view(
    HoverCard.part,
    parts.hoverCard,
    playgroundProps.hoverCard,
  )
  const hoverCardView = div(
    [H.Class('pg-col')],
    [
      button(
        [
          H.Class('pg-btn'),
          ...slotAttrs(hoverCardPartView.slot('Trigger')),
          H.OnPointerDown(pointerType =>
            Option.some(
              dispatchPart(
                'hoverCard',
                HoverCard.PressHoverCardPointer({ pointerType }),
              ),
            ),
          ),
          H.OnPointerMove((_sx, _sy, pointerType) =>
            Option.some(
              dispatchPart(
                'hoverCard',
                HoverCard.EnterHoverCardTrigger({ pointerType }),
              ),
            ),
          ),
          H.OnPointerLeave(pointerType =>
            Option.some(
              dispatchPart(
                'hoverCard',
                HoverCard.LeaveHoverCardTrigger({ pointerType }),
              ),
            ),
          ),
          H.OnFocus(
            dispatchPart('hoverCard', HoverCard.FocusHoverCardTrigger()),
          ),
          H.OnBlur(dispatchPart('hoverCard', HoverCard.BlurHoverCardTrigger())),
          H.OnClick(
            dispatchPart(
              'hoverCard',
              hoverOpen
                ? HoverCard.CloseHoverCard()
                : HoverCard.OpenHoverCard(),
            ),
          ),
        ],
        ['@foldkit/core (Hover or Tap)'],
      ),
      hoverOpen
        ? div(
            [
              H.Class('pg-popup'),
              ...slotAttrs(hoverCardPartView.slot('Content')),
            ],
            [
              span([], ['Foldkit Core UI · 54 Parts']),
              span(
                [H.Class('pg-muted')],
                [
                  'Zero DOM/React imports inside packages/foldkit/src/behavior/.',
                ],
              ),
            ],
          )
        : H.empty,
    ],
  )

  // 28. Menubar
  const activeMenuBar =
    parts.menubar._tag === 'Open'
      ? Option.some(parts.menubar.openMenuValue)
      : Option.none()
  const menubarView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row'), H.Role('menubar')],
        Array.map(playgroundProps.menubar.menus, menu =>
          button(
            [
              H.Class(
                Option.contains(activeMenuBar, menu.value)
                  ? 'pg-btn pg-btn-sm pg-btn-active'
                  : 'pg-btn pg-btn-sm',
              ),
              H.OnClick(
                dispatchPart(
                  'menubar',
                  Menubar.ToggleMenubarMenu({ value: menu.value }),
                ),
              ),
            ],
            [menu.label],
          ),
        ),
      ),
      Option.match(activeMenuBar, {
        onNone: () =>
          span([H.Class('pg-muted')], ['Click File or View above.']),
        onSome: value => {
          const found = Array.findFirst(
            playgroundProps.menubar.menus,
            m => m.value === value,
          )
          return Option.match(found, {
            onNone: () => H.empty,
            onSome: menu =>
              div(
                [H.Class('pg-popup')],
                Array.map(menu.items, item =>
                  button(
                    [
                      H.Class('pg-menu-item'),
                      H.OnClick(
                        dispatchPart(
                          'menubar',
                          Menubar.SelectMenubarItem({ value: item.value }),
                        ),
                      ),
                    ],
                    [item.label],
                  ),
                ),
              ),
          })
        },
      }),
    ],
  )

  // 29. Toolbar
  const lastToolbar = Option.getOrElse(
    Toolbar.lastActivatedValueOf(parts.toolbar),
    () => 'none',
  )
  const toolbarView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row'), H.Role('toolbar')],
        Array.map(playgroundProps.toolbar.items, item =>
          button(
            [
              H.Class(
                lastToolbar === item.value
                  ? 'pg-btn pg-btn-sm pg-btn-active'
                  : 'pg-btn pg-btn-sm',
              ),
              H.OnClick(
                dispatchPart(
                  'toolbar',
                  Toolbar.ActivateToolbarItem({ value: item.value }),
                ),
              ),
            ],
            [item.label],
          ),
        ),
      ),
      span([H.Class('pg-muted')], [`Last command: ${lastToolbar}`]),
    ],
  )

  // 30. ToggleGroup
  const tgValues = ToggleGroup.valuesOf(parts.toggleGroup)
  const toggleGroupView = div(
    [H.Class('pg-row')],
    Array.map(playgroundProps.toggleGroup.items, item => {
      const pressed = Array.contains(tgValues, item.value)
      return button(
        [
          H.Class(
            pressed ? 'pg-btn pg-btn-sm pg-btn-primary' : 'pg-btn pg-btn-sm',
          ),
          H.OnClick(
            dispatchPart(
              'toggleGroup',
              ToggleGroup.ToggleGroupItem({ value: item.value }),
            ),
          ),
        ],
        [item.label],
      )
    }),
  )

  // 31. RatingGroup
  const ratingVal = Option.getOrElse(parts.ratingGroup.maybeValue, () => 0)
  const ratingGroupView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        Array.map([1, 2, 3, 4, 5], star =>
          button(
            [
              H.Class(
                ratingVal >= star
                  ? 'pg-btn pg-btn-sm pg-btn-primary'
                  : 'pg-btn pg-btn-sm',
              ),
              H.OnClick(
                dispatchPart(
                  'ratingGroup',
                  RatingGroup.SetRating({ value: star }),
                ),
              ),
            ],
            [ratingVal >= star ? '★' : ratingVal >= star - 0.5 ? '⯪' : '☆'],
          ),
        ),
      ),
      div(
        [H.Class('pg-row')],
        [
          span([H.Class('pg-muted mono')], [`${ratingVal} / 5 stars`]),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart(
                  'ratingGroup',
                  RatingGroup.SetRating({ value: 3.5 }),
                ),
              ),
            ],
            ['3.5★'],
          ),
        ],
      ),
    ],
  )

  // 32. NumberInput
  const numDraft = NumberInput.textOf(parts.numberInput)
  const numberInputPartView = Part.view(
    NumberInput.part,
    parts.numberInput,
    playgroundProps.numberInput,
  )
  const numberInputView = div(
    [H.Class('pg-row')],
    [
      button(
        [
          H.Class('pg-btn'),
          ...slotAttrs(numberInputPartView.slot('DecrementTrigger')),
          H.OnClick(dispatchPart('numberInput', NumberInput.DecrementNumber())),
        ],
        ['−'],
      ),
      input([
        H.Class('pg-input mono'),
        H.Style({ width: '100px', textAlign: 'center' }),
        ...slotAttrs(numberInputPartView.slot('Input')),
        H.Value(numDraft),
        H.OnInput(value =>
          dispatchPart('numberInput', NumberInput.ChangeNumberInput({ value })),
        ),
        H.OnBlur(dispatchPart('numberInput', NumberInput.CommitNumberInput())),
      ]),
      button(
        [
          H.Class('pg-btn'),
          ...slotAttrs(numberInputPartView.slot('IncrementTrigger')),
          H.OnClick(dispatchPart('numberInput', NumberInput.IncrementNumber())),
        ],
        ['+'],
      ),
      span([H.Class('pg-muted')], ['ms']),
    ],
  )

  // 33. PinInput
  const pinDigits = parts.pinInput.slots
  const pinComplete = PinInput.isCompleteOf(
    parts.pinInput,
    playgroundProps.pinInput,
  )
  const pinPartView = Part.view(
    PinInput.part,
    parts.pinInput,
    playgroundProps.pinInput,
  )
  const pinInputView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-pin-row')],
        Array.map([0, 1, 2, 3], index =>
          input([
            H.Class('pg-pin-cell mono'),
            H.Attribute('maxlength', '1'),
            ...slotAttrs(pinPartView.slot('Input', String(index))),
            H.Value(Option.getOrElse(Array.get(pinDigits, index), () => '')),
            H.OnInput(value =>
              dispatchPart(
                'pinInput',
                PinInput.ChangePinSlot({ index, value }),
              ),
            ),
          ]),
        ),
      ),
      div(
        [H.Class('pg-row')],
        [
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(
                dispatchPart('pinInput', PinInput.PastePin({ value: '4829' })),
              ),
            ],
            ['Paste 4829'],
          ),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('pinInput', PinInput.ClearPin())),
            ],
            ['Clear'],
          ),
          span(
            [H.Class(pinComplete ? 'pg-pill pg-pill-positive' : 'pg-muted')],
            [
              pinComplete
                ? `Ready: ${PinInput.valueOf(parts.pinInput)}`
                : '4 digits',
            ],
          ),
        ],
      ),
    ],
  )

  // 34. TagsInput
  const tagsList = parts.tagsInput.tags
  const tagDraft = TagsInput.inputDraftOf(parts.tagsInput)
  const tagsPartView = Part.view(
    TagsInput.part,
    parts.tagsInput,
    playgroundProps.tagsInput,
  )
  const tagsInputView = div(
    [H.Class('pg-col')],
    [
      div(
        [H.Class('pg-row')],
        Array.map(tagsList, (tag, index) =>
          span(
            [H.Class('pg-tag')],
            [
              tag,
              button(
                [
                  H.OnClick(
                    dispatchPart('tagsInput', TagsInput.RemoveTag({ index })),
                  ),
                ],
                ['×'],
              ),
            ],
          ),
        ),
      ),
      div(
        [H.Class('pg-row')],
        [
          input([
            H.Class('pg-input'),
            H.Style({ flex: '1' }),
            ...slotAttrs(tagsPartView.slot('Input')),
            H.Value(tagDraft),
            H.Placeholder('Add tag…'),
            H.OnInput(value =>
              dispatchPart('tagsInput', TagsInput.ChangeTagInput({ value })),
            ),
            H.OnKeyDown(key =>
              key === 'Enter'
                ? dispatchPart('tagsInput', TagsInput.AddTag({}))
                : IgnoredKeyPress(),
            ),
          ]),
          button(
            [
              H.Class('pg-btn pg-btn-sm'),
              H.OnClick(dispatchPart('tagsInput', TagsInput.AddTag({}))),
            ],
            ['Add'],
          ),
        ],
      ),
    ],
  )

  // 35. CascadeSelect
  const csOpen = CascadeSelect.isOpen(parts.cascadeSelect)
  const csColumns = CascadeSelect.columnsOf(
    parts.cascadeSelect,
    playgroundProps.cascadeSelect,
  )
  const csPath = CascadeSelect.pathLabelsOf(
    CascadeSelect.selectedPathOf(
      parts.cascadeSelect,
      playgroundProps.cascadeSelect,
    ),
    playgroundProps.cascadeSelect,
  )
  const cascadeSelectView = div(
    [H.Class('pg-col')],
    [
      button(
        [
          H.Class('pg-btn'),
          H.OnClick(
            dispatchPart('cascadeSelect', CascadeSelect.ToggleCascadeSelect()),
          ),
        ],
        [
          Array.isReadonlyArrayEmpty(csPath)
            ? 'Pick Layer → Package → Module ▾'
            : Array.join(csPath, ' / '),
        ],
      ),
      csOpen
        ? div(
            [H.Class('pg-popup pg-row')],
            Array.map(csColumns, column =>
              div(
                [H.Class('pg-col'), H.Style({ minWidth: '82px' })],
                Array.map(column.nodes, node =>
                  button(
                    [
                      H.Class('pg-menu-item'),
                      H.OnClick(
                        dispatchPart(
                          'cascadeSelect',
                          CascadeSelect.SelectCascadeOption({ id: node.id }),
                        ),
                      ),
                    ],
                    [node.label],
                  ),
                ),
              ),
            ),
          )
        : H.empty,
    ],
  )

  // 36. TreeView
  const treeNodes = TreeView.visibleNodesOf(
    parts.treeView,
    playgroundProps.treeView,
  )
  const treeView = div(
    [H.Class('pg-col')],
    Array.map(treeNodes, row => {
      const expanded = TreeView.isExpanded(parts.treeView, row.node.id)
      const selected = TreeView.isSelected(parts.treeView, row.node.id)
      return button(
        [
          H.Class(
            selected ? 'pg-menu-item pg-menu-item-active' : 'pg-menu-item',
          ),
          H.Style({ paddingLeft: `${8 + row.depth * 14}px` }),
          H.OnClick(
            dispatchPart(
              'treeView',
              row.hasChildren
                ? TreeView.ToggleTreeBranch({ id: row.node.id })
                : TreeView.SelectTreeItem({ id: row.node.id }),
            ),
          ),
        ],
        [
          `${row.hasChildren ? (expanded ? '▾ ' : '▸ ') : '• '}${row.node.label}`,
        ],
      )
    }),
  )

  return {
    calendar: calendarView,
    datePicker: datePickerView,
    nav: navView,
    dragAndDrop: dndView,
    fileDrop: fileDropView,
    virtualList: virtualListView,
    presence: presenceView,
    drawer: drawerView,
    hoverCard: hoverCardView,
    menubar: menubarView,
    toolbar: toolbarView,
    toggleGroup: toggleGroupView,
    ratingGroup: ratingGroupView,
    numberInput: numberInputView,
    pinInput: pinInputView,
    tagsInput: tagsInputView,
    cascadeSelect: cascadeSelectView,
    treeView: treeView,
  }
}
