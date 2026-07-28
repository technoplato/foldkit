import * as Cardboard from 'cardboard-core-example'
import {
  CardboardClient,
  type ReplayPresentationClient,
  replayPresentationClients,
} from 'cardboard-react-bindings-example'
import { Array, Match as M, Option } from 'effect'
import { useEffect, useState } from 'react'
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'

const modelSummary = (model: Cardboard.Model): string => {
  if (model.page._tag === 'SequencePage') {
    return model.page.value.toString()
  } else if (model.page._tag === 'ConversationLedgerPage') {
    return 'Extra'
  } else {
    return Cardboard.accessibleDescription(model)
  }
}

const ignoredLongPress = (): undefined => undefined

const ReplayClientPreview = ({
  client,
  summary,
}: Readonly<{
  client: ReplayPresentationClient
  summary: string
}>) =>
  M.value(client).pipe(
    M.tagsExhaustive({
      WebReplayClient: ({ title }) => (
        <View style={[styles.clientPreview, styles.webPreview]}>
          <Text selectable={false} style={styles.previewChrome}>
            ● ● ●
          </Text>
          <Text
            adjustsFontSizeToFit
            numberOfLines={2}
            selectable={false}
            style={styles.previewModel}
          >
            {summary}
          </Text>
          <Text selectable={false} style={styles.previewLabel}>
            {title}
          </Text>
        </View>
      ),
      MobileReplayClient: ({ title }) => (
        <View style={[styles.clientPreview, styles.mobilePreview]}>
          <View style={styles.phoneSpeaker} />
          <Text
            adjustsFontSizeToFit
            numberOfLines={2}
            selectable={false}
            style={styles.previewModel}
          >
            {summary}
          </Text>
          <Text selectable={false} style={styles.previewLabel}>
            {title}
          </Text>
        </View>
      ),
      TerminalReplayClient: () => (
        <View style={[styles.clientPreview, styles.terminalPreview]}>
          <Text selectable={false} style={styles.terminalLine}>
            $ foldkit-cardboard
          </Text>
          <Text selectable={false} style={styles.previewModel}>
            {summary}
          </Text>
          <Text selectable={false} style={styles.terminalLine}>
            [U] Undo [R] Redo [D] Done
          </Text>
        </View>
      ),
      UnavailableReplayClient: () => (
        <View style={[styles.clientPreview, styles.unavailablePreview]}>
          <Text selectable={false} style={styles.previewModel}>
            {summary}
          </Text>
          <Text selectable={false} style={styles.previewLabel}>
            DevTools journal
          </Text>
        </View>
      ),
    }),
  )

const openWebClient = (url: string): void => {
  if (Platform.OS === 'web') {
    globalThis.open(url, '_blank', 'noopener,noreferrer')
  } else {
    void Linking.openURL(url)
  }
}

const shareTerminalCommand = (command: string, onCopied: () => void): void => {
  if (Platform.OS === 'web') {
    void globalThis.navigator.clipboard.writeText(command).then(onCopied)
  } else {
    void Share.share({ message: command })
  }
}

const terminalActionLabel = (isCopied: boolean): string => {
  if (isCopied) {
    return 'Command copied'
  } else if (Platform.OS === 'web') {
    return 'Copy command'
  } else {
    return 'Share command'
  }
}

const ReplayClientCard = ({
  client,
  copiedClientId,
  onCopied,
  summary,
}: Readonly<{
  client: ReplayPresentationClient
  copiedClientId: Option.Option<string>
  onCopied: (clientId: string) => void
  summary: string
}>) => {
  const isCopied =
    Option.isSome(copiedClientId) && copiedClientId.value === client.clientId
  return M.value(client).pipe(
    M.tagsExhaustive({
      WebReplayClient: webClient => (
        <View style={styles.clientCard}>
          <ReplayClientPreview client={webClient} summary={summary} />
          <Text selectable={false} style={styles.clientKind}>
            Web Client
          </Text>
          <Text selectable={false} style={styles.clientTitle}>
            {webClient.title}
          </Text>
          <Text selectable={false} style={styles.clientDescription}>
            {webClient.description}
          </Text>
          <Text numberOfLines={3} selectable={false} style={styles.carrier}>
            {webClient.url}
          </Text>
          <Pressable
            accessibilityRole="button"
            onLongPress={ignoredLongPress}
            onPress={() => openWebClient(webClient.url)}
            style={styles.launchClient}
          >
            <Text selectable={false} style={styles.launchClientText}>
              Open new window
            </Text>
          </Pressable>
        </View>
      ),
      MobileReplayClient: mobileClient => (
        <View style={styles.clientCard}>
          <ReplayClientPreview client={mobileClient} summary={summary} />
          <Text selectable={false} style={styles.clientKind}>
            Mobile Client
          </Text>
          <Text selectable={false} style={styles.clientTitle}>
            {mobileClient.title}
          </Text>
          <Text selectable={false} style={styles.clientDescription}>
            {mobileClient.description}
          </Text>
          <Text numberOfLines={3} selectable={false} style={styles.carrier}>
            {mobileClient.deepLink}
          </Text>
          <Pressable
            accessibilityRole="button"
            onLongPress={ignoredLongPress}
            onPress={() => void Linking.openURL(mobileClient.deepLink)}
            style={styles.launchClient}
          >
            <Text selectable={false} style={styles.launchClientText}>
              Open mobile app
            </Text>
          </Pressable>
        </View>
      ),
      TerminalReplayClient: terminalClient => (
        <View style={styles.clientCard}>
          <ReplayClientPreview client={terminalClient} summary={summary} />
          <Text selectable={false} style={styles.clientKind}>
            Terminal Client
          </Text>
          <Text selectable={false} style={styles.clientTitle}>
            {terminalClient.title}
          </Text>
          <Text selectable={false} style={styles.clientDescription}>
            {terminalClient.description}
          </Text>
          <Text numberOfLines={3} selectable={false} style={styles.carrier}>
            {terminalClient.command}
          </Text>
          <Pressable
            accessibilityRole="button"
            onLongPress={ignoredLongPress}
            onPress={() =>
              shareTerminalCommand(terminalClient.command, () =>
                onCopied(terminalClient.clientId),
              )
            }
            style={styles.launchClient}
          >
            <Text selectable={false} style={styles.launchClientText}>
              {terminalActionLabel(isCopied)}
            </Text>
          </Pressable>
        </View>
      ),
      UnavailableReplayClient: unavailableClient => (
        <View style={[styles.clientCard, styles.unavailableCard]}>
          <ReplayClientPreview client={unavailableClient} summary={summary} />
          <Text selectable={false} style={styles.clientKind}>
            Framework seam
          </Text>
          <Text selectable={false} style={styles.clientTitle}>
            {unavailableClient.title}
          </Text>
          <Text selectable={false} style={styles.clientDescription}>
            {unavailableClient.description}
          </Text>
          <Text selectable={false} style={styles.clientDescription}>
            {unavailableClient.reason}
          </Text>
        </View>
      ),
    }),
  )
}

const ReplayClientMatrix = ({
  portableReplayPath,
  summary,
}: Readonly<{ portableReplayPath: string; summary: string }>) => {
  const [copiedClientId, setCopiedClientId] = useState<Option.Option<string>>(
    Option.none(),
  )
  return (
    <View
      accessibilityLabel="Open this state in another Client"
      style={styles.matrix}
    >
      <Text selectable={false} style={styles.clientKind}>
        One frame, many presentations
      </Text>
      <Text selectable={false} style={styles.matrixTitle}>
        Open this state
      </Text>
      <Text selectable={false} style={styles.matrixDescription}>
        Every Client interprets the same portable replay path. Only its carrier
        changes.
      </Text>
      {Array.map(replayPresentationClients(portableReplayPath), client => (
        <ReplayClientCard
          client={client}
          copiedClientId={copiedClientId}
          key={client.clientId}
          onCopied={clientId => setCopiedClientId(Option.some(clientId))}
          summary={summary}
        />
      ))}
    </View>
  )
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
}>) => {
  const [maybeReplayPath, setMaybeReplayPath] = useState<Option.Option<string>>(
    Option.none(),
  )
  useEffect(() => {
    let isCurrent = true
    void replay.replayPath().then(portableReplayPath => {
      if (isCurrent) {
        setMaybeReplayPath(Option.some(portableReplayPath))
      }
    })
    return () => {
      isCurrent = false
    }
  }, [replay.frame, replay.finalFrame])
  const summary = modelSummary(model)
  return (
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
            onLongPress={ignoredLongPress}
            onPress={replay.stepBackward}
            style={styles.control}
          >
            <Text style={styles.controlText}>Undo</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={replay.frame === replay.finalFrame}
            onLongPress={ignoredLongPress}
            onPress={replay.stepForward}
            style={styles.control}
          >
            <Text style={styles.controlText}>Redo</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!replay.isBranchable}
            onLongPress={ignoredLongPress}
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
          onLongPress={ignoredLongPress}
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
              onLongPress={ignoredLongPress}
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
            onLongPress={ignoredLongPress}
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
        {Option.isSome(maybeReplayPath) ? (
          <ReplayClientMatrix
            portableReplayPath={maybeReplayPath.value}
            summary={summary}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={!replay.isBranchable}
          onLongPress={ignoredLongPress}
          onPress={onOpenExtra}
          style={styles.extra}
        >
          <Text style={styles.extraText}>[E] Extra</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onLongPress={ignoredLongPress}
          onPress={onBackToShowcase}
          style={styles.showcase}
        >
          <Text style={styles.showcaseText}>[S] Showcase</Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

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
    textShadowColor: '#000000',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 3,
    textTransform: 'uppercase',
  },
  model: {
    color: '#f7dca5',
    fontFamily: 'serif',
    fontSize: 80,
    fontWeight: '900',
    lineHeight: 84,
    maxHeight: 168,
    textShadowColor: '#7b481e',
    textShadowOffset: { height: 4, width: 0 },
    textShadowRadius: 5,
  },
  frame: {
    color: '#d3a861',
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '800',
    textShadowColor: '#000000',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 3,
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
  controlText: {
    color: '#f7dca5',
    fontSize: 18,
    fontWeight: '900',
    textShadowColor: '#000000',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 3,
  },
  done: {
    alignItems: 'center',
    backgroundColor: '#f2b85f',
    borderRadius: 999,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 12,
  },
  doneText: {
    color: '#17130d',
    fontSize: 18,
    fontWeight: '900',
    textShadowColor: '#fff1bd',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 1,
  },
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
    textShadowColor: '#7b481e',
    textShadowOffset: { height: 3, width: 0 },
    textShadowRadius: 4,
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
    shadowColor: '#000000',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 9,
  },
  runtimeEvent: { borderStyle: 'dashed' },
  future: { opacity: 0.35 },
  rowFrame: {
    color: '#f2b85f',
    fontFamily: 'monospace',
    fontSize: 32,
    fontWeight: '900',
    minWidth: 40,
    textShadowColor: '#7b481e',
    textShadowOffset: { height: 3, width: 0 },
    textShadowRadius: 4,
  },
  rowCopy: { flex: 1, gap: 5, minWidth: 0 },
  rowTitle: {
    color: '#f7dca5',
    fontSize: 25,
    fontWeight: '900',
    textShadowColor: '#000000',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 3,
  },
  rowDetail: {
    color: '#d3a861',
    fontSize: 16,
    lineHeight: 22,
    textShadowColor: '#000000',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 3,
  },
  matrix: { gap: 14, marginTop: 28 },
  matrixTitle: {
    color: '#f7dca5',
    fontFamily: 'serif',
    fontSize: 44,
    fontWeight: '900',
    lineHeight: 48,
    textShadowColor: '#7b481e',
    textShadowOffset: { height: 3, width: 0 },
    textShadowRadius: 4,
  },
  matrixDescription: {
    color: '#d3a861',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 25,
    marginBottom: 8,
  },
  clientCard: {
    backgroundColor: '#251d13',
    borderColor: '#665237',
    borderRadius: 24,
    borderWidth: 2,
    gap: 8,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
  },
  unavailableCard: { opacity: 0.65 },
  clientPreview: {
    alignItems: 'center',
    backgroundColor: '#100d09',
    borderColor: '#8c704a',
    borderWidth: 2,
    gap: 8,
    justifyContent: 'center',
    minHeight: 150,
    padding: 18,
  },
  webPreview: { borderRadius: 16 },
  mobilePreview: {
    alignSelf: 'center',
    borderRadius: 28,
    maxWidth: 190,
    width: '70%',
  },
  terminalPreview: {
    alignItems: 'flex-start',
    borderRadius: 8,
  },
  unavailablePreview: { borderStyle: 'dashed' },
  previewChrome: {
    alignSelf: 'flex-start',
    color: '#d3a861',
    fontSize: 12,
    letterSpacing: 3,
  },
  phoneSpeaker: {
    backgroundColor: '#665237',
    borderRadius: 999,
    height: 6,
    width: '42%',
  },
  previewModel: {
    color: '#f2b85f',
    fontFamily: 'serif',
    fontSize: 60,
    fontWeight: '900',
    lineHeight: 64,
    textShadowColor: '#7b481e',
    textShadowOffset: { height: 4, width: 0 },
    textShadowRadius: 5,
  },
  previewLabel: { color: '#d3a861', fontSize: 14, fontWeight: '800' },
  terminalLine: {
    color: '#d3a861',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '800',
  },
  clientKind: {
    color: '#d3a861',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: '#000000',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 3,
    textTransform: 'uppercase',
  },
  clientTitle: {
    color: '#f7dca5',
    fontFamily: 'serif',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
    textShadowColor: '#7b481e',
    textShadowOffset: { height: 3, width: 0 },
    textShadowRadius: 4,
  },
  clientDescription: {
    color: '#d3a861',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  carrier: {
    color: '#f2b85f',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 17,
  },
  launchClient: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#f2b85f',
    borderRadius: 999,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 52,
    paddingHorizontal: 18,
    shadowColor: '#000000',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
  },
  launchClientText: {
    color: '#17130d',
    fontSize: 17,
    fontWeight: '900',
    textShadowColor: '#fff1bd',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 1,
  },
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
