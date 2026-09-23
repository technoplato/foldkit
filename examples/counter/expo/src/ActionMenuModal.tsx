import { Array, Match as M, Option } from 'effect'
import type { Interaction, Navigation } from 'foldkit'
import type { ReactElement } from 'react'
import {
  Modal,
  type ModalProps,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'

import { useBound, useMenu } from '@foldkit/react/interaction'

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

const rowBackground = (row: Interaction.MenuRow): string => {
  if (row.isFocused) {
    return '#111827'
  } else if (row.isHighlighted) {
    return '#e5e7eb'
  } else {
    return '#f9fafb'
  }
}

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
      accessibilityLabel={row.entry.what}
      accessibilityState={{
        disabled: isDisabled,
        selected: row.isHighlighted,
      }}
      disabled={isDisabled}
      onPress={() => {
        onChoose(row.entry.tag)
      }}
      style={{
        backgroundColor: rowBackground(row),
        borderRadius: 8,
        marginBottom: 6,
        opacity: isDisabled ? 0.55 : 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: row.isFocused ? '#ffffff' : '#111827' }}>
        {`${row.entry.label}  ${row.entry.what}`}
      </Text>
      {row.entry.availability._tag === 'Disabled' ? (
        <Text style={{ color: '#6b7280', fontSize: 12 }}>
          {row.entry.availability.because}
        </Text>
      ) : null}
    </Pressable>
  )
}

/**
 * The action menu as a React Native Modal, generic over any bound Program.
 * The Android back button and a tap outside dismiss the menu destination;
 * the filter types into the Program's query.
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
        <View
          style={{
            alignItems: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <Pressable
            accessibilityLabel="Dismiss actions"
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
            accessibilityLabel="Action menu"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 12,
              minWidth: 300,
              padding: 16,
            }}
          >
            <TextInput
              accessibilityLabel="Filter actions"
              autoFocus
              onChangeText={query => {
                bound.typeInMenu(query)
              }}
              placeholder="Filter actions"
              style={{
                borderColor: '#d1d5db',
                borderRadius: 8,
                borderWidth: 1,
                marginBottom: 12,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
              value={menu.query}
            />
            {Array.match(menu.rows, {
              onEmpty: () => (
                <Text style={{ color: '#6b7280' }}>No matching actions</Text>
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
      </Modal>
    ),
  })
}
