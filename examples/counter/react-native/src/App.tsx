import {
  CounterProvider,
  useCounterActions,
  useCounterModel,
} from 'counter-react-bindings-example'
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native'

export const App = () => (
  <CounterProvider>
    <CounterScreen />
  </CounterProvider>
)

const CounterScreen = () => {
  const model = useCounterModel()
  const actions = useCounterActions()

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.count}>{model.count}</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={actions.clickedDecrement}
            style={styles.button}
          >
            <Text style={styles.buttonText}>-</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={actions.clickedReset}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Reset</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={actions.clickedIncrement}
            style={styles.button}
          >
            <Text style={styles.buttonText}>+</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  count: {
    color: '#111827',
    fontSize: 72,
    fontWeight: '600',
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    backgroundColor: '#000000',
    minWidth: 72,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
})
