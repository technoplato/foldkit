import { type BoundBooks, booksOrigin } from 'books-core-example/browser'
import { Option } from 'effect'
import { type ReactElement, useEffect, useMemo, useState } from 'react'
import { Pressable, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ensureHostedInstantSession } from '@foldkit/instant/browser'

import { loadKeptSession, signInThroughTheSystem } from './access'
import {
  type PhoneConnection,
  connectionFrom,
  isMadeUpSessionShared,
  madeUpShelfOf,
} from './connection'
import {
  phoneDatabase,
  startMadeUpExpoBooks,
  startSignedInExpoBooks,
} from './startExpoBooks'

// GATE

type Gate =
  | Readonly<{ _tag: 'Opening' }>
  | Readonly<{ _tag: 'SignedOut'; connection: PhoneConnection }>
  | Readonly<{ _tag: 'Open'; books: BoundBooks }>

/**
 * Opens a person's library with the session the phone holds, by asking
 * the site's mint, as the web does. None when the mint signs nobody in.
 */
const openLibrary = async (
  connection: PhoneConnection,
  maybeSession: string | undefined,
): Promise<Option.Option<BoundBooks>> => {
  const member = await ensureHostedInstantSession(
    phoneDatabase(connection).core,
    {
      sessionOrigin: connection.sessionOrigin,
      ...(maybeSession === undefined ? {} : { accessToken: maybeSession }),
    },
  )
  return member === null
    ? Option.none()
    : Option.some(await startSignedInExpoBooks(connection, maybeSession))
}

/**
 * Opens Books for the app: the made-up library when the app was built
 * with no library to open, else a person's own. A person who is not
 * signed in yet is taken to the system's own sign-in sheet, the same
 * sign-in the web uses; when it comes back the app opens their library.
 * The next launch finds the session the phone kept and shows no sign-in.
 * A person who closes the sheet can open it again.
 *
 * @example
 * ```tsx
 * <BooksGate>{books => <ProgramProvider bound={books}>…</ProgramProvider>}</BooksGate>
 * ```
 */
export const BooksGate = ({
  children,
}: Readonly<{
  children: (books: BoundBooks) => ReactElement
}>): ReactElement | null => {
  const maybeConnection = useMemo(
    () =>
      connectionFrom(
        {
          EXPO_PUBLIC_BOOKS_INSTANT_APP_ID:
            process.env.EXPO_PUBLIC_BOOKS_INSTANT_APP_ID,
          EXPO_PUBLIC_BOOKS_MADE_UP: process.env.EXPO_PUBLIC_BOOKS_MADE_UP,
        },
        booksOrigin,
      ),
    [],
  )
  const [gate, setGate] = useState<Gate>({ _tag: 'Opening' })

  const signIn = (connection: PhoneConnection): void => {
    setGate({ _tag: 'Opening' })
    void signInThroughTheSystem()
      .then(outcome =>
        outcome._tag === 'SignedIn'
          ? openLibrary(connection, outcome.accessToken)
          : Option.none<BoundBooks>(),
      )
      .then(
        Option.match({
          onNone: () => {
            setGate({ _tag: 'SignedOut', connection })
          },
          onSome: books => {
            setGate({ _tag: 'Open', books })
          },
        }),
      )
  }

  useEffect(() => {
    Option.match(maybeConnection, {
      onNone: () => {
        void startMadeUpExpoBooks({
          isShared: isMadeUpSessionShared({
            EXPO_PUBLIC_BOOKS_MADE_UP: process.env.EXPO_PUBLIC_BOOKS_MADE_UP,
          }),
          shelf: madeUpShelfOf({
            EXPO_PUBLIC_BOOKS_MADE_UP_SHELF:
              process.env.EXPO_PUBLIC_BOOKS_MADE_UP_SHELF,
          }),
        }).then(books => {
          setGate({ _tag: 'Open', books })
        })
      },
      onSome: connection => {
        void loadKeptSession()
          .then(kept => openLibrary(connection, kept))
          .then(
            Option.match({
              onNone: () => {
                signIn(connection)
              },
              onSome: books => {
                setGate({ _tag: 'Open', books })
              },
            }),
          )
      },
    })
    // NOTE: the gate opens once, for the library the app was built with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maybeConnection])

  if (gate._tag === 'Open') {
    return children(gate.books)
  } else if (gate._tag === 'Opening') {
    return null
  } else {
    const connection = gate.connection
    return (
      <SafeAreaView
        style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}
      >
        <Pressable
          accessibilityRole="button"
          hitSlop={16}
          onPress={() => {
            signIn(connection)
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: '600' }}>
            Sign in to Books
          </Text>
        </Pressable>
      </SafeAreaView>
    )
  }
}
