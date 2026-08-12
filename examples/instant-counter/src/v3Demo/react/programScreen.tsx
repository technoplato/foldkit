import {
  type CounterDetailMode,
  type CounterFactStatus,
  type CounterRow,
  type Model,
  destinationForModel,
} from 'counters-core-example'
import { Array, Match as M, Option, Result } from 'effect'
import { type ReactNode } from 'react'

import {
  type MultipleCountersV3ProgramAction,
  multipleCountersV3ProgramActionForToken,
  multipleCountersV3ProgramActions,
} from '../client/programView.js'

type ProgramScreenProps = Readonly<{
  isNavigationEnabled: boolean
  model: Model
  onPerform: (token: string) => void
  path: string
}>

type ActionButtonProps = Readonly<{
  actions: ReadonlyArray<MultipleCountersV3ProgramAction>
  className: string
  label: string
  onPerform: (token: string) => void
  token: string
}>

const ActionButton = ({
  actions,
  className,
  label,
  onPerform,
  token,
}: ActionButtonProps) => {
  const maybeAction = multipleCountersV3ProgramActionForToken(actions, token)
  if (Option.isNone(maybeAction)) {
    return null
  }
  return (
    <button
      aria-label={
        maybeAction.value.isEnabled ? label : `${label} unavailable`
      }
      className={className}
      disabled={!maybeAction.value.isEnabled}
      onClick={() => onPerform(token)}
      type="button"
    >
      {label}
    </button>
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
  <article className="v3-counter-row">
    <ActionButton
      actions={actions}
      className="v3-counter-identity"
      label={counter.id}
      onPerform={onPerform}
      token={`open:${counter.id}`}
    />
    <output className="v3-counter-value">
      {counter.counter.count.toString()}
    </output>
    <div className="v3-row-actions">
      <ActionButton
        actions={actions}
        className="v3-counter-button"
        label="−"
        onPerform={onPerform}
        token={`decrement:${counter.id}`}
      />
      <ActionButton
        actions={actions}
        className="v3-counter-button"
        label="+"
        onPerform={onPerform}
        token={`increment:${counter.id}`}
      />
      <ActionButton
        actions={actions}
        className="v3-secondary-button"
        label="Details"
        onPerform={onPerform}
        token={`open:${counter.id}`}
      />
      <ActionButton
        actions={actions}
        className="v3-destructive-button"
        label="Delete"
        onPerform={onPerform}
        token={`delete:${counter.id}`}
      />
    </div>
  </article>
)

const FactStatus = ({ status }: Readonly<{ status: CounterFactStatus }>) =>
  M.value(status).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      LoadingCounterFact: () => <p>Loading counter fact…</p>,
      LoadedCounterFact: ({ fact }) => (
        <div>
          <h2>{`Counter fact for ${fact.number.toString()}`}</h2>
          <p>{fact.text}</p>
        </div>
      ),
      FailedCounterFact: ({ reason }) => (
        <div>
          <h2>Counter fact unavailable</h2>
          <p>{reason}</p>
        </div>
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
        <aside aria-label="Counter fact" className="v3-modal v3-fact-modal">
          <FactStatus status={status} />
          <ActionButton
            actions={actions}
            className="v3-primary-button"
            label="Dismiss"
            onPerform={onPerform}
            token="dismiss"
          />
        </aside>
      ),
      DeleteCounterConfirmation: () => (
        <aside
          aria-label="Delete counter confirmation"
          className="v3-modal v3-delete-modal"
        >
          <h2>{`Delete ${counterId}?`}</h2>
          <p>This cannot be undone.</p>
          <div className="v3-modal-actions">
            <ActionButton
              actions={actions}
              className="v3-secondary-button"
              label="Cancel"
              onPerform={onPerform}
              token="cancel"
            />
            <ActionButton
              actions={actions}
              className="v3-destructive-button"
              label="Delete counter"
              onPerform={onPerform}
              token="confirm-delete"
            />
          </div>
        </aside>
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
  <section className="v3-counter-detail">
    <ActionButton
      actions={actions}
      className="v3-back-button"
      label="← Counters"
      onPerform={onPerform}
      token="back"
    />
    <p className="v3-detail-identity">{counter.id}</p>
    <output className="v3-detail-value">
      {counter.counter.count.toString()}
    </output>
    {Option.isSome(maybeMode) ? (
      <DetailMode
        actions={actions}
        counterId={counter.id}
        mode={maybeMode.value}
        onPerform={onPerform}
      />
    ) : (
      <div className="v3-detail-actions">
        <ActionButton
          actions={actions}
          className="v3-counter-button"
          label="−"
          onPerform={onPerform}
          token={`decrement:${counter.id}`}
        />
        <ActionButton
          actions={actions}
          className="v3-counter-button"
          label="+"
          onPerform={onPerform}
          token={`increment:${counter.id}`}
        />
        <ActionButton
          actions={actions}
          className="v3-secondary-button"
          label="Reset"
          onPerform={onPerform}
          token="reset"
        />
        <ActionButton
          actions={actions}
          className="v3-primary-button"
          label="Show counter fact"
          onPerform={onPerform}
          token="fact"
        />
        <ActionButton
          actions={actions}
          className="v3-destructive-button"
          label="Delete counter"
          onPerform={onPerform}
          token="delete"
        />
      </div>
    )}
  </section>
)

/** Renders the full Multiple Counters Program, including fact and delete modes. */
export const MultipleCountersV3ReactProgramScreen = ({
  isNavigationEnabled,
  model,
  onPerform,
  path,
}: ProgramScreenProps) => {
  const projected = multipleCountersV3ProgramActions(
    model,
    isNavigationEnabled,
  )
  if (Result.isFailure(projected)) {
    return (
      <section className="v3-program-shell">
        <h1>Interaction projection failed</h1>
        <p className="error">{projected.failure._tag}</p>
      </section>
    )
  }
  const actions = projected.success
  const destination = destinationForModel(model)
  const content = M.value(destination).pipe(
    M.withReturnType<ReactNode>(),
    M.tagsExhaustive({
      CounterListDestination: ({ counters }) => (
        <section className="v3-counter-list">
          <div className="v3-list-heading">
            <h2>Counters</h2>
            <ActionButton
              actions={actions}
              className="v3-primary-button"
              label="Add counter"
              onPerform={onPerform}
              token="add"
            />
          </div>
          {Array.map(counters, counter => (
            <CounterListRow
              actions={actions}
              counter={counter}
              key={counter.id}
              onPerform={onPerform}
            />
          ))}
        </section>
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
    <section className="v3-program-shell">
      <header className="v3-program-header">
        <div>
          <p className="eyebrow">Foldkit Program | React Instant</p>
          <h1>Multiple counters</h1>
          <p className="muted">
            Optimistic here. Authenticated and accepted everywhere.
          </p>
        </div>
        <code className="v3-destination-uri">{path}</code>
      </header>
      {content}
    </section>
  )
}
