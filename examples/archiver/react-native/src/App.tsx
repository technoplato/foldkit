import { ArchiverProgram } from 'archiver-core-example'
import {
  ArchiverProvider,
  useArchiverActions,
  useArchiverModel,
} from 'archiver-react-bindings-example'
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
} from 'react-native'

/** Stub React Native host. Not a runnable Expo client. */
export const program = ArchiverProgram

export const App = () => (
  <ArchiverProvider>
    <ArchiverScreen />
  </ArchiverProvider>
)

const ArchiverScreen = () => {
  const model = useArchiverModel()
  const actions = useArchiverActions()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: '600' }}>Archiver</Text>
        <Text style={{ color: '#4b5563' }}>
          Paste an Instagram, TikTok, or YouTube URL to archive it.
        </Text>
        <TextInput
          onChangeText={actions.updatedUrlDraft}
          onSubmitEditing={actions.submittedArchiveUrl}
          placeholder="https://"
          style={{
            borderColor: '#d1d5db',
            borderRadius: 8,
            borderWidth: 1,
            padding: 12,
          }}
          value={model.urlDraft}
        />
        <Pressable
          onPress={actions.submittedArchiveUrl}
          style={{ backgroundColor: '#000000', padding: 12 }}
        >
          <Text style={{ color: '#ffffff', textAlign: 'center' }}>Archive</Text>
        </Pressable>
        {model.archives.length === 0 ? (
          <Text style={{ color: '#6b7280' }}>No archives yet.</Text>
        ) : (
          model.archives.map(archive => (
            <Pressable
              key={archive.id}
              onPress={() => actions.clickedArchive(archive.id)}
              style={{
                borderColor: '#e5e7eb',
                borderRadius: 8,
                borderWidth: 1,
                padding: 12,
              }}
            >
              <Text style={{ fontWeight: '600' }}>{archive.title}</Text>
              <Text style={{ color: '#6b7280', marginTop: 4 }}>
                {archive.status._tag === 'QueuedArchive'
                  ? 'Queued'
                  : archive.status._tag === 'ReadyArchive'
                    ? 'Ready'
                    : 'Failed'}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
