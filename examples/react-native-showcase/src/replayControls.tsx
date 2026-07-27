import {
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { ReactReplay } from 'shared-react-bindings-example'

type ReplayControlsProps<
  Model,
  Message extends Readonly<{ _tag: string }>,
> = Readonly<{
  label?: string
  replay: ReactReplay<Model, Message>
}>

const carrierForPath = (path: string): string => {
  if (Platform.OS === 'web' && globalThis.location !== undefined) {
    return `${globalThis.location.origin}${path}`
  }
  return `foldkit://showcase${path}`
}

/** Renders the same engine-owned replay controls for every showcase Program. */
export const ReplayControls = <
  Model,
  Message extends Readonly<{ _tag: string }>,
>({
  label = 'Replay',
  replay,
}: ReplayControlsProps<Model, Message>) => {
  const sharePath = (makePath: () => Promise<string>): void => {
    makePath()
      .then(path => Share.share({ message: carrierForPath(path) }))
      .catch(error => console.error('[foldkit] route sharing failed:', error))
  }

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {replay.mode} · {replay.frame}/{replay.finalFrame}
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Previous replay frame"
          accessibilityRole="button"
          disabled={replay.frame === 0}
          onPress={replay.stepBackward}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Inspect current replay"
          accessibilityRole="button"
          onPress={() => replay.inspect()}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Inspect</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Next replay frame"
          accessibilityRole="button"
          disabled={replay.frame === replay.finalFrame}
          onPress={replay.stepForward}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Next</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Share current state deep link"
          accessibilityRole="button"
          onPress={() => sharePath(replay.statePath)}
          style={styles.shareButton}
        >
          <Text style={styles.shareButtonText}>Share state</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Share replay deep link"
          accessibilityRole="button"
          onPress={() => sharePath(replay.replayPath)}
          style={styles.shareButton}
        >
          <Text style={styles.shareButtonText}>Share replay</Text>
        </Pressable>
      </View>
      <Text style={styles.events}>
        {replay.occurredRuntimeEvents.length.toString()} of{' '}
        {replay.runtimeEvents.length.toString()} runtime events occurred
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#18181b',
    borderColor: '#3f3f46',
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  value: {
    color: '#f4f4f5',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    backgroundColor: '#27272a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#f4f4f5',
    fontSize: 13,
    fontWeight: '600',
  },
  shareButton: {
    backgroundColor: '#a3e635',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  shareButtonText: {
    color: '#1a2e05',
    fontSize: 13,
    fontWeight: '700',
  },
  events: {
    color: '#71717a',
    fontSize: 12,
  },
})
