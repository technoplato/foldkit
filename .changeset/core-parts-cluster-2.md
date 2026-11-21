---
'foldkit': minor
---

Add Zag/Radix Cluster 2 core Parts (Widgets #32-#37) in `foldkit/behavior` and prove all 6 across HTML, React, and React Native generic hosts with zero widget-specific painter logic.

- `NumberInput` (`#2671`): `Idle | Editing | Scrubbing` composing `FieldDraft` (`Pace.Settled`) and `PointerDrag` (`Pace.Sampled` scrubber) with numeric parse/format, `min`/`max`/`step`/`largeStep`/`precision`/`clampOnBlur`/`allowOverflow`, keyboard stepping, disabled/readOnly guards, `atRest`, and `Input`/`IncrementButton`/`DecrementButton`/`Scrubber`/`Label` slots.
- `PinInput` (`#2672`): `Idle | Editing` composing `FieldDraft` and `RovingFocus` with `length`, `pinType` (`Numeric | Alphanumeric | Alphabetic`), `mask` and `PinInput.secret()` (`Device({ because: 'Secret' })`), auto-advance, Backspace clear & retreat, multi-char paste distribution, `isCompleteOf`, `valueOf`, `atRest`, and `Root`/`Input`/`Label` slots.
- `TagsInput` (`#2673`): `Idle | EditingTag` composing `FieldDraft` and `RovingFocus` with Enter/delimiter/paste/blur tag addition, `maxTags`, `allowDuplicates`, `validateTag`, keyboard tag highlight/edit/delete, `atRest`, and `Root`/`Input`/`Tag`/`TagDeleteButton`/`ClearButton`/`Label` slots.
- `CascadeSelect` (`#2674`): `Closed | Open` composing `Placement`, `Layers`, `RovingFocus`, and `Selection` with recursive `CascadeNode` trees, `expandedPath`, `columnsOf`, `pathLabelsOf`, `placeFor`, `Layers` dismiss, `atRest`, and `Trigger`/`Content`/`Column`/`Option`/`ClearButton` slots.
- `TreeView` (`#2675`): `Idle | Focused` composing `Selection`, `RovingFocus`, and `Typeahead` with recursive `TreeNode` trees, `expandedIds`, `visibleNodesOf`, ArrowRight/ArrowLeft/ArrowUp/ArrowDown/Home/End/`*` keyboard navigation, typeahead jump, Single/Multiple selection, `atRest`, and `Tree`/`Item`/`BranchToggle` slots.
- `Pagination` (`#2676`): pure paging Part (`Active` state, `Navigation` category) with `totalPagesOf`, `pageRangeOf` (`Page | Ellipsis`), `sliceRangeOf`, `next`/`prev`/`first`/`last`/`goToPage`/`setPageSize` bounds clamping and disabled guards, `atRest`, and `Root`/`PrevButton`/`NextButton`/`PageButton`/`Ellipsis` slots.
- `foldkit/test` gains `Cluster2Fixture` proving all 6 Parts across HTML, React, and React Native generic hosts.
