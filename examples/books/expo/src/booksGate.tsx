import { type BoundBooks, booksOrigin } from 'books-core-example/browser'
import { Option, Schema as S } from 'effect'
import { type ReactElement, useEffect, useMemo, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

import {
  ensureHostedInstantSession,
  hostedIdentitySessionPath,
} from '@foldkit/instant/browser'

import {
  type PhoneConnection,
  connectionFrom,
  isBackAtBooks,
} from './connection'
import {
  phoneDatabase,
  startMadeUpExpoBooks,
  startSignedInExpoBooks,
} from './startExpoBooks'

// GATE

type Gate =
  | Readonly<{ _tag: 'Opening' }>
  | Readonly<{ _tag: 'SigningIn'; connection: PhoneConnection }>
  | Readonly<{ _tag: 'Open'; books: BoundBooks }>

// NOTE: the site answers a visitor who is not signed in at its root by
// sending them to sign in, and brings them back there. Its book pages
// answer such a visitor with a public preview or nothing.
const signInPath = '/'

const MintedSession = S.Struct({ token: S.String })

const decodeMinted = S.decodeUnknownOption(S.fromJsonString(MintedSession))

// NOTE: the page asks the site's own mint for a session, as the web does,
// and hands the answer to the app. The sign-in's cookie never leaves the
// page, and nothing here keeps the answer: Instant keeps its own session.
const askTheMint = `fetch(${JSON.stringify(hostedIdentitySessionPath)}, { credentials: 'include' })
  .then(response => response.text())
  .then(text => window.ReactNativeWebView.postMessage(text))
  .catch(() => window.ReactNativeWebView.postMessage(''));
true;`

/**
 * Opens Books for the app: the made-up library when the app was built
 * with no library to open, else a person's own. A person who is not
 * signed in yet sees the same sign-in page the web shows, inside the
 * app; when it comes back to Books, the page asks the site's mint for
 * their session and the app opens their library. The next launch finds
 * the session the phone kept and shows no sign-in.
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
  const [isAsking, setIsAsking] = useState(false)

  useEffect(() => {
    let isLeft = false
    const open = (books: BoundBooks): void => {
      if (!isLeft) {
        setGate({ _tag: 'Open', books })
      }
    }
    Option.match(maybeConnection, {
      onNone: () => {
        void startMadeUpExpoBooks().then(open)
      },
      onSome: connection => {
        void ensureHostedInstantSession(phoneDatabase(connection).core, {
          sessionOrigin: connection.sessionOrigin,
        }).then(member => {
          if (member !== null) {
            void startSignedInExpoBooks(connection).then(open)
          } else if (!isLeft) {
            setGate({ _tag: 'SigningIn', connection })
          }
        })
      },
    })
    return () => {
      isLeft = true
    }
  }, [maybeConnection])

  if (gate._tag === 'Open') {
    return children(gate.books)
  } else if (gate._tag === 'Opening') {
    return null
  } else {
    const connection = gate.connection
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <WebView
          injectedJavaScript={isAsking ? askTheMint : undefined}
          key={isAsking ? 'asking' : 'signing-in'}
          onMessage={event => {
            Option.match(decodeMinted(event.nativeEvent.data), {
              onNone: () => {
                setIsAsking(false)
              },
              onSome: minted => {
                void phoneDatabase(connection)
                  .core.auth.signInWithToken(minted.token)
                  .then(() => startSignedInExpoBooks(connection))
                  .then(books => {
                    setGate({ _tag: 'Open', books })
                  })
              },
            })
          }}
          onNavigationStateChange={state => {
            if (
              !isAsking &&
              !state.loading &&
              isBackAtBooks(state.url, connection.sessionOrigin)
            ) {
              setIsAsking(true)
            }
          }}
          sharedCookiesEnabled
          source={{ uri: `${connection.sessionOrigin}${signInPath}` }}
        />
      </SafeAreaView>
    )
  }
}
