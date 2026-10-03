import { Array, Match as M, Option } from 'effect'
import { Interaction, type Navigation } from 'foldkit'
import { Fragment, type ReactElement } from 'react'
import {
  Modal,
  type ModalProps,
  Platform,
  Pressable,
  type StyleProp,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native'

import { useBound, useMenu, useMenuOpener } from '@foldkit/react/interaction'

const presentationOf = (
  style: Navigation.PresentationStyle,
): Pick<ModalProps, 'presentationStyle' | 'transparent'> =>
  M.value(style).pipe(
    M.withReturnType<Pick<ModalProps, 'presentationStyle' | 'transparent'>>(),
    M.tagsExhaustive({
      Push: () => ({ presentationStyle: 'fullScreen', transparent: false }),
      Sheet: () => ({ presentationStyle: 'pageSheet', transparent: false }),
      BottomSheet: () => ({
        presentationStyle: 'formSheet',
        transparent: false,
      }),
      FullScreenCover: () => ({
        presentationStyle: 'fullScreen',
        transparent: false,
      }),
      Dialog: () => ({
        presentationStyle: 'overFullScreen',
        transparent: true,
      }),
      Popover: () => ({
        presentationStyle: 'overFullScreen',
        transparent: true,
      }),
      Drawer: () => ({
        presentationStyle: 'overFullScreen',
        transparent: true,
      }),
    }),
  )

const accent = '#4f46e5'

const rowBackground = (row: Interaction.MenuRow): string => {
  if (row.isFocused) {
    return '#eef2ff'
  } else if (row.isHighlighted) {
    return '#f3f4f6'
  } else {
    return 'transparent'
  }
}

const MatchedText = ({
  runs,
}: Readonly<{ runs: ReadonlyArray<Interaction.TextRun> }>): ReactElement => (
  <>
    {Array.map(runs, (run, position) =>
      run.isMatch ? (
        <Text
          key={position}
          style={{
            color: accent,
            fontWeight: '700',
            textDecorationLine: 'underline',
          }}
        >
          {run.text}
        </Text>
      ) : (
        <Fragment key={position}>{run.text}</Fragment>
      ),
    )}
  </>
)

const KeyCap = ({ label }: Readonly<{ label: string }>): ReactElement => (
  <Text
    style={{
      backgroundColor: '#f9fafb',
      borderBottomWidth: 2,
      borderColor: '#e5e7eb',
      borderRadius: 6,
      borderWidth: 1,
      color: '#374151',
      fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
      fontSize: 12,
      minWidth: 24,
      overflow: 'hidden',
      paddingHorizontal: 6,
      paddingVertical: 2,
      textAlign: 'center',
    }}
  >
    {label}
  </Text>
)

const MenuRow = ({
  row,
  onChoose,
}: Readonly<{
  row: Interaction.MenuRow
  onChoose: (tag: string) => void
}>): ReactElement => {
  const isDisabled = row.entry.availability._tag === 'Disabled'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.spokenLabel}
      accessibilityState={{
        disabled: isDisabled,
        selected: row.isHighlighted,
      }}
      disabled={isDisabled}
      onPress={() => {
        onChoose(row.entry.tag)
      }}
      style={{
        alignItems: 'center',
        backgroundColor: rowBackground(row),
        borderLeftColor: row.isFocused ? accent : 'transparent',
        borderLeftWidth: 3,
        borderRadius: 8,
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            color: isDisabled ? '#9ca3af' : '#111827',
            fontSize: 15,
            fontWeight: '600',
          }}
        >
          <MatchedText runs={row.title} />
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: isDisabled ? '#9ca3af' : '#6b7280', fontSize: 13 }}
        >
          <MatchedText runs={row.description} />
        </Text>
        {row.entry.availability._tag === 'Disabled' ? (
          <Text style={{ color: '#b45309', fontSize: 12 }}>
            {row.entry.availability.because}
          </Text>
        ) : null}
      </View>
      {Array.map(row.keys, key => (
        <KeyCap key={key} label={key} />
      ))}
    </Pressable>
  )
}

/**
 * One action menu over a dimmed backdrop: the search field, then a row per
 * Catalog Action with the matched letters marked and its shortcut. All of
 * it, text included, comes from the Program's `MenuView`. A tap outside
 * dismisses it. {@link ActionMenuModal} presents it in a Modal; a native
 * stack presents it as a transparent route.
 *
 * @example
 * ```tsx
 * <ActionMenuSheet menu={menu} />
 * ```
 */
export const ActionMenuSheet = ({
  menu,
}: Readonly<{ menu: Interaction.MenuView }>): ReactElement => {
  const bound = useBound()
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        flex: 1,
        justifyContent: 'flex-start',
        paddingTop: '15%',
      }}
    >
      <Pressable
        accessibilityLabel={menu.dismissLabel}
        accessibilityRole="button"
        onPress={() => {
          bound.dismissMenu()
        }}
        style={{
          bottom: 0,
          left: 0,
          position: 'absolute',
          right: 0,
          top: 0,
        }}
      />
      <View
        accessibilityLabel={menu.title}
        style={{
          backgroundColor: '#ffffff',
          borderColor: 'rgba(0, 0, 0, 0.08)',
          borderRadius: 14,
          borderWidth: 1,
          elevation: 12,
          maxWidth: 576,
          overflow: 'hidden',
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.25,
          shadowRadius: 24,
          width: '92%',
        }}
      >
        <TextInput
          accessibilityLabel={menu.filterLabel}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          onChangeText={query => {
            bound.typeInMenu(query)
          }}
          placeholder={menu.filterLabel}
          placeholderTextColor="#9ca3af"
          style={{
            borderBottomColor: '#e5e7eb',
            borderBottomWidth: 1,
            color: '#111827',
            fontSize: 16,
            paddingHorizontal: 18,
            paddingVertical: 14,
          }}
          value={menu.query}
        />
        <View accessibilityLiveRegion="polite" style={{ gap: 2, padding: 6 }}>
          {Array.match(menu.rows, {
            onEmpty: () => (
              <Text
                style={{ color: '#6b7280', padding: 24, textAlign: 'center' }}
              >
                {menu.summary}
              </Text>
            ),
            onNonEmpty: rows =>
              Array.map(rows, row => (
                <MenuRow
                  key={row.entry.tag}
                  row={row}
                  onChoose={tag => {
                    bound.chooseFromMenu(tag)
                  }}
                />
              )),
          })}
        </View>
      </View>
    </View>
  )
}

const floatingOpenerStyle: StyleProp<ViewStyle> = {
  backgroundColor: '#111827',
  borderRadius: 24,
  bottom: 24,
  paddingHorizontal: 16,
  paddingVertical: 12,
  position: 'absolute',
  right: 24,
}

/**
 * A floating button that opens the bound Program's action menu, labeled
 * from the Program. A touch screen shows no shortcut, so it reads
 * `Actions`. It renders nothing for a Program without a menu, and nothing
 * until the Program is Ready.
 *
 * @example
 * ```tsx
 * <ActionMenuButton />
 * ```
 */
export const ActionMenuButton = ({
  style,
}: Readonly<{ style?: StyleProp<ViewStyle> }>): ReactElement | null => {
  return Option.match(useMenuOpener('Touch'), {
    onNone: () => null,
    onSome: ({ opener, open }) => (
      <Pressable
        accessibilityLabel={opener.label}
        accessibilityRole="button"
        onPress={open}
        style={style ?? floatingOpenerStyle}
      >
        <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>
          {opener.label}
        </Text>
      </Pressable>
    ),
  })
}

/**
 * The action menu as a React Native Modal, generic over any bound Program.
 * It renders only while the Model presents the menu. The Android back
 * button and a tap outside dismiss the menu destination; the filter types
 * into the Program's query; a row press chooses its Action.
 *
 * @example
 * ```tsx
 * <ProgramProvider bound={counter}>
 *   <Screen />
 *   <ActionMenuModal />
 * </ProgramProvider>
 * ```
 */
export const ActionMenuModal = (): ReactElement | null => {
  const bound = useBound()
  return Option.match(useMenu(), {
    onNone: () => null,
    onSome: menu => (
      <Modal
        animationType="fade"
        onRequestClose={() => {
          bound.dismissMenu()
        }}
        visible
        {...presentationOf(menu.style)}
      >
        <ActionMenuSheet menu={menu} />
      </Modal>
    ),
  })
}
