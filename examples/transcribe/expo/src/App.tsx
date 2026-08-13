import { Array, Option } from "effect"
import { StatusBar } from "expo-status-bar"
import {
  StaticTranscribeResources,
  type TranscribeInstantClient,
  makeLiveTranscribeResources,
  schema,
  selectedJob,
  visibleJobs,
} from "transcribe-core-example"
import {
  initialTranscribeRoute,
  makeTranscribeReactClient,
} from "transcribe-react-bindings-example"
import { Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native"
import "react-native-get-random-values"

import { init } from "@instantdb/core"

const appId = process.env["EXPO_PUBLIC_INSTANT_APP_ID"]
const resources =
  appId === undefined || appId === ""
    ? StaticTranscribeResources
    : makeLiveTranscribeResources(init({ appId, schema }) as unknown as TranscribeInstantClient)

const TranscribeClient = makeTranscribeReactClient(resources)

export const App = () => (
  <TranscribeClient.Provider initialRoute={initialTranscribeRoute}>
    <StatusBar style="dark" />
    <TranscribeScreen />
  </TranscribeClient.Provider>
)

const TranscribeScreen = () => {
  const model = TranscribeClient.useModel()
  const actions = TranscribeClient.useActions()
  const jobs = visibleJobs(model)
  const source =
    model.source === "Instant"
      ? "Live Instant jobs"
      : "Seed jobs. Instant is unreachable or empty."
  const maybeJob = selectedJob(model)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fafaf9" }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: "#075985" }}>
          KNOPHY TRANSCRIBE
        </Text>
        <Text style={{ fontSize: 28, fontWeight: "600" }}>Video transcripts</Text>
        <Text style={{ color: "#57534e" }}>{source}</Text>
        <TextInput
          onChangeText={actions.updatedDraftUrl}
          placeholder="https://youtu.be/…"
          style={{
            borderColor: "#d6d3d1",
            borderRadius: 12,
            borderWidth: 1,
            padding: 12,
            backgroundColor: "white",
          }}
          value={model.draftUrl}
        />
        <Pressable onPress={() => actions.submittedUrl(model.draftUrl)}>
          <Text style={{ color: "#075985", fontWeight: "600" }}>Open job</Text>
        </Pressable>
        {Array.map(jobs, job => (
          <Pressable
            key={job.id}
            onPress={() => actions.clickedJob(job.id)}
            style={{
              backgroundColor: "white",
              borderColor: "#e7e5e4",
              borderRadius: 16,
              borderWidth: 1,
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "600" }}>{job.title}</Text>
            <Text style={{ marginTop: 8, color: "#57534e" }}>{job.status}</Text>
          </Pressable>
        ))}
        {Option.match(maybeJob, {
          onNone: () => null,
          onSome: job => (
            <View style={{ backgroundColor: "white", borderRadius: 16, padding: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: "700" }}>{job.title}</Text>
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
