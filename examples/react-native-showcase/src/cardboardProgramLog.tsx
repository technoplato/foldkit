import * as Cardboard from 'cardboard-core-example'
import { CardboardClient } from 'cardboard-react-bindings-example'
import { Array, Option } from 'effect'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

const modelSummary = (model: Cardboard.Model): string => {
  if (model.page._tag === 'SequencePage') {
    return model.page.value.toString()
  } else if (model.page._tag === 'ConversationLedgerPage') {
    return 'Extra'
  } else {
    return Cardboard.accessibleDescription(model)
  }
}

/** Presents one Cardboard Program's engine-owned actions and runtime events. */
export const CardboardProgramLog = ({
  model,
  onBackToShowcase,
  onOpenExtra,
  replay,
}: Readonly<{
  model: Cardboard.Model
  onBackToShowcase: () => void
  onOpenExtra: () => void
  replay: ReturnType<typeof CardboardClient.useReplay>
}>) => (
  <View style={styles.programLog}>
    <View style={styles.pinnedState}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>Current Program state</Text>
        <Text adjustsFontSizeToFit numberOfLines={2} style={styles.model}>
          {modelSummary(model)}
        </Text>
        <Text style={styles.frame}>
          Frame {replay.frame} of {replay.finalFrame}
        </Text>
      </View>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          disabled={replay.frame === 0}
          onPress={replay.stepBackward}
          style={styles.control}
        >
          <Text style={styles.controlText}>Undo</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={replay.frame === replay.finalFrame}
          onPress={replay.stepForward}
          style={styles.control}
        >
          <Text style={styles.controlText}>Redo</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!replay.isBranchable}
          onPress={replay.resume}
          style={styles.done}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
      {Option.isSome(replay.maybeError) ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {replay.maybeError.value}
        </Text>
      ) : null}
    </View>
    <ScrollView contentContainerStyle={styles.list}>
      <Text style={styles.title}>Actions and events</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => replay.seek(0)}
        style={styles.row}
      >
        <Text style={styles.rowFrame}>0</Text>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>Initial Model</Text>
          <Text style={styles.rowDetail}>Program start</Text>
        </View>
      </Pressable>
      {Array.map(replay.transitions, (transition, index) => {
        const frame = index + 1
        const commandNames = Array.map(
          transition.commands,
          command => command.name,
        ).join(', ')
        return (
          <Pressable
            accessibilityRole="button"
            key={transition.sequence}
            onPress={() => replay.seek(frame)}
            style={[
              styles.row,
              frame > replay.frame ? styles.future : undefined,
            ]}
          >
            <Text style={styles.rowFrame}>{frame}</Text>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{transition.message._tag}</Text>
              <Text style={styles.rowDetail}>
                {transition.source._tag}
                {commandNames === '' ? '' : ` · Commands: ${commandNames}`}
                {transition.isOperationSettled ? ' · Settled' : ' · Waiting'}
              </Text>
            </View>
          </Pressable>
        )
      })}
      {Array.map(replay.runtimeEvents, event => (
        <Pressable
          accessibilityRole="button"
          key={`${event.timestamp.toString()}-${event.afterFrame.toString()}-${event.name}`}
          onPress={() => replay.seek(event.afterFrame)}
          style={[
            styles.row,
            styles.runtimeEvent,
            event.afterFrame > replay.frame ? styles.future : undefined,
          ]}
        >
          <Text style={styles.rowFrame}>{event.afterFrame}</Text>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>{event.name}</Text>
            <Text style={styles.rowDetail}>Runtime event</Text>
          </View>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        disabled={!replay.isBranchable}
        onPress={onOpenExtra}
        style={styles.extra}
      >
        <Text style={styles.extraText}>[E] Extra</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onBackToShowcase}
        style={styles.showcase}
      >
        <Text style={styles.showcaseText}>[S] Showcase</Text>
      </Pressable>
    </ScrollView>
  </View>
)

const styles = StyleSheet.create({
  programLog: { backgroundColor: '#17130d', flex: 1 },
  pinnedState: {
    backgroundColor: '#211a11',
    borderBottomColor: '#f2b85f',
    borderBottomWidth: 3,
    elevation: 12,
    gap: 14,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    zIndex: 10,
  },
  heading: { gap: 5 },
  eyebrow: {
    color: '#d3a861',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  model: {
    color: '#f7dca5',
    fontFamily: 'serif',
    fontSize: 80,
    fontWeight: '900',
    lineHeight: 84,
    maxHeight: 168,
  },
  frame: {
    color: '#d3a861',
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '800',
  },
  controls: { flexDirection: 'row', gap: 10 },
  control: {
    alignItems: 'center',
    borderColor: '#f2b85f',
    borderRadius: 999,
    borderWidth: 2,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 12,
  },
  controlText: { color: '#f7dca5', fontSize: 18, fontWeight: '900' },
  done: {
    alignItems: 'center',
    backgroundColor: '#f2b85f',
    borderRadius: 999,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 12,
  },
  doneText: { color: '#17130d', fontSize: 18, fontWeight: '900' },
  error: {
    backgroundColor: '#7e2424',
    borderRadius: 14,
    color: '#fff0f0',
    fontSize: 17,
    fontWeight: '800',
    padding: 14,
  },
  list: { gap: 12, padding: 20, paddingBottom: 64 },
  title: {
    color: '#f7dca5',
    fontFamily: 'serif',
    fontSize: 44,
    fontWeight: '800',
    lineHeight: 48,
    marginBottom: 8,
  },
  row: {
    alignItems: 'flex-start',
    backgroundColor: '#251d13',
    borderColor: '#665237',
    borderRadius: 22,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 16,
    padding: 20,
  },
  runtimeEvent: { borderStyle: 'dashed' },
  future: { opacity: 0.35 },
  rowFrame: {
    color: '#f2b85f',
    fontFamily: 'monospace',
    fontSize: 32,
    fontWeight: '900',
    minWidth: 40,
  },
  rowCopy: { flex: 1, gap: 5, minWidth: 0 },
  rowTitle: { color: '#f7dca5', fontSize: 25, fontWeight: '900' },
  rowDetail: { color: '#d3a861', fontSize: 16, lineHeight: 22 },
  extra: {
    alignItems: 'center',
    backgroundColor: '#f2b85f',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 68,
    marginTop: 24,
  },
  extraText: { color: '#17130d', fontSize: 22, fontWeight: '900' },
  showcase: { alignItems: 'center', justifyContent: 'center', minHeight: 54 },
  showcaseText: {
    color: '#d3a861',
    fontFamily: 'monospace',
    fontSize: 17,
    fontWeight: '800',
  },
})
