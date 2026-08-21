import { Array, Option } from 'effect'
import { StatusBar } from 'expo-status-bar'
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
  StaticTranscribeResources,
  type TranscribeInstantClient,
  makeLiveTranscribeResources,
  schema,
  selectedJob,
  visibleJobs,
} from 'transcribe-core-example'
import {
  initialTranscribeRoute,
  makeTranscribeReactClient,
} from 'transcribe-react-bindings-example'

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

const hostedIdentityOrigin = 'https://transcribe.knophy.com'
const appId = process.env['EXPO_PUBLIC_INSTANT_APP_ID']
const database =
  appId === undefined || appId === '' ? undefined : init({ appId, schema })

const transcribeResources = (accessToken: string | undefined) => {
  if (database === undefined) {
    return StaticTranscribeResources
  }
  if (accessToken === undefined) {
    return withHostedIdentity(
      makeLiveTranscribeResources(
        database as unknown as TranscribeInstantClient,
      ),
      database,
      { sessionOrigin: hostedIdentityOrigin },
    )
  }
  return withHostedIdentity(
    makeLiveTranscribeResources(database as unknown as TranscribeInstantClient),
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
  const [TranscribeClient, setTranscribeClient] = useState<ReturnType<
    typeof makeTranscribeReactClient
  > | null>(null)

  useEffect(() => {
    void loadStoredAccessToken().then(token => {
      setTranscribeClient(makeTranscribeReactClient(transcribeResources(token)))
      setAccessEmail(emailFromToken(token))
    })
  }, [])

  if (TranscribeClient === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fafaf9' }}>
        <Text style={{ padding: 24 }}>Restoring Access…</Text>
      </SafeAreaView>
    )
  }

  return (
    <TranscribeClient.Provider initialRoute={initialTranscribeRoute}>
      <StatusBar style="dark" />
      <TranscribeScreen
        TranscribeClient={TranscribeClient}
        accessEmail={accessEmail}
        onAccessEmail={setAccessEmail}
      />
    </TranscribeClient.Provider>
  )
}

const TranscribeScreen = ({
  TranscribeClient,
  accessEmail,
  onAccessEmail,
}: Readonly<{
  TranscribeClient: ReturnType<typeof makeTranscribeReactClient>
  accessEmail: string | undefined
  onAccessEmail: (email: string | undefined) => void
}>) => {
  const model = TranscribeClient.useModel()
  const actions = TranscribeClient.useActions()
  const jobs = visibleJobs(model)
  const source =
    model.source === 'Instant'
      ? 'Live Instant jobs'
      : 'Seed jobs. Instant is unreachable or empty.'
  const maybeJob = selectedJob(model)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fafaf9' }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#075985' }}>
          KNOPHY TRANSCRIBE
        </Text>
        <Text style={{ fontSize: 28, fontWeight: '600' }}>
          Video transcripts
        </Text>
        <Text style={{ color: '#57534e' }}>{source}</Text>
        <AccessBar email={accessEmail} onEmail={onAccessEmail} />
        <TextInput
          onChangeText={actions.updatedDraftUrl}
          placeholder="https://youtu.be/…"
          style={{
            borderColor: '#d6d3d1',
            borderRadius: 12,
            borderWidth: 1,
            padding: 12,
            backgroundColor: 'white',
          }}
          value={model.draftUrl}
        />
        <Pressable onPress={() => actions.submittedUrl(model.draftUrl)}>
          <Text style={{ color: '#075985', fontWeight: '600' }}>Open job</Text>
        </Pressable>
        {Array.map(jobs, job => (
          <Pressable
            key={job.id}
            onPress={() => actions.clickedJob(job.id)}
            style={{
              backgroundColor: 'white',
              borderColor: '#e7e5e4',
              borderRadius: 16,
              borderWidth: 1,
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '600' }}>{job.title}</Text>
            <Text style={{ marginTop: 8, color: '#57534e' }}>{job.status}</Text>
          </Pressable>
        ))}
        {Option.match(maybeJob, {
          onNone: () => null,
          onSome: job => (
            <View
              style={{
                backgroundColor: 'white',
                borderRadius: 16,
                padding: 16,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '700' }}>
                {job.title}
              </Text>
              <Text style={{ marginTop: 8 }}>{job.analysis}</Text>
              <Pressable onPress={actions.closedJob}>
                <Text style={{ marginTop: 12 }}>Close</Text>
              </Pressable>
            </View>
          ),
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
        <Text style={{ color: '#075985' }}>{email} · Sign out</Text>
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
      <Text style={{ color: '#075985', fontWeight: '600' }}>
        Sign in with Access
      </Text>
    </Pressable>
  )
}
