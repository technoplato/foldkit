import { Array, Option } from 'effect'
import { StatusBar } from 'expo-status-bar'
import {
  type IdeasInstantClient,
  StaticIdeasResources,
  makeLiveIdeasResources,
  schema,
  visibleIdeas,
} from 'ideas-core-example'
import {
  initialIdeasRoute,
  makeIdeasReactClient,
} from 'ideas-react-bindings-example'
import { useEffect, useState } from 'react'
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import 'react-native-get-random-values'

import {
  accessIdentityFromToken,
  ensureHostedInstantSession,
  withHostedIdentity,
} from '@foldkit/instant'
import { init } from '@instantdb/core'

import {
  clearStoredAccessToken,
  loadStoredAccessToken,
  requestKnophyAccessToken,
} from './access.js'

const hostedIdentityOrigin = 'https://ideas.knophy.com'
const appId = process.env['EXPO_PUBLIC_INSTANT_APP_ID']
const database =
  appId === undefined || appId === '' ? undefined : init({ appId, schema })

const ideasResources = (accessToken: string | undefined) => {
  if (database === undefined) {
    return StaticIdeasResources
  }
  if (accessToken === undefined) {
    return withHostedIdentity(
      makeLiveIdeasResources(database as unknown as IdeasInstantClient),
      database,
      { sessionOrigin: hostedIdentityOrigin },
    )
  }
  return withHostedIdentity(
    makeLiveIdeasResources(database as unknown as IdeasInstantClient),
    database,
    { accessToken, sessionOrigin: hostedIdentityOrigin },
  )
}

const emailFromToken = (token: string | undefined): string | undefined => {
  if (token === undefined) {
    return undefined
  }
  const maybeIdentity = accessIdentityFromToken(token)
  if (Option.isNone(maybeIdentity)) {
    return undefined
  } else {
    return maybeIdentity.value.email
  }
}

export const App = () => {
  const [accessEmail, setAccessEmail] = useState<string | undefined>(undefined)
  const [IdeasClient, setIdeasClient] = useState<ReturnType<
    typeof makeIdeasReactClient
  > | null>(null)

  useEffect(() => {
    void loadStoredAccessToken().then(token => {
      setIdeasClient(makeIdeasReactClient(ideasResources(token)))
      setAccessEmail(emailFromToken(token))
    })
  }, [])

  if (IdeasClient === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fafaf9' }}>
        <Text style={{ padding: 24 }}>Restoring Access…</Text>
      </SafeAreaView>
    )
  }

  return (
    <IdeasClient.Provider initialRoute={initialIdeasRoute}>
      <StatusBar style="dark" />
      <IdeasScreen
        IdeasClient={IdeasClient}
        accessEmail={accessEmail}
        onAccessEmail={setAccessEmail}
      />
    </IdeasClient.Provider>
  )
}

const IdeasScreen = ({
  IdeasClient,
  accessEmail,
  onAccessEmail,
}: Readonly<{
  IdeasClient: ReturnType<typeof makeIdeasReactClient>
  accessEmail: string | undefined
  onAccessEmail: (email: string | undefined) => void
}>) => {
  const model = IdeasClient.useModel()
  const actions = IdeasClient.useActions()
  const ideas = visibleIdeas(model)
  const source =
    model.source === 'Instant'
      ? 'Live Instant catalog'
      : 'Seed catalog. Instant is unreachable or empty.'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fafaf9' }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400e' }}>
          KNOPHY IDEAS
        </Text>
        <Text style={{ fontSize: 28, fontWeight: '600' }}>Public notes</Text>
        <Text style={{ color: '#57534e' }}>{source}</Text>
        <AccessBar email={accessEmail} onEmail={onAccessEmail} />
        <TextInput
          onChangeText={actions.updatedQuery}
          placeholder="Filter notes"
          style={{
            borderColor: '#d6d3d1',
            borderRadius: 12,
            borderWidth: 1,
            padding: 12,
            backgroundColor: 'white',
          }}
          value={model.query}
        />
        {Array.map(ideas, idea => (
          <Pressable
            key={idea.id}
            onPress={() => actions.clickedIdea(idea.id)}
            style={{
              backgroundColor: 'white',
              borderColor: '#e7e5e4',
              borderRadius: 16,
              borderWidth: 1,
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '600' }}>
              {idea.title}
            </Text>
            <Text style={{ marginTop: 8, color: '#57534e' }}>{idea.body}</Text>
          </Pressable>
        ))}
        {Option.match(model.selectedId, {
          onNone: () => null,
          onSome: id => {
            const maybeIdea = Array.findFirst(ideas, idea => idea.id === id)
            if (Option.isNone(maybeIdea)) {
              return null
            }
            return (
              <View
                style={{
                  backgroundColor: 'white',
                  borderRadius: 16,
                  padding: 16,
                }}
              >
                <Text style={{ fontSize: 20, fontWeight: '700' }}>
                  {maybeIdea.value.title}
                </Text>
                <Text style={{ marginTop: 8 }}>{maybeIdea.value.body}</Text>
                <Pressable onPress={actions.closedIdea}>
                  <Text style={{ marginTop: 12 }}>Close</Text>
                </Pressable>
              </View>
            )
          },
        })}
      </ScrollView>
    </SafeAreaView>
  )
}

const AccessBar = ({
  email,
  onEmail,
}: Readonly<{
  email: string | undefined
  onEmail: (email: string | undefined) => void
}>) => {
  if (email !== undefined) {
    return (
      <Pressable
        onPress={() => {
          void clearStoredAccessToken().then(() => {
            onEmail(undefined)
          })
        }}
      >
        <Text style={{ color: '#92400e' }}>{email} · Sign out</Text>
      </Pressable>
    )
  }
  return (
    <Pressable
      onPress={() => {
        void requestKnophyAccessToken().then(async token => {
          if (database !== undefined && token !== undefined) {
            await ensureHostedInstantSession(database, {
              accessToken: token,
              sessionOrigin: hostedIdentityOrigin,
            })
          }
          onEmail(emailFromToken(token))
        })
      }}
    >
      <Text style={{ color: '#92400e', fontWeight: '600' }}>
        Sign in with Access
      </Text>
    </Pressable>
  )
}
