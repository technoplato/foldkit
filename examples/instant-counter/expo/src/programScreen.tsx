import {
  type CounterDetailMode,
  type CounterFactStatus,
  type CounterRow,
  type Model,
  destinationForModel,
  navigationToPath,
} from 'counters-core-example'
import { Array, Match as M, Option, Result } from 'effect'
import {
  type MultipleCountersV3ProgramAction,
  multipleCountersV3ProgramActionForToken,
  multipleCountersV3ProgramActions,
} from 'instant-counter-example/v3-client'
import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

type ProgramScreenProps = Readonly<{
  isNavigationEnabled: boolean
  model: Model
  onPerform: (token: string) => void
}>

type ActionButtonProps = Readonly<{
  actions: ReadonlyArray<MultipleCountersV3ProgramAction>
  label: string
  onPerform: (token: string) => void
  testID: string
  token: string
  tone?: 'primary' | 'quiet' | 'destructive'
}>

const buttonToneStyle = (tone: ActionButtonProps['tone']) => {
  if (tone === 'quiet') {
    return styles.quietButton
  }
  if (tone === 'destructive') {
    return styles.destructiveButton
  }
  return styles.primaryButton
}

const ActionButton = ({
  actions,
  label,
  onPerform,
  testID,
  token,
  tone = 'primary',
}: ActionButtonProps) => {
  const maybeAction = multipleCountersV3ProgramActionForToken(actions, token)
  if (Option.isNone(maybeAction)) {
    return null
  }
  const isEnabled = maybeAction.value.isEnabled
  return (
    <Pressable
      accessibilityLabel={isEnabled ? label : `${label} unavailable`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !isEnabled }}
      disabled={!isEnabled}
      onPress={() => onPerform(token)}
      style={({ pressed }) => [
        styles.button,
        buttonToneStyle(tone),
        pressed ? styles.pressedButton : null,
        isEnabled ? null : styles.disabledButton,
      ]}
      testID={testID}
    >
      <Text
        style={
          tone === 'primary' ? styles.primaryButtonText : styles.quietButtonText
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

const CounterListRow = ({
  actions,
  counter,
  onPerform,
}: Readonly<{
  actions: ReadonlyArray<MultipleCountersV3ProgramAction>
  counter: CounterRow
  onPerform: (token: string) => void
}>) => (
  <View style={styles.row} testID={`counter-row-${counter.id}`}>
    <ActionButton
      actions={actions}
      label={counter.id}
      onPerform={onPerform}
      testID={`open-${counter.id}`}
      token={`open:${counter.id}`}
      tone="quiet"
    />
    <Text style={styles.count}>{counter.counter.count.toString()}</Text>
    <View style={styles.rowActions}>
      <ActionButton
        actions={actions}
        label="−"
        onPerform={onPerform}
        testID={`decrement-${counter.id}`}
        token={`decrement:${counter.id}`}
      />
      <ActionButton
        actions={actions}
        label="+"
        onPerform={onPerform}
        testID={`increment-${counter.id}`}
        token={`increment:${counter.id}`}
      />
      <ActionButton
        actions={actions}
        label="Details"
        onPerform={onPerform}
        testID={`details-${counter.id}`}
        token={`open:${counter.id}`}
        tone="quiet"
      />
      <ActionButton
        actions={actions}
        label="Delete"
        onPerform={onPerform}
        testID={`delete-${counter.id}`}
        token={`delete:${counter.id}`}
        tone="destructive"
      />
    </View>
  </View>
)

const FactStatus = ({ status }: Readonly<{ status: CounterFactStatus }>) =>
  M.value(status).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      LoadingCounterFact: () => (
        <Text style={styles.detail}>Loading counter fact…</Text>
      ),
      LoadedCounterFact: ({ fact }) => (
        <View style={styles.gap}>
          <Text style={styles.title}>
            {`Counter fact for ${fact.number.toString()}`}
          </Text>
          <Text style={styles.detail}>{fact.text}</Text>
        </View>
      ),
      FailedCounterFact: ({ reason }) => (
        <View style={styles.gap}>
          <Text style={styles.title}>Counter fact unavailable</Text>
          <Text style={styles.detail}>{reason}</Text>
        </View>
      ),
    }),
  )

const DetailMode = ({
  actions,
  counterId,
  mode,
  onPerform,
}: Readonly<{
  actions: ReadonlyArray<MultipleCountersV3ProgramAction>
  counterId: string
  mode: CounterDetailMode
  onPerform: (token: string) => void
}>) =>
  M.value(mode).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      CounterFactAlert: ({ status }) => (
        <View style={styles.modal}>
          <FactStatus status={status} />
          <ActionButton
            actions={actions}
            label="Dismiss"
            onPerform={onPerform}
            testID="dismiss-fact"
            token="dismiss"
          />
        </View>
      ),
      DeleteCounterConfirmation: () => (
        <View style={styles.modal}>
          <Text style={styles.title}>{`Delete ${counterId}?`}</Text>
          <Text style={styles.detail}>This cannot be undone.</Text>
          <View style={styles.rowActions}>
            <ActionButton
              actions={actions}
              label="Cancel"
              onPerform={onPerform}
              testID="cancel-delete"
              token="cancel"
              tone="quiet"
            />
            <ActionButton
              actions={actions}
              label="Delete counter"
              onPerform={onPerform}
              testID="confirm-delete"
              token="confirm-delete"
              tone="destructive"
            />
          </View>
        </View>
      ),
    }),
  )

const CounterDetail = ({
  actions,
  counter,
  maybeMode,
  onPerform,
}: Readonly<{
  actions: ReadonlyArray<MultipleCountersV3ProgramAction>
  counter: CounterRow
  maybeMode: Option.Option<CounterDetailMode>
  onPerform: (token: string) => void
}>) => (
  <View style={styles.gap}>
    <ActionButton
      actions={actions}
      label="← Counters"
      onPerform={onPerform}
      testID="back-to-counters"
      token="back"
      tone="quiet"
    />
    <Text style={styles.identity}>{counter.id}</Text>
    <Text style={styles.heroCount}>{counter.counter.count.toString()}</Text>
    {Option.isSome(maybeMode) ? (
      <DetailMode
        actions={actions}
        counterId={counter.id}
        mode={maybeMode.value}
        onPerform={onPerform}
      />
    ) : (
      <View style={styles.rowActions}>
        <ActionButton
          actions={actions}
          label="−"
          onPerform={onPerform}
          testID={`decrement-${counter.id}`}
          token={`decrement:${counter.id}`}
        />
        <ActionButton
          actions={actions}
          label="+"
          onPerform={onPerform}
          testID={`increment-${counter.id}`}
          token={`increment:${counter.id}`}
        />
        <ActionButton
          actions={actions}
          label="Reset"
          onPerform={onPerform}
          testID="reset-counter"
          token="reset"
          tone="quiet"
        />
        <ActionButton
          actions={actions}
          label="Show fact"
          onPerform={onPerform}
          testID="show-fact"
          token="fact"
        />
        <ActionButton
          actions={actions}
          label="Delete"
          onPerform={onPerform}
          testID="delete-counter"
          token="delete"
          tone="destructive"
        />
      </View>
    )}
  </View>
)

/** Renders the full Multiple Counters Program, including fact and delete modes. */
export const MultipleCountersV3NativeProgramScreen = ({
  isNavigationEnabled,
  model,
  onPerform,
}: ProgramScreenProps) => {
  const projected = multipleCountersV3ProgramActions(model, isNavigationEnabled)
  if (Result.isFailure(projected)) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Interaction projection failed</Text>
        <Text style={styles.detail}>{projected.failure._tag}</Text>
      </View>
    )
  }
  const actions = projected.success
  const destination = destinationForModel(model)
  const content = M.value(destination).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      CounterListDestination: ({ counters }) => (
        <View style={styles.gap}>
          <View style={styles.listHeading}>
            <Text style={styles.title}>Counters</Text>
            <ActionButton
              actions={actions}
              label="Add counter"
              onPerform={onPerform}
              testID="add-counter"
              token="add"
            />
          </View>
          {Array.map(counters, counter => (
            <CounterListRow
              actions={actions}
              counter={counter}
              key={counter.id}
              onPerform={onPerform}
            />
          ))}
        </View>
      ),
      CounterDetailDestination: ({ counter, maybeMode }) => (
        <CounterDetail
          actions={actions}
          counter={counter}
          maybeMode={maybeMode}
          onPerform={onPerform}
        />
      ),
    }),
  )
  return (
    <View style={styles.card}>
      <Text style={styles.label}>FOLDKIT PROGRAM</Text>
      <Text style={styles.path} testID="destination-uri">
        {navigationToPath(model.navigation)}
      </Text>
      {content}
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 14,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: '#111c2d',
    borderColor: '#25344a',
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 20,
  },
  count: {
    color: '#ffffff',
    fontSize: 28,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  destructiveButton: {
    backgroundColor: '#3a1820',
    borderColor: '#7a3140',
    borderWidth: 1,
  },
  detail: {
    color: '#aebbd0',
    fontSize: 15,
    lineHeight: 22,
  },
  disabledButton: {
    opacity: 0.35,
  },
  gap: {
    gap: 12,
  },
  heroCount: {
    color: '#ffffff',
    fontSize: 64,
    fontVariant: ['tabular-nums'],
    fontWeight: '200',
    letterSpacing: -3,
    textAlign: 'center',
  },
  identity: {
    color: '#f3f8ff',
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    color: '#78d8c0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  listHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  modal: {
    backgroundColor: '#0a1321',
    borderColor: '#32435b',
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  path: {
    color: '#8ae8cf',
    fontFamily: 'Menlo',
    fontSize: 13,
  },
  pressedButton: {
    opacity: 0.72,
  },
  primaryButton: {
    backgroundColor: '#8ae8cf',
  },
  primaryButtonText: {
    color: '#05241d',
    fontSize: 15,
    fontWeight: '800',
  },
  quietButton: {
    backgroundColor: '#1b293d',
    borderColor: '#354761',
    borderWidth: 1,
  },
  quietButtonText: {
    color: '#d8e4f4',
    fontSize: 15,
    fontWeight: '700',
  },
  row: {
    backgroundColor: '#0a1321',
    borderRadius: 16,
    gap: 10,
    padding: 14,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    color: '#f3f8ff',
    fontSize: 22,
    fontWeight: '800',
  },
})
