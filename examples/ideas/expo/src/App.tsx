import { Array, Option } from "effect"
import { StatusBar } from "expo-status-bar"
import {
  StaticIdeasResources,
  type IdeasInstantClient,
  makeLiveIdeasResources,
  schema,
  visibleIdeas,
} from "ideas-core-example"
import {
  initialIdeasRoute,
  makeIdeasReactClient,
} from "ideas-react-bindings-example"
import { Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native"
import "react-native-get-random-values"

import { init } from "@instantdb/core"

const appId = process.env["EXPO_PUBLIC_INSTANT_APP_ID"]
const resources =
  appId === undefined || appId === ""
    ? StaticIdeasResources
    : makeLiveIdeasResources(init({ appId, schema }) as unknown as IdeasInstantClient)

const IdeasClient = makeIdeasReactClient(resources)

export const App = () => (
  <IdeasClient.Provider initialRoute={initialIdeasRoute}>
    <StatusBar style="dark" />
    <IdeasScreen />
  </IdeasClient.Provider>
)

const IdeasScreen = () => {
  const model = IdeasClient.useModel()
  const actions = IdeasClient.useActions()
  const ideas = visibleIdeas(model)
  const source =
    model.source === "Instant"
      ? "Live Instant catalog"
      : "Seed catalog. Instant is unreachable or empty."

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fafaf9" }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: "#92400e" }}>
          KNOPHY IDEAS
        </Text>
        <Text style={{ fontSize: 28, fontWeight: "600" }}>Public notes</Text>
        <Text style={{ color: "#57534e" }}>{source}</Text>
        <TextInput
          onChangeText={actions.updatedQuery}
          placeholder="Filter notes"
          style={{
            borderColor: "#d6d3d1",
            borderRadius: 12,
            borderWidth: 1,
            padding: 12,
            backgroundColor: "white",
          }}
          value={model.query}
        />
        {Array.map(ideas, idea => (
          <Pressable
            key={idea.id}
            onPress={() => actions.clickedIdea(idea.id)}
            style={{
              backgroundColor: "white",
              borderColor: "#e7e5e4",
              borderRadius: 16,
              borderWidth: 1,
              padding: 16,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "600" }}>{idea.title}</Text>
            <Text style={{ marginTop: 8, color: "#57534e" }}>{idea.body}</Text>
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
              <View style={{ backgroundColor: "white", borderRadius: 16, padding: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: "700" }}>
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
